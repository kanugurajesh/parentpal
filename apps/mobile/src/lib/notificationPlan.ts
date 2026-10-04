import type { Notification } from "@parentpal/shared";
import { addDaysISO, atLocalTime, localDateISO } from "./dates";

/** Pure planning for on-device notifications (no React Native imports, so it runs under plain Node). */

export type DailyTime = "smart" | "morning" | "midday" | "evening";

export interface NotificationPrefs {
  enabled: boolean;
  dailyIdea: boolean;
  dailyTime: DailyTime;
  checkIns: boolean;
  logReminders: boolean;
  primerDismissed: boolean;
}

export interface CheckIn {
  winId: string;
  winTitle: string;
  goalSlug: string;
  /** The server-side try this check-in asks about. Missing on check-ins saved before tracking existed. */
  tryId?: string;
  /** Who the win was tried with. Missing on check-ins saved before children could be switched. */
  childId?: string;
  childName?: string;
  /** Local date the check-in fires. */
  dueDate: string;
}

export type NotificationData =
  | { kind: "tip"; notificationId: string; goalSlug: string | null }
  | { kind: "checkin"; winTitle: string; goalSlug: string; tryId?: string }
  | { kind: "log" };

export const DAILY_TIME_OPTIONS: { value: DailyTime; label: string }[] = [
  { value: "smart", label: "Smart" },
  { value: "morning", label: "Morning" },
  { value: "midday", label: "Midday" },
  { value: "evening", label: "Evening" },
];
const FIXED_TIMES: Record<Exclude<DailyTime, "smart">, string> = { morning: "08:00", midday: "12:30", evening: "18:30" };
/** "Smart" sends an idea when it can be used: sleep before bedtime, eating before dinner, the rest in the morning. */
const SMART_TIMES: Record<string, string> = { sleep: "18:30", "picky-eating": "16:30" };
const DEFAULT_TIME = "08:00";
const CHECK_IN_TIME = "08:30";
const LOG_REMINDER_TIME = "19:30";
const QUIET_DAYS = 3;
/** Matches the server's cap on upcoming tips. If the app isn't opened for this long, notifications stop. */
const HORIZON_DAYS = 3;

type Planned = { at: Date; title: string; body: string; data: NotificationData };

/** Pure: which notification (if any) fires on each of the next days. Priority: check-in, log reminder, idea. */
export function planNotifications(input: {
  prefs: NotificationPrefs;
  now: Date;
  checkIns: CheckIn[];
  tips: Notification[];
  /** The family's child or children ("Mo" or "Mo or Ada"), for the reminder to log a moment. */
  child?: string;
  /** Local date of the last logged moment (or sign-up); null skips the log reminder. */
  lastActivity: string | null;
}): Planned[] {
  const { prefs, now, child } = input;
  const today = localDateISO(now);
  const reminderDay = input.lastActivity ? addDaysISO(input.lastActivity, QUIET_DAYS) : null;
  const plan: Planned[] = [];

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDaysISO(today, i);
    const candidates: Planned[] = [];

    const checkIn = prefs.checkIns ? input.checkIns.find((c) => c.dueDate === day) : undefined;
    if (checkIn) {
      const who = checkIn.childName ?? child;
      candidates.push({
        at: atLocalTime(day, CHECK_IN_TIME),
        title: `How did "${checkIn.winTitle}" go?`,
        body: `Tap to note what happened${who ? ` with ${who}` : ""}. One line is enough, and it helps spot patterns.`,
        data: { kind: "checkin", winTitle: checkIn.winTitle, goalSlug: checkIn.goalSlug, tryId: checkIn.tryId },
      });
    }
    if (prefs.logReminders && day === reminderDay) {
      candidates.push({
        at: atLocalTime(day, LOG_REMINDER_TIME),
        title: child ? `Anything happen with ${child} lately?` : "Anything happen lately?",
        body: "A one-line note is enough. Moments are how ParentPal spots patterns.",
        data: { kind: "log" },
      });
    }
    const tip = prefs.dailyIdea ? input.tips.find((t) => t.forDate === day) : undefined;
    if (tip) {
      const time = prefs.dailyTime === "smart" ? (SMART_TIMES[tip.goalSlug ?? ""] ?? DEFAULT_TIME) : FIXED_TIMES[prefs.dailyTime];
      candidates.push({ at: atLocalTime(day, time), title: tip.title, body: tip.body, data: { kind: "tip", notificationId: tip.id, goalSlug: tip.goalSlug } });
    }

    // One per day: the highest-priority one that is still in the future.
    const next = candidates.find((c) => c.at.getTime() > now.getTime() + 60_000);
    if (next) plan.push(next);
  }
  return plan;
}

