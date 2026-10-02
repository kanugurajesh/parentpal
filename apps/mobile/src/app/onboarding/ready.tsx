import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { FadeInDown, useReducedMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalArt } from "@/components/GoalArt";
import { Button, T } from "@/components/ui";
import { GOAL_CHOICES } from "@/lib/goals";
import { useSession } from "@/lib/session";
import { color, GUTTER, radius, space } from "@/theme/tokens";

export default function Ready() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const { me } = useSession();
  const reduced = useReducedMotion();
  const goals = (me?.goals ?? []).map((s) => GOAL_CHOICES.find((g) => g.slug === s)!).filter(Boolean);

  const scale = useSharedValue(reduced ? 1 : 0.4);
  useEffect(() => {
    if (!reduced) scale.value = withDelay(100, withSpring(1, { damping: 11, stiffness: 140 }));
  }, [reduced, scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const enter = (i: number) => (reduced ? undefined : FadeInDown.delay(350 + i * 120).springify().damping(16));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, paddingHorizontal: GUTTER, justifyContent: "center", gap: space.xl }}>
        <Animated.View style={[{ alignSelf: "flex-start", backgroundColor: color.apricot, borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm }, pop]}>
          <T variant="smallStrong">Plan ready</T>
        </Animated.View>
        <T variant="hero" accessibilityRole="header">
          {name ? `${name}'s growth plan is ready` : "Your growth plan is ready"}
        </T>
        <View style={{ gap: space.sm }}>
          {goals.map((g, i) => (
            <Animated.View
              key={g.slug}
              entering={enter(i)}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: color.card, borderRadius: radius.card, padding: space.sm, paddingRight: space.lg }}
            >
              <GoalArt illustration={g.illustration} category={g.category} size={52} />
              <View style={{ flex: 1 }}>
                <T variant="bodyStrong">{g.title}</T>
                <T variant="small" color={color.inkMuted}>
                  {g.ready ? "Your first win is unlocked" : "Guide coming soon"}
                </T>
              </View>
            </Animated.View>
          ))}
          <Animated.View entering={enter(goals.length)}>
            <T variant="small" color={color.inkSoft} style={{ marginTop: space.sm }}>
              Next: log a few moments in {name ? `${name}'s` : "your"} Story so we can spot patterns together.
            </T>
          </Animated.View>
        </View>
      </View>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.lg }}>
        <Button label="See my plan" onPress={() => router.replace("/paywall")} />
      </View>
    </SafeAreaView>
  );
}
