import type { PState } from "@/components/ui";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import type { GoalSummary } from "@parentpal/shared";
import { categoryColor, color, radius, space } from "@/theme/tokens";
import { GoalArt } from "./GoalArt";
import { T, styles as ui } from "./ui";

const open = (slug: string) => router.push({ pathname: "/goal/[slug]", params: { slug } });

function winLine(g: GoalSummary, subscribed: boolean) {
  if (!g.hasContent) return "Guide coming soon";
  return subscribed ? `${g.winCount} wins unlocked` : `1 of ${g.winCount} wins free`;
}

/** Full-width card for a goal the parent chose. The tint carries the category. */
export function FeaturedGoalCard({ goal, subscribed, progress }: { goal: GoalSummary; subscribed: boolean; progress?: string | null }) {
  const tone = categoryColor[goal.category];
  return (
    <Pressable
      onPress={() => open(goal.slug)}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${goal.subtitle}. ${winLine(goal, subscribed)}${progress ? `. ${progress}` : ""}`}
      style={({ pressed, focused }: PState) => [
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tone.tint,
          borderRadius: radius.card,
          padding: space.lg,
          paddingRight: space.sm,
          gap: space.sm,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        focused && ui.focusRing,
      ]}
    >
      <View style={{ flex: 1, gap: space.xs }}>
        <T variant="smallStrong" color={tone.deep}>
          {tone.label}
        </T>
        <T variant="h3">{goal.title}</T>
        <T variant="small" color={color.inkSoft}>
          {goal.subtitle}
        </T>
        <View style={{ alignSelf: "flex-start", marginTop: space.sm, backgroundColor: color.card, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 4 }}>
          <T variant="tiny" color={color.ink}>
            {winLine(goal, subscribed)}
          </T>
        </View>
        {progress ? (
          <T variant="smallStrong" color={tone.deep}>
            {progress}
          </T>
        ) : null}
      </View>
      <GoalArt illustration={goal.illustration} category={goal.category} size={104} />
    </Pressable>
  );
}

/** Compact tile for the "find your goal" grid. */
export function GoalTile({ goal }: { goal: GoalSummary }) {
  return (
    <Pressable
      onPress={() => open(goal.slug)}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}. ${goal.subtitle}${goal.hasContent ? "" : ". Guide coming soon"}`}
      style={({ pressed, focused }: PState) => [
        {
          flexBasis: "47%",
          flexGrow: 1,
          maxWidth: "49%",
          backgroundColor: pressed ? color.paperDeep : color.card,
          borderRadius: radius.card - 4,
          padding: space.md,
          gap: space.sm,
          borderWidth: 1.5,
          borderColor: color.line,
        },
        focused && ui.focusRing,
      ]}
    >
      <GoalArt illustration={goal.illustration} category={goal.category} size={56} />
      <T variant="bodyStrong">{goal.title}</T>
      <T variant="small" color={color.inkMuted} numberOfLines={2}>
        {goal.hasContent ? goal.subtitle : "Guide coming soon"}
      </T>
    </Pressable>
  );
}
