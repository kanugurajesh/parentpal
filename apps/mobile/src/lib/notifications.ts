import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "./expoNotifications";
import { router } from "expo-router";
import { useEffect, useSyncExternalStore } from "react";
import { isRunningInExpoGo } from "expo";
import { AppState, Linking, Platform } from "react-native";
import { api } from "./api";
import { confirm, type ConfirmOptions } from "./confirm";
import { addDaysISO, localDateISO } from "./dates";
import { planNotifications, type CheckIn, type NotificationData, type NotificationPrefs } from "./notificationPlan";
import { storage } from "./storage";

export { DAILY_TIME_OPTIONS, type DailyTime } from "./notificationPlan";

/**
 * Notifications are scheduled on the device, a few days ahead, every time the app opens or a
 * setting changes. Nothing goes through a push server, so they work in Expo Go and no notification
 * text leaves the phone. Three kinds, at most one per day, never between 21:00 and 07:00:
 *
 *  - check-in: the morning after "I'll try this" on a win, asks how it went → opens the moment log
 *  - log reminder: once, after QUIET_DAYS without a logged moment
 *  - daily idea: the server's tip for that day, at a time it can actually be used
 */

/**
 * Local notifications don't exist on web, and Android Expo Go (SDK 53+) ships expo-notifications
 * without its channel provider, so nothing can be shown there. iOS Expo Go and real builds work.
 */
const ANDROID_EXPO_GO = Platform.OS === "android" && isRunningInExpoGo();
export const NOTIFICATIONS_SUPPORTED = Platform.OS !== "web" && !ANDROID_EXPO_GO;
/** Why notifications are unavailable here, for the UI; null when they are supported. */
export const NOTIFICATIONS_UNAVAILABLE_REASON = NOTIFICATIONS_SUPPORTED
  ? null
  : ANDROID_EXPO_GO
    ? "Expo Go on Android can't show notifications. They work in a development build or the installed app."
    : "Notifications are available in the iOS and Android app.";

const CHANNEL_ID = "reminders";

const PREFS_KEY = "parentpal.notificationPrefs";
const CHECKINS_KEY = "parentpal.checkIns";
const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  dailyIdea: true,
  dailyTime: "smart",
  checkIns: true,
  logReminders: true,
  primerDismissed: false,
};

if (NOTIFICATIONS_SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/* ---------------- Store (prefs + pending check-ins, persisted on device) ---------------- */

type State = { prefs: NotificationPrefs; checkIns: CheckIn[]; loaded: boolean };
let state: State = { prefs: DEFAULT_PREFS, checkIns: [], loaded: false };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let loading: Promise<void> | null = null;
function load() {
  loading ??= (async () => {
    const parse = async <T,>(key: string, fallback: T): Promise<T> => {
      try {
        const raw = await storage.get(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
      } catch {
        return fallback;
      }
    };
    const [prefs, checkIns] = await Promise.all([parse(PREFS_KEY, {}), parse<CheckIn[]>(CHECKINS_KEY, [])]);
    setState({ prefs: { ...DEFAULT_PREFS, ...prefs }, checkIns, loaded: true });
  })();
  return loading;
}

const saveCheckIns = (checkIns: CheckIn[]) => {
  setState({ checkIns });
  return storage.set(CHECKINS_KEY, JSON.stringify(checkIns));
};

export function useNotificationState() {
  useEffect(() => {
    void load();
  }, []);
  return useSyncExternalStore(subscribe, () => state);
}

export async function updatePrefs(patch: Partial<NotificationPrefs>) {
  await load();
  const prefs = { ...state.prefs, ...patch };
  setState({ prefs });
  await storage.set(PREFS_KEY, JSON.stringify(prefs));
  await syncNotifications();
}

/* ---------------- Permission ---------------- */

async function ensureChannel() {
  // Android 13+ only shows the permission prompt once a channel exists.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name: "Ideas and check-ins", importance: Notifications.AndroidImportance.DEFAULT });
  }
}

/** Asks for permission (only if the OS still allows asking) and turns notifications on. False if refused. */
export async function enableNotifications(): Promise<"granted" | "denied" | "failed"> {
  if (!NOTIFICATIONS_SUPPORTED) return "failed";
  try {
    await ensureChannel();
    let { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (!granted && canAskAgain) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return "denied";
    await updatePrefs({ enabled: true });
    return "granted";
  } catch (e) {
    console.warn("[notifications] couldn't enable", e);
    return "failed";
  }
}

/**
 * The in-context way to turn notifications on: optionally explain first, then ask the OS. If the
 * OS has already refused (it won't prompt again), offer to open the system settings instead.
 */
export async function turnOnNotifications(explain?: ConfirmOptions): Promise<boolean> {
  if (explain && !(await confirm(explain))) return false;
  const result = await enableNotifications();
  if (result === "granted") return true;
  if (result === "failed") {
    await confirm({
      title: "Couldn't turn on notifications",
      message: NOTIFICATIONS_UNAVAILABLE_REASON ?? "Something went wrong setting up notifications on this phone. Please try again later.",
      confirmLabel: "OK",
      cancelLabel: null,
      icon: "bell",
    });
    return false;
  }
  const open = await confirm({
    title: "Notifications are off",
    message: "Your phone isn't letting ParentPal send notifications. You can allow them in Settings.",
    confirmLabel: "Open settings",
    cancelLabel: "Not now",
    icon: "bell",
  });
  if (open) await Linking.openSettings();
  return false;
}

/**
 * The account-level switch, stored on the server so it works everywhere (including web and Android
 * Expo Go, where only the in-app inbox exists). Off stops new daily ideas and cancels phone alerts.
 */
export async function setAccountNotifications(on: boolean) {
  await api.updateMe({ notificationsEnabled: on });
  if (!on) await updatePrefs({ enabled: false });
  // Alerts cancelled while it was off come back now, not on the next foreground.
  else void syncNotifications();
}

export async function hasPermission() {
  return NOTIFICATIONS_SUPPORTED && (await Notifications.getPermissionsAsync()).granted;
}

/* ---------------- Check-ins ---------------- */

/** The outcome was reported in the app, so tomorrow's "How did it go?" would only repeat the question. */
export async function removeCheckIn(match: { winId?: string; tryId?: string }) {
  await load();
  const hit = (c: CheckIn) => (match.winId !== undefined && c.winId === match.winId) || (match.tryId !== undefined && c.tryId === match.tryId);
  if (!state.checkIns.some(hit)) return;
  await saveCheckIns(state.checkIns.filter((c) => !hit(c)));
  await syncNotifications();
}

export async function addCheckIn(win: { id: string; title: string }, goalSlug: string, tryId?: string, child?: { id: string; nickname: string }) {
  await load();
  const dueDate = addDaysISO(localDateISO(), 1);
  // One check-in per win and child: trying the same win with both children asks about each.
  const same = (c: CheckIn) => c.winId === win.id && c.childId === child?.id;
  await saveCheckIns([
    ...state.checkIns.filter((c) => !same(c)),
    { winId: win.id, winTitle: win.title, goalSlug, tryId, childId: child?.id, childName: child?.nickname, dueDate },
  ]);
  await syncNotifications();
}

/** On sign-out: nothing scheduled for the previous profile may fire. Device-level prefs are kept. */
export async function clearScheduledNotifications() {
  if (!NOTIFICATIONS_SUPPORTED) return;
  await load();
  await saveCheckIns([]);
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/* ---------------- Scheduling ---------------- */

async function doSync() {
  if (!NOTIFICATIONS_SUPPORTED) return;
  await load();
  const today = localDateISO();
  const live = state.checkIns.filter((c) => c.dueDate >= today);
  if (live.length !== state.checkIns.length) await saveCheckIns(live);

  const { prefs } = state;
  if (!prefs.enabled || !(await hasPermission())) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  const [me, tips, moments] = await Promise.all([
    api.me().catch(() => null),
    prefs.dailyIdea ? api.upcomingTips().then((r) => r.notifications, () => []) : Promise.resolve([]),
    prefs.logReminders ? api.moments().then((r) => r.moments, () => null) : Promise.resolve(null),
  ]);
  const latest = moments?.length ? moments.reduce((a, m) => (m.createdAt > a ? m.createdAt : a), moments[0].createdAt) : me?.user.createdAt;
  const plan = planNotifications({
    prefs,
    now: new Date(),
    checkIns: live,
    tips,
    child: me?.children.length ? me.children.map((c) => c.nickname).join(" or ") : undefined,
    lastActivity: moments && latest ? localDateISO(new Date(latest)) : null,
  });

  // Plan first, then replace: if the API is unreachable, keep what was already scheduled.
  if (!me) return;
  if (!me.user.notificationsEnabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }
  await ensureChannel();
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const p of plan) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, data: p.data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL_ID },
    });
  }
}

let running: Promise<void> = Promise.resolve();
/** Re-plans the next days. Runs are queued so overlapping calls never interleave cancel/schedule. */
export function syncNotifications(): Promise<void> {
  running = running.catch(() => {}).then(doSync);
  return running.catch((e) => console.warn("[notifications] sync failed", e));
}

/* ---------------- Hooks for the signed-in app shell ---------------- */

/** Keeps the schedule fresh: on mount and whenever the app comes back to the foreground. */
export function useNotificationSync(active: boolean) {
  useEffect(() => {
    if (!active || !NOTIFICATIONS_SUPPORTED) return;
    void syncNotifications();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void syncNotifications();
    });
    return () => sub.remove();
  }, [active]);
}

// Fixed per platform, so hook order never changes between renders.
const useLastResponse = NOTIFICATIONS_SUPPORTED ? Notifications.useLastNotificationResponse : () => null;

/** Opens the right screen when a notification is tapped (also when it launched the app). */
export function useNotificationTaps(active: boolean) {
  const qc = useQueryClient();
  const response = useLastResponse();
  useEffect(() => {
    if (!active || !NOTIFICATIONS_SUPPORTED || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    Notifications.clearLastNotificationResponse();
    const data = response.notification.request.content.data as NotificationData | undefined;
    if (data?.kind === "tip") {
      api
        .readNotification(data.notificationId)
        .then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))
        .catch(() => {});
      if (data.goalSlug) router.push({ pathname: "/goal/[slug]", params: { slug: data.goalSlug } });
      else router.navigate("/(tabs)/notifications");
    } else if (data?.kind === "checkin") {
      router.push({ pathname: "/moment/new", params: { tried: data.winTitle, ...(data.tryId ? { tryId: data.tryId } : {}) } });
    } else if (data?.kind === "log") {
      router.push("/moment/new");
    }
  }, [active, response, qc]);
}
