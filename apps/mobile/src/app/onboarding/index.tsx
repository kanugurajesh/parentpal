import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pebble } from "@/components/Pebble";
import { Button, T } from "@/components/ui";
import { categoryColor, color, GUTTER, space } from "@/theme/tokens";

const STACK = [
  { fill: categoryColor.habits.tint, w: 210, shape: 0, x: 0 },
  { fill: categoryColor.sleep.tint, w: 170, shape: 3, x: 18 },
  { fill: categoryColor.emotion.tint, w: 132, shape: 1, x: -6 },
  { fill: categoryColor.focus.tint, w: 96, shape: 4, x: 10 },
  { fill: color.apricot, w: 60, shape: 2, x: 4 },
];

/** The welcome moment: a cairn of pebbles settles, one moment on top of another. */
function Cairn() {
  const reduced = useReducedMotion();
  return (
    <View style={{ alignItems: "center", justifyContent: "flex-end", height: 260 }} aria-hidden>
      {[...STACK].reverse().map((p, i) => (
        <Stone key={i} index={STACK.length - 1 - i} reduced={reduced} {...p} />
      ))}
    </View>
  );
}

function Stone({ index, fill, w, shape, x, reduced }: { index: number; fill: string; w: number; shape: number; x: number; reduced: boolean }) {
  const y = useSharedValue(reduced ? 0 : -260);
  const o = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    const delay = 200 + index * 120;
    y.value = withDelay(delay, withSpring(0, { damping: 14, stiffness: 120 }));
    o.value = withDelay(delay, withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }));
  }, [index, o, reduced, y]);
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { translateX: x }] }));
  return (
    <Animated.View style={[{ marginTop: -w * 0.18, zIndex: index }, style]}>
      <Pebble width={w} fill={fill} stroke={color.ink} shape={shape} />
    </Animated.View>
  );
}

export default function Welcome() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "bottom"]}>
      <View style={{ flex: 1, paddingHorizontal: GUTTER, justifyContent: "space-between", paddingBottom: space.lg }}>
        <T variant="h3" color={color.moss} style={{ paddingTop: space.lg }}>
          ParentPal
        </T>
        <Cairn />
        <View style={{ gap: space.md, maxWidth: 520 }}>
          <T variant="hero" accessibilityRole="header">
            Small moments add up.
          </T>
          <T color={color.inkSoft}>
            Jot down what happens with your little one. ParentPal spots what repeats and suggests one small thing to try next time.
          </T>
        </View>
        <View style={{ gap: space.sm }}>
          <Button label="Get started" onPress={() => router.push("/onboarding/child")} />
          <Button label="Sign in" kind="secondary" onPress={() => router.push("/sign-in")} />
          <T variant="tiny" color={color.inkMuted} style={{ textAlign: "center", marginTop: space.xs }}>
            No account needed to start. You can create one later from Profile.
          </T>
        </View>
      </View>
    </SafeAreaView>
  );
}
