import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import type { Win, WorkedOutcome } from "@parentpal/shared";
import { GoalArt } from "@/components/GoalArt";
import { Icon } from "@/components/Icon";
import { AdviceNote, OutcomePicker, ProgressCard } from "@/components/Progress";
import { Button, ErrorNote, IconButton, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import {
  addCheckIn,
  hasPermission,
  NOTIFICATIONS_SUPPORTED,
  removeCheckIn,
  setAccountNotifications,
  turnOnNotifications,
  updatePrefs,
  useNotificationState,
} from "@/lib/notifications";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useActiveChild, useSession } from "@/lib/session";
import { categoryColor, color, radius, space } from "@/theme/tokens";

/**
 * Commits to trying a win. The try is saved on the server (so progress works everywhere); where the
 * phone can show notifications, a check-in also asks the next morning how it went.
 */
function TryThis({ win, goalSlug }: { win: Win; goalSlug: string }) {
  const qc = useQueryClient();
  const { prefs } = useNotificationState();
  const { me, refreshMe } = useSession();
  const child = useActiveChild();
  const openTryId = win.mine?.openTryId ?? null;
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["goal", goalSlug] }), qc.invalidateQueries({ queryKey: ["progress"] })]);

  const start = useMutation({
    mutationFn: async () => {
      const t = await api.startTry(win.id, child?.id);
      await refresh();
      if (!NOTIFICATIONS_SUPPORTED) return;
      // With the account switch off nothing is scheduled, so a pending check-in would never arrive.
      const accountOn = me?.user.notificationsEnabled !== false;
      if (!accountOn || !prefs.enabled || !prefs.checkIns || !(await hasPermission())) {
        const on = await turnOnNotifications({
          title: "Check in tomorrow?",
          message: "We'll send one reminder tomorrow morning asking how it went. You can also tap how it went right here, any time.",
          confirmLabel: "Remind me",
          cancelLabel: "Not now",
          icon: "bell",
        });
        if (!on) return;
        if (!prefs.checkIns) await updatePrefs({ checkIns: true });
        if (!accountOn) {
          await setAccountNotifications(true);
          await refreshMe();
        }
      }
      await addCheckIn(win, goalSlug, t.id, child ?? undefined);
    },
  });

  const report = useMutation({
    mutationFn: async (outcome: WorkedOutcome) => {
      await api.reportOutcome(openTryId!, { outcome });
      // By try, not win: the other child may have a check-in for the same win.
      await removeCheckIn({ tryId: openTryId! });
      await refresh();
    },
  });

  if (openTryId) {
    return (
      <View style={{ gap: space.sm, backgroundColor: color.mossTint, borderRadius: radius.inner, padding: space.md }} accessibilityLiveRegion="polite">
        <T variant="smallStrong">You're trying this. Once you have, how did it go?</T>
        <OutcomePicker onPick={(o) => report.mutate(o)} disabled={report.isPending} />
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push({ pathname: "/moment/new", params: { tried: win.title, tryId: openTryId, goal: goalSlug } })}
        >
          <T variant="small" color={color.moss} style={{ textDecorationLine: "underline" }}>
            Add a note about what happened
          </T>
        </Pressable>
        {report.error ? <ErrorNote message={(report.error as Error).message} /> : null}
      </View>
    );
  }
  return (
    <>
      <Button
        label="I'll try this"
        kind="secondary"
        icon="check"
        loading={start.isPending}
        accessibilityHint="Tracks this win so you can say how it went"
        onPress={() => start.mutate()}
      />
      {start.error ? <ErrorNote message={(start.error as Error).message} /> : null}
    </>
  );
}

function WinCard({ win, accent, goalSlug }: { win: Win; accent: string; goalSlug: string }) {
  if (win.locked) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: color.paperDeep }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color.card, alignItems: "center", justifyContent: "center" }}>
          <Icon name="lock" size={16} color={color.inkMuted} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="tiny" color={color.inkMuted}>
            Win {win.position}
          </T>
          <T variant="bodyStrong" color={color.inkSoft}>
            {win.title}
          </T>
        </View>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.xl, gap: space.lg, borderWidth: 1.5, borderColor: color.line }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: accent, alignItems: "center", justifyContent: "center" }}>
          <T variant="smallStrong" color={color.white}>
            {win.position}
          </T>
        </View>
        <T variant="h3" style={{ flex: 1 }}>
          {win.title}
        </T>
      </View>
      <View style={{ gap: space.xs }}>
        <T variant="smallStrong" color={color.inkMuted}>
          Try this
        </T>
        <T>{win.action}</T>
      </View>
      <View style={{ borderLeftWidth: 4, borderColor: color.apricot, backgroundColor: color.apricotTint, borderRadius: radius.inner, padding: space.lg, gap: space.xs }}>
        <T variant="smallStrong" color="#8A4B12">
          Say this
        </T>
        <T variant="h3" style={{ fontSize: 18, lineHeight: 25 }}>
          {win.script}
        </T>
      </View>
      <View style={{ gap: space.xs }}>
        <T variant="smallStrong" color={color.inkMuted}>
          What to expect
        </T>
        <T color={color.inkSoft}>{win.whatToExpect}</T>
      </View>
      {win.mine?.tried ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <Icon name="check" size={18} color={color.moss} />
          <T variant="smallStrong" color={color.moss}>
            You tried this {win.mine.tried}× · helped {win.mine.helped}
          </T>
        </View>
      ) : null}
      {win.mine?.advice ? (
        <AdviceNote
          advice={win.mine.advice}
          action={
            win.mine.advice.kind === "ask" ? (
              <Button
                label="Ask ParentPal"
                kind="ghost"
                icon="ask"
                onPress={() => router.navigate({ pathname: "/(tabs)/ask", params: { topic: goalSlug } })}
                style={{ alignSelf: "flex-start" }}
              />
            ) : undefined
          }
        />
      ) : null}
      {win.community ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.mossTint, borderRadius: radius.inner, padding: space.md }}>
          <Icon name="people" size={20} color={color.moss} />
          <T variant="small" style={{ flex: 1 }}>
            <T variant="smallStrong">Parents like you: </T>
            {win.community.helped} of {win.community.tried} who tried this said it helped.
          </T>
        </View>
      ) : null}
      {win.sources.length ? (
        <T variant="tiny" color={color.inkMuted}>
          Based on {win.sources.map((s) => s.publisher.split(" (")[0]).filter((v, i, a) => a.indexOf(v) === i).join(" and ")}
        </T>
      ) : null}
      <TryThis win={win} goalSlug={goalSlug} />
      <Button
        label="Share how it went"
        kind="ghost"
        icon="people"
        accessibilityHint="Tell other parents in Circles whether this worked for you"
        onPress={() => router.push({ pathname: "/post/new", params: { goal: goalSlug, kind: "worked", winId: win.id } })}
      />
      <Button
        label="Send to family"
        kind="ghost"
        icon="share"
        accessibilityHint="Adds this win to the playbook you share with grandparents, a nanny or a teacher"
        onPress={() => router.push({ pathname: "/family", params: { addWin: win.id } })}
      />
    </View>
  );
}

export default function GoalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const child = useActiveChild();
  const { me } = useSession();
  // "You tried this 4×" and the progress card are the active child's.
  const goal = useQuery({ queryKey: ["goal", slug, child?.id], queryFn: () => api.goal(slug, child?.id) });
  const g = goal.data;
  const tone = g ? categoryColor[g.category] : categoryColor.emotion;
  const locked = g?.wins.filter((w) => w.locked).length ?? 0;
  const progress = useQuery({ queryKey: ["progress", child?.id], queryFn: () => api.progress(child?.id) });
  const mine = progress.data?.goals.find((p) => p.goalSlug === slug);

  return (
    <Screen>
      <View style={{ flexDirection: "row", marginLeft: -8, marginTop: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} />
      </View>
      {goal.isLoading ? <Loading /> : null}
      {goal.error ? <ErrorNote message={(goal.error as Error).message} onRetry={() => goal.refetch()} /> : null}
      {g ? (
        <View style={{ gap: space.xl }}>
          <View style={{ backgroundColor: tone.tint, borderRadius: radius.hero, padding: space.xl, gap: space.md }}>
            <GoalArt illustration={g.illustration} category={g.category} size={120} />
            <T variant="smallStrong" color={tone.deep}>
              {tone.label}
            </T>
            <T variant="h1" accessibilityRole="header">
              {g.title}
            </T>
            <T color={color.inkSoft}>{g.hasContent ? g.intro : `${g.subtitle}. We're writing this guide now.`}</T>
          </View>

          {g.hasContent ? (
            <>
              {(me?.children.length ?? 0) > 1 ? (
                <View style={{ gap: space.sm }}>
                  <T variant="smallStrong" color={color.inkSoft}>
                    Trying these with
                  </T>
                  <ChildSwitcher />
                </View>
              ) : null}
              {mine?.tried ? <ProgressCard progress={mine} /> : null}
              <View style={{ gap: space.md }}>
                <T variant="h2" accessibilityRole="header">
                  {g.wins.length} wins to try
                </T>
                {g.wins.map((w) => (
                  <WinCard key={w.id} win={w} accent={tone.deep} goalSlug={g.slug} />
                ))}
                {locked ? (
                  <View style={{ gap: space.sm, marginTop: space.sm }}>
                    <Button label={`Unlock ${locked} more wins`} onPress={() => router.push("/paywall")} />
                    <T variant="tiny" color={color.inkMuted} style={{ textAlign: "center" }}>
                      Demo checkout. Nothing is charged.
                    </T>
                  </View>
                ) : null}
              </View>

              <Button
                label={`Ask about ${g.title.toLowerCase()}`}
                kind="secondary"
                icon="ask"
                onPress={() => router.navigate({ pathname: "/(tabs)/ask", params: { topic: g.slug } })}
              />

              <View style={{ gap: space.sm }}>
                <T variant="h3" accessibilityRole="header">
                  Sources
                </T>
                <T variant="small" color={color.inkMuted}>
                  Written in our own words from these public sources. General guidance, not medical advice.
                </T>
                {[...new Map([...g.sources, ...g.wins.flatMap((w) => w.sources)].map((s) => [s.id, s])).values()].map((s) => (
                  <Pressable key={s.id} accessibilityRole="link" onPress={() => Linking.openURL(s.url)} style={{ paddingVertical: space.xs }}>
                    <T variant="smallStrong" color={color.moss} style={{ textDecorationLine: "underline" }}>
                      {s.title}
                    </T>
                    <T variant="tiny" color={color.inkMuted}>
                      {s.publisher}
                    </T>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Button label="Back to goals" kind="secondary" onPress={() => router.back()} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
