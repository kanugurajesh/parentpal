import type { PState } from "@/components/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Button, Disclaimer, ErrorNote, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { NOTIFICATIONS_SUPPORTED, setAccountNotifications, turnOnNotifications, updatePrefs, useNotificationState } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";

const PRIMER_POINTS = [
  "An idea at the moment it's useful, like sleep tips before bedtime",
  "A check-in the morning after you try something",
  "A gentle nudge if a few days pass without a note",
];

/** Shown when the account switch in Settings is off: says so, and offers to turn it back on. */
function TurnedOffCard() {
  const qc = useQueryClient();
  const { refreshMe } = useSession();
  const [busy, setBusy] = useState(false);
  return (
    <View style={{ backgroundColor: color.paperDeep, borderRadius: radius.card, padding: space.xl, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.card, alignItems: "center", justifyContent: "center" }}>
          <Icon name="bell" size={22} color={color.inkMuted} />
        </View>
        <T variant="h3" style={{ flex: 1 }}>
          Notifications are off
        </T>
      </View>
      <T color={color.inkSoft}>No new daily ideas or reminders. Earlier ideas are still below.</T>
      <Button
        label="Turn on"
        kind="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          try {
            await setAccountNotifications(true);
            await Promise.all([refreshMe(), qc.invalidateQueries({ queryKey: ["notifications"] })]);
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

/** Explains the value before the OS permission prompt, which only appears after "Turn on". */
function TurnOnCard() {
  const { prefs, loaded } = useNotificationState();
  if (!NOTIFICATIONS_SUPPORTED || !loaded || prefs.enabled || prefs.primerDismissed) return null;
  return (
    <View style={{ backgroundColor: color.mossTint, borderRadius: radius.card, padding: space.xl, gap: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.card, alignItems: "center", justifyContent: "center" }}>
          <Icon name="bell" size={22} color={color.moss} />
        </View>
        <T variant="h3" style={{ flex: 1 }}>
          Get ideas when they're useful
        </T>
      </View>
      <View style={{ gap: space.sm }}>
        {PRIMER_POINTS.map((p) => (
          <View key={p} style={{ flexDirection: "row", gap: space.sm }}>
            <Icon name="check" size={18} color={color.moss} />
            <T variant="small" style={{ flex: 1 }}>
              {p}
            </T>
          </View>
        ))}
      </View>
      <T variant="tiny" color={color.inkSoft}>
        At most one a day, never at night. You can change this anytime in Settings.
      </T>
      <View style={{ gap: space.xs }}>
        <Button label="Turn on" onPress={() => turnOnNotifications()} />
        <Button label="Not now" kind="ghost" onPress={() => updatePrefs({ primerDismissed: true })} />
      </View>
    </View>
  );
}

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const read = useMutation({ mutationFn: api.readNotification, onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const list = q.data?.notifications ?? [];
  const { me } = useSession();
  const off = me?.user.notificationsEnabled === false;

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={color.moss} />}>
      <View style={{ paddingTop: space.lg, gap: space.lg }}>
        <T variant="h1" accessibilityRole="header">
          Notifications
        </T>
        {off ? <TurnedOffCard /> : <TurnOnCard />}
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
        {q.data && !list.length && !off ? (
          <View style={{ alignItems: "center", paddingVertical: space.xxxl, gap: space.md }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color.paperDeep, alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={32} color={color.inkMuted} />
            </View>
            <T variant="h3">No new notifications</T>
            <T color={color.inkMuted} style={{ textAlign: "center", maxWidth: 300 }}>
              A personalized tip arrives here each morning, based on your goals.
            </T>
          </View>
        ) : null}
        {list.map((n) => {
          const unread = !n.readAt;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${unread ? "Unread. " : ""}${n.title}. ${n.body}`}
              onPress={() => {
                if (unread) read.mutate(n.id);
                if (n.goalSlug) router.push({ pathname: "/goal/[slug]", params: { slug: n.goalSlug } });
              }}
              style={({ pressed, focused }: PState) => [
                {
                  backgroundColor: unread ? color.card : "transparent",
                  borderRadius: radius.card,
                  padding: space.lg,
                  gap: space.xs,
                  borderWidth: 1.5,
                  borderColor: unread ? color.apricot : color.line,
                  opacity: pressed ? 0.85 : 1,
                },
                focused && ui.focusRing,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.apricot }} /> : null}
                <T variant="tiny" color={color.inkMuted}>
                  {new Date(`${n.forDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </T>
              </View>
              <T variant="bodyStrong">{n.title}</T>
              <T color={color.inkSoft}>{n.body}</T>
            </Pressable>
          );
        })}
        {list.length ? <Disclaimer /> : null}
      </View>
    </Screen>
  );
}
