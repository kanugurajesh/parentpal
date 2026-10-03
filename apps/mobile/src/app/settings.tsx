import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import { SubHeader } from "@/components/SubHeader";
import { Button, Chip, ErrorNote, Screen, T } from "@/components/ui";
import {
  DAILY_TIME_OPTIONS,
  NOTIFICATIONS_SUPPORTED,
  NOTIFICATIONS_UNAVAILABLE_REASON,
  setAccountNotifications,
  turnOnNotifications,
  updatePrefs,
  useNotificationState,
  type DailyTime,
} from "@/lib/notifications";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";
import { confirm } from "@/lib/confirm";

const TIME_HINT: Record<DailyTime, string> = {
  smart: "Sleep ideas at 6:30 pm before bedtime, eating ideas at 4:30 pm before dinner, the rest at 8:00 am.",
  morning: "Every idea at 8:00 am.",
  midday: "Every idea at 12:30 pm.",
  evening: "Every idea at 6:30 pm.",
};

function ToggleRow({
  title,
  hint,
  value,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{title}</T>
        <T variant="small" color={color.inkMuted}>
          {hint}
        </T>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: color.line, true: color.moss }}
        thumbColor={color.white}
        ios_backgroundColor={color.line}
      />
    </View>
  );
}

function NotificationSettings() {
  const qc = useQueryClient();
  const { me, refreshMe } = useSession();
  const { prefs, loaded } = useNotificationState();
  // Shown while the server saves, so the switch responds instantly.
  const [pending, setPending] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!loaded || !me) return null;
  const accountOn = pending ?? me.user.notificationsEnabled;

  async function setAccount(on: boolean) {
    setPending(on);
    setError(null);
    try {
      await setAccountNotifications(on);
      await Promise.all([refreshMe(), qc.invalidateQueries({ queryKey: ["notifications"] })]);
      if (on && NOTIFICATIONS_SUPPORTED && !prefs.enabled) await turnOnNotifications();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.xl, gap: space.lg, borderWidth: 1.5, borderColor: color.line }}>
      <T variant="h3">Notifications</T>
      <ToggleRow
        title="Notifications"
        hint={accountOn ? "A daily idea from your goals in the Notifications tab, plus any reminders below." : "Off. No new ideas or reminders until you turn this back on."}
        value={accountOn}
        disabled={pending !== null}
        onChange={setAccount}
      />
      {error ? <ErrorNote message={error} /> : null}
      {!accountOn ? null : !NOTIFICATIONS_SUPPORTED ? (
        <T variant="small" color={color.inkMuted}>
          Phone alerts: {NOTIFICATIONS_UNAVAILABLE_REASON}
        </T>
      ) : (
        <>
          <View style={{ height: 1, backgroundColor: color.line }} />
          <ToggleRow
            title="Phone alerts"
            hint="At most one a day, never between 9 pm and 7 am."
            value={prefs.enabled}
            onChange={(on) => (on ? turnOnNotifications() : updatePrefs({ enabled: false }))}
          />
          {prefs.enabled ? (
            <>
              <ToggleRow title="Daily idea" hint="One idea from your goals." value={prefs.dailyIdea} onChange={(v) => updatePrefs({ dailyIdea: v })} />
              {prefs.dailyIdea ? (
                <View style={{ gap: space.sm }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Daily idea time">
                    {DAILY_TIME_OPTIONS.map((o) => (
                      <Chip key={o.value} label={o.label} selected={prefs.dailyTime === o.value} onPress={() => updatePrefs({ dailyTime: o.value })} />
                    ))}
                  </View>
                  <T variant="small" color={color.inkMuted}>
                    {TIME_HINT[prefs.dailyTime]}
                  </T>
                </View>
              ) : null}
              <ToggleRow
                title="Check-ins"
                hint={`The morning after you tap "I'll try this" on a win.`}
                value={prefs.checkIns}
                onChange={(v) => updatePrefs({ checkIns: v })}
              />
              <ToggleRow
                title="Logging reminders"
                hint="Once, after 3 days without a moment."
                value={prefs.logReminders}
                onChange={(v) => updatePrefs({ logReminders: v })}
              />
              <T variant="tiny" color={color.inkMuted}>
                Scheduled on this phone a few days ahead, so nothing passes through a push server. If you don't open ParentPal for a few days, they pause.
              </T>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

export default function Settings() {
  const { signOut, me } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deleteAccount() {
    const ok = await confirm({
      title: "Delete your account?",
      message:
        "This permanently deletes your family profile, children, moments, patterns, chats, bookmarks and notifications from our server. This can't be undone.",
      confirmLabel: "Delete everything",
      cancelLabel: "Keep my account",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteMe();
      await signOut();
      router.replace("/onboarding");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Screen>
      <SubHeader title="Settings" />
      <View style={{ gap: space.xl }}>
        <NotificationSettings />
        <View style={{ gap: space.sm }}>
          <T variant="h3">What we store</T>
          <T color={color.inkSoft}>
            Your first name and role, each child's nickname and birth month and year (never the full date), your goals, the moments you log, and your Ask conversations. LLM usage is logged as token counts and cost only, never the text.
          </T>
        </View>
        <View style={{ backgroundColor: color.dangerTint, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
          <T variant="h3" color={color.danger}>
            Delete account
          </T>
          <T color={color.ink}>
            Removes everything above for {me?.user.firstName ?? "this profile"}, immediately and permanently.
          </T>
          {error ? <ErrorNote message={error} /> : null}
          <Button label="Delete account" kind="danger" loading={busy} onPress={deleteAccount} />
        </View>
      </View>
    </Screen>
  );
}
