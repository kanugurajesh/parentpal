import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatAge, MOMENTS_PER_PATTERN, type GoalFilter } from "@parentpal/shared";
import { FeaturedGoalCard, GoalTile } from "@/components/GoalCards";
import { Icon } from "@/components/Icon";
import { Pebble } from "@/components/Pebble";
import { progressLine } from "@/components/Progress";
import { Button, Chip, Disclaimer, ErrorNote, Loading, T } from "@/components/ui";
import { api } from "@/lib/api";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useActiveChild, useSession } from "@/lib/session";
import { categoryColor, color, GUTTER, radius, space } from "@/theme/tokens";

const FILTERS: { id: GoalFilter; label: string }[] = [
  { id: "all", label: "All Goals" },
  { id: "focus", label: "Focus" },
  { id: "sleep", label: "Sleep" },
  { id: "emotion", label: "Emotion" },
];

const HERO = 132;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const child = useActiveChild();
  const childId = child?.id;
  const [filter, setFilter] = useState<GoalFilter>("all");
  const goals = useQuery({ queryKey: ["goals", filter], queryFn: () => api.goals(filter) });
  const moments = useQuery({ queryKey: ["moments", childId], queryFn: () => api.moments(childId) });
  const progress = useQuery({ queryKey: ["progress", childId], queryFn: () => api.progress(childId) });
  const advisors = useQuery({ queryKey: ["advisors"], queryFn: api.advisors, staleTime: Infinity });
  const subscribed = me?.subscription?.status === "active_fake";
  const name = child?.nickname ?? "Your child";
  const patterns = useQuery({ queryKey: ["patterns", childId], queryFn: () => api.patterns(childId) });
  const hasPattern = !!patterns.data?.patterns.length;
  // Safety-flagged moments never feed patterns, so they don't count toward the first one (same as Story).
  const momentCount = moments.data?.moments.filter((m) => m.tagStatus !== "safety").length ?? 0;

  // Scroll-linked header: the big name lifts and fades as a compact bar slides in.
  const ref = useAnimatedRef<Animated.ScrollView>();
  const y = useScrollOffset(ref);
  const heroStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, HERO * 0.7], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(y.value, [-100, 0, HERO], [30, 0, -HERO * 0.35], Extrapolation.CLAMP) },
      { scale: interpolate(y.value, [-100, 0], [1.08, 1], Extrapolation.CLAMP) },
    ],
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO * 0.55, HERO * 0.9], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(y.value, [HERO * 0.55, HERO * 0.9], [-8, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      {/* Compact bar (appears on scroll) */}
      <Animated.View
        style={[
          { pointerEvents: "none" },
          {
            position: "absolute",
            zIndex: 10,
            top: 0,
            left: 0,
            right: 0,
            paddingTop: insets.top + space.sm,
            paddingBottom: space.md,
            paddingHorizontal: GUTTER,
            backgroundColor: color.paper,
            borderBottomWidth: 1,
            borderColor: color.line,
          },
          barStyle,
        ]}
      >
        <T variant="h3">{child ? `${name}, ${formatAge(child.ageMonths)}` : "Home"}</T>
      </Animated.View>

      <Animated.ScrollView ref={ref} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingBottom: space.xxxl }}>
        <Animated.View style={[{ paddingHorizontal: GUTTER, minHeight: HERO, justifyContent: "flex-end", gap: space.xs }, heroStyle]}>
          <T color={color.inkSoft}>
            {greeting()}
            {me?.user.firstName ? `, ${me.user.firstName}` : ""}
          </T>
          <T variant="hero" accessibilityRole="header">
            {name}
          </T>
          {child ? (
            <T variant="bodyStrong" color={color.moss}>
              {formatAge(child.ageMonths)} of growing
            </T>
          ) : null}
        </Animated.View>
        <ChildSwitcher style={{ paddingHorizontal: GUTTER, marginTop: space.md }} />

        {/* Story card */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: space.xl }}>
          <View style={{ backgroundColor: color.moss, borderRadius: radius.hero, padding: space.xl, overflow: "hidden", gap: space.md }}>
            <View style={{ position: "absolute", right: -36, bottom: -34, opacity: 0.95 }} aria-hidden>
              <Pebble width={150} fill={color.apricot} shape={2} />
            </View>
            <View style={{ position: "absolute", right: 86, bottom: 18, opacity: 0.3 }} aria-hidden>
              <Pebble width={80} fill={color.white} shape={4} />
            </View>
            <T variant="h2" color={color.white} style={{ maxWidth: "85%" }}>
              {momentCount ? `${name}'s Story` : `Start ${name}'s Story`}
            </T>
            <T color="#D5E7DC" style={{ maxWidth: "90%" }}>
              {hasPattern
                ? `${momentCount} moments logged. Your latest pattern is in Story.`
                : momentCount >= MOMENTS_PER_PATTERN
                  ? `${momentCount} moments logged. Keep going: a pattern appears once a few have something in common.`
                  : momentCount
                    ? `${momentCount} of ${MOMENTS_PER_PATTERN} moments logged. A pattern appears after ${MOMENTS_PER_PATTERN}.`
                    : `Log what happened today, big or small. Patterns appear after ${MOMENTS_PER_PATTERN} moments.`}
            </T>
            <Button label="Add moment" kind="accent" icon="plus" onPress={() => router.push("/moment/new")} style={{ alignSelf: "flex-start" }} />
          </View>
        </View>

        {/* Family playbook */}
        <View style={{ paddingHorizontal: GUTTER, marginTop: space.lg }}>
          <Pressable
            onPress={() => router.push("/family")}
            accessibilityRole="button"
            accessibilityHint="Share the words you use with grandparents, a nanny or a teacher"
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: pressed ? color.paperDeep : color.card, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5, borderColor: color.line })}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color.mossTint, alignItems: "center", justifyContent: "center" }}>
              <Icon name="people" size={22} color={color.moss} />
            </View>
            <View style={{ flex: 1 }}>
              <T variant="bodyStrong">Get the whole family on the same page</T>
              <T variant="small" color={color.inkMuted}>
                Send {name === "Your child" ? "your child's" : `${name}'s`} plan to Nani, Dad or the nanny. No app needed.
              </T>
            </View>
            <Icon name="chevronRight" size={18} color={color.inkMuted} />
          </Pressable>
        </View>

        {/* Filters */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: space.sm, marginTop: space.xxl }}>
          {FILTERS.map((f) => (
            <Chip key={f.id} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />
          ))}
        </ScrollView>

        <View style={{ paddingHorizontal: GUTTER, gap: space.xxl, marginTop: space.xl }}>
          {goals.isLoading ? <Loading /> : null}
          {goals.error ? <ErrorNote message={(goals.error as Error).message} onRetry={() => goals.refetch()} /> : null}

          {goals.data?.personalized.length ? (
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                <T variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
                  Your personalized goals
                </T>
                <Button label="Edit" kind="ghost" onPress={() => router.push("/goals")} accessibilityHint="Change the goals you're working on" />
              </View>
              {goals.data.personalized.map((g) => (
                <FeaturedGoalCard key={g.slug} goal={g} subscribed={subscribed} progress={progressLine(progress.data?.goals.find((p) => p.goalSlug === g.slug))} />
              ))}
            </View>
          ) : null}

          {goals.data?.others.length ? (
            <View style={{ gap: space.md }}>
              <T variant="h2" accessibilityRole="header">
                Find your parenting goal
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {goals.data.others.map((g) => (
                  <GoalTile key={g.slug} goal={g} />
                ))}
              </View>
            </View>
          ) : goals.data && !goals.data.personalized.length ? (
            <T color={color.inkMuted}>No goals in this area yet.</T>
          ) : null}

          {/* Advisors: fictional placeholders, labelled as such */}
          {advisors.data ? (
            <View style={{ gap: space.md }}>
              <View style={{ gap: space.xs }}>
                <T variant="h2" accessibilityRole="header">
                  Meet our advisors
                </T>
                <T variant="small" color={color.inkMuted}>
                  Sample profiles. In a real launch, credentialed experts would review each guide.
                </T>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -GUTTER }}>
                <View style={{ width: GUTTER - space.sm }} />
                {advisors.data.map((a, i) => {
                  const tone = [categoryColor.sleep, categoryColor.emotion, categoryColor.habits][i % 3];
                  return (
                    <View key={a.id} style={{ width: 220, backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: color.line }}>
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tone.tint, alignItems: "center", justifyContent: "center" }}>
                        <T variant="h3" color={tone.deep}>
                          {a.initials}
                        </T>
                      </View>
                      <T variant="bodyStrong">{a.name}</T>
                      <T variant="small" color={color.inkSoft}>
                        {a.focus}
                      </T>
                      <T variant="tiny" color={color.inkMuted}>
                        Placeholder profile, not a real person
                      </T>
                    </View>
                  );
                })}
                <View style={{ width: GUTTER - space.sm }} />
              </ScrollView>
            </View>
          ) : null}

          <Disclaimer />
        </View>
      </Animated.ScrollView>
    </View>
  );
}
