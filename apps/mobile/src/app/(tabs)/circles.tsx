import type { PState } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, View } from "react-native";
import type { Circle } from "@parentpal/shared";
import { GoalArt } from "@/components/GoalArt";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { categoryColor, color, radius, space } from "@/theme/tokens";
import { useActiveChild } from "@/lib/session";

const GUIDELINES = [
  "Anonymous: you get a different nickname in each circle",
  "No names, photos, numbers or links",
  "Share what you tried. No diagnoses or medicine doses",
  "Be kind. Everyone here is doing their best",
];

function CircleRow({ circle }: { circle: Circle }) {
  const tone = categoryColor[circle.category];
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/circle/[goal]", params: { goal: circle.goalSlug } })}
      accessibilityRole="button"
      accessibilityLabel={`${circle.title} circle. ${circle.postsThisWeek} posts this week`}
      style={({ pressed, focused }: PState) => [
        { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: pressed ? color.paperDeep : color.card, borderRadius: radius.card, padding: space.md, borderWidth: 1.5, borderColor: circle.mine ? tone.deep + "55" : color.line },
        focused && ui.focusRing,
      ]}
    >
      <View style={{ width: 64, height: 64, borderRadius: radius.inner, backgroundColor: tone.tint, alignItems: "center", justifyContent: "center" }}>
        <GoalArt illustration={circle.illustration} category={circle.category} size={52} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyStrong">{circle.title}</T>
        <T variant="small" color={color.inkMuted}>
          {circle.postsThisWeek ? `${circle.postsThisWeek} post${circle.postsThisWeek === 1 ? "" : "s"} this week` : "Quiet this week. Start the conversation"}
        </T>
      </View>
      <Icon name="chevronRight" size={18} color={color.inkMuted} />
    </Pressable>
  );
}

export default function Circles() {
  const child = useActiveChild();
  const q = useQuery({ queryKey: ["circles", child?.id], queryFn: () => api.circles(child?.id) });
  const mine = q.data?.circles.filter((c) => c.mine) ?? [];
  const others = q.data?.circles.filter((c) => !c.mine) ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={color.moss} />}>
      <View style={{ paddingTop: space.lg, gap: space.lg }}>
        <View style={{ gap: space.xs }}>
          <T variant="h1" accessibilityRole="header">
            Circles
          </T>
          <T color={color.inkSoft}>Anonymous groups of parents working on the same things, with children the same age.</T>
        </View>

        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}

        {q.data && !q.data.canPost ? (
          <View style={{ backgroundColor: color.mossTint, borderRadius: radius.card, padding: space.lg, gap: space.md }}>
            <T variant="bodyStrong">You're reading as a guest</T>
            <T variant="small" color={color.inkSoft}>
              Create a free account to post, reply and react. Accounts keep Circles free of spam. You stay anonymous.
            </T>
            <Button label="Create free account" kind="secondary" onPress={() => router.push({ pathname: "/sign-in", params: { mode: "create" } })} />
          </View>
        ) : null}

        {mine.length ? (
          <View style={{ gap: space.md }}>
            <T variant="h3" accessibilityRole="header">
              Your circles
            </T>
            {mine.map((c) => (
              <CircleRow key={c.goalSlug} circle={c} />
            ))}
          </View>
        ) : null}

        {others.length ? (
          <View style={{ gap: space.md }}>
            <T variant="h3" accessibilityRole="header">
              {mine.length ? "More circles" : "All circles"}
            </T>
            {others.map((c) => (
              <CircleRow key={c.goalSlug} circle={c} />
            ))}
          </View>
        ) : null}

        {q.data ? (
          <View style={{ backgroundColor: color.paperDeep, borderRadius: radius.card, padding: space.lg, gap: space.sm }}>
            <T variant="smallStrong">How Circles work</T>
            {GUIDELINES.map((g) => (
              <View key={g} style={{ flexDirection: "row", gap: space.sm }}>
                <Icon name="check" size={18} color={color.moss} />
                <T variant="small" style={{ flex: 1 }}>
                  {g}
                </T>
              </View>
            ))}
            <T variant="tiny" color={color.inkMuted}>
              Posts are checked before they appear. Questions also get an answer from ParentPal's guides, marked as such.
            </T>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
