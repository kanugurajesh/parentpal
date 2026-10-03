import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import type { Win } from "@parentpal/shared";
import { GoalArt } from "@/components/GoalArt";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, IconButton, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { addCheckIn, hasPermission, NOTIFICATIONS_SUPPORTED, turnOnNotifications, updatePrefs, useNotificationState } from "@/lib/notifications";
import { categoryColor, color, radius, space } from "@/theme/tokens";

/** Commits to trying a win; the next morning a check-in asks how it went (and opens the moment log). */
function TryThis({ win, goalSlug }: { win: Win; goalSlug: string }) {
  const { prefs, checkIns } = useNotificationState();
  if (!NOTIFICATIONS_SUPPORTED) return null;
  if (checkIns.some((c) => c.winId === win.id)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs }} accessibilityLiveRegion="polite">
        <Icon name="check" size={20} color={color.moss} />
        <T variant="smallStrong" color={color.moss}>
          Good luck! We'll check in tomorrow morning.
        </T>
      </View>
    );
  }
  return (
    <Button
      label="I'll try this"
      kind="secondary"
      icon="check"
      accessibilityHint="Sends one reminder tomorrow morning to ask how it went"
      onPress={async () => {
        if (!prefs.enabled || !prefs.checkIns || !(await hasPermission())) {
          const on = await turnOnNotifications({
            title: "Check in tomorrow?",
            message: "We'll send one reminder tomorrow morning asking how it went, so you can note it in a line. Those notes are how ParentPal spots patterns.",
            confirmLabel: "Remind me",
            cancelLabel: "Not now",
            icon: "bell",
          });
          if (!on) return;
          if (!prefs.checkIns) await updatePrefs({ checkIns: true });
        }
        await addCheckIn(win, goalSlug);
      }}
    />
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
      {win.sources.length ? (
        <T variant="tiny" color={color.inkMuted}>
          Based on {win.sources.map((s) => s.publisher.split(" (")[0]).filter((v, i, a) => a.indexOf(v) === i).join(" and ")}
        </T>
      ) : null}
      <TryThis win={win} goalSlug={goalSlug} />
    </View>
  );
}

export default function GoalScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const goal = useQuery({ queryKey: ["goal", slug], queryFn: () => api.goal(slug) });
  const g = goal.data;
  const tone = g ? categoryColor[g.category] : categoryColor.emotion;
  const locked = g?.wins.filter((w) => w.locked).length ?? 0;

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
                onPress={() => router.push({ pathname: "/(tabs)/ask", params: { topic: g.slug } })}
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
