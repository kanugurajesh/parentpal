import { router } from "expo-router";
import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalArt } from "@/components/GoalArt";
import { Pebble } from "@/components/Pebble";
import { Button, IconButton, T } from "@/components/ui";
import { useOnboarding } from "@/lib/onboarding";
import { categoryColor, color, GUTTER, radius, space } from "@/theme/tokens";

const SLIDES = [
  {
    title: "Your journal shows the patterns",
    body: "Log a quick moment when things get tricky. After three, ParentPal points out what keeps coming up, like transitions or tiredness.",
    art: "pebbles",
  },
  {
    title: "One small win at a time",
    body: "Each goal comes with a handful of wins: something to do, words to say, and what to expect when you try it.",
    art: "goal",
  },
  {
    title: "Answers you can check",
    body: "Ask anything. Replies draw on guidance from pediatric and public-health sources, and show you which one they used.",
    art: "source",
  },
] as const;

function SlideArt({ kind, name }: { kind: (typeof SLIDES)[number]["art"]; name: string }) {
  if (kind === "pebbles")
    return (
      <View style={{ height: 180, justifyContent: "center", alignItems: "center", flexDirection: "row", gap: -12 }}>
        {[categoryColor.emotion.tint, color.apricot, categoryColor.emotion.tint].map((fill, i) => (
          <View key={i} style={{ transform: [{ translateY: i === 1 ? -16 : 8 }] }}>
            <Pebble width={104} fill={fill} stroke={color.ink} shape={i + 1} />
          </View>
        ))}
      </View>
    );
  if (kind === "goal")
    return (
      <View style={{ height: 180, alignItems: "center", justifyContent: "center" }}>
        <GoalArt illustration="moon" category="sleep" size={170} />
      </View>
    );
  return (
    <View style={{ height: 180, justifyContent: "center" }}>
      <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: color.line }}>
        <T variant="small">
          Try a heads-up a few minutes before leaving: "Two more slides, then it's time for shoes."
        </T>
        <View style={{ alignSelf: "flex-start", backgroundColor: color.mossTint, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill }}>
          <T variant="tiny" color={color.mossDeep}>
            From Handling tantrums, win 3
          </T>
        </View>
      </View>
      <T variant="tiny" color={color.inkMuted} style={{ marginTop: space.sm }}>
        Example answer for {name}
      </T>
    </View>
  );
}

/** Page dots driven directly by scroll position: they stretch and recolour as you swipe. */
function Dot({ i, offset, width }: { i: number; offset: SharedValue<number>; width: number }) {
  const style = useAnimatedStyle(() => {
    const p = offset.value / width;
    const d = Math.abs(p - i);
    return {
      width: interpolate(d, [0, 1], [28, 8], "clamp"),
      backgroundColor: interpolateColor(Math.min(d, 1), [0, 1], [color.moss, color.line]),
    };
  });
  return <Animated.View style={[{ height: 8, borderRadius: radius.pill }, style]} />;
}

export default function Intro() {
  const { width } = useWindowDimensions();
  const { draft } = useOnboarding();
  const name = draft.children[0]?.nickname.trim() || "your child";
  const ref = useAnimatedRef<Animated.ScrollView>();
  const offset = useScrollOffset(ref);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const go = (p: number) => ref.current?.scrollTo({ x: p * width, animated: true });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: GUTTER - 8, paddingTop: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => router.back()} />
        <Button label="Skip" kind="ghost" onPress={() => router.push("/onboarding/goals")} />
      </View>
      <Animated.ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {SLIDES.map((s, i) => (
          <View key={i} style={{ width, paddingHorizontal: GUTTER, justifyContent: "center", gap: space.xl }} accessibilityLabel={`Slide ${i + 1} of ${SLIDES.length}`}>
            <SlideArt kind={s.art} name={name} />
            <View style={{ gap: space.md, maxWidth: 520 }}>
              <T variant="h1" accessibilityRole="header">
                {s.title}
              </T>
              <T color={color.inkSoft}>{s.body}</T>
            </View>
          </View>
        ))}
      </Animated.ScrollView>
      <View style={{ paddingHorizontal: GUTTER, paddingBottom: space.lg, gap: space.lg }}>
        <View style={{ flexDirection: "row", gap: 6, alignSelf: "center" }}>
          {SLIDES.map((_, i) => (
            <Dot key={i} i={i} offset={offset} width={width} />
          ))}
        </View>
        <Button label={last ? "Choose our goals" : "Next"} onPress={() => (last ? router.push("/onboarding/goals") : go(page + 1))} />
      </View>
    </SafeAreaView>
  );
}
