import type { PState } from "@/components/ui";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { MAX_GOALS, type GoalSlug } from "@parentpal/shared";
import { GOAL_CHOICES } from "@/lib/goals";
import { GoalArt } from "@/components/GoalArt";
import { Icon } from "@/components/Icon";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { Button, T, styles as ui } from "@/components/ui";
import { useOnboarding } from "@/lib/onboarding";
import { categoryColor, color, radius, space } from "@/theme/tokens";



export default function GoalsStep() {
  const { draft, update } = useOnboarding();
  const picked = draft.goals;

  const toggle = (slug: GoalSlug) => {
    if (picked.includes(slug)) update({ goals: picked.filter((s) => s !== slug) });
    else if (picked.length < MAX_GOALS) update({ goals: [...picked, slug] });
    else update({ goals: [picked[1], slug] }); // replace the oldest pick
  };

  return (
    <OnboardingFrame
      step={2}
      title="What should we work on together?"
      subtitle="Pick one or two. You can change these anytime."
      footer={<Button label={picked.length ? `Continue with ${picked.length} goal${picked.length > 1 ? "s" : ""}` : "Pick at least one"} disabled={!picked.length} onPress={() => router.push("/onboarding/parent")} />}
    >
      <View style={{ gap: space.sm }}>
        {GOAL_CHOICES.map((g) => {
          const order = picked.indexOf(g.slug);
          const on = order >= 0;
          const tone = categoryColor[g.category];
          return (
            <Pressable
              key={g.slug}
              onPress={() => toggle(g.slug)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${g.title}${g.ready ? "" : ", guide coming soon"}`}
              style={({ pressed, focused }: PState) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.md,
                  padding: space.sm,
                  paddingRight: space.lg,
                  borderRadius: radius.card,
                  borderWidth: 2,
                  borderColor: on ? color.ink : "transparent",
                  backgroundColor: on ? tone.tint : pressed ? color.paperDeep : color.card,
                },
                focused && ui.focusRing,
              ]}
            >
              <GoalArt illustration={g.illustration} category={g.category} size={56} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{g.title}</T>
                {!g.ready ? (
                  <T variant="tiny" color={color.inkMuted}>
                    Guide coming soon
                  </T>
                ) : null}
              </View>
              {/* Pick order is meaningful: the first goal leads the home screen. */}
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? color.ink : "transparent",
                  borderWidth: on ? 0 : 1.5,
                  borderColor: color.line,
                }}
              >
                {on ? (
                  <T variant="smallStrong" color={color.white}>
                    {order + 1}
                  </T>
                ) : (
                  <Icon name="plus" size={16} color={color.inkMuted} />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}
