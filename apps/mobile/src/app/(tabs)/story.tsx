import type { PState } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { MOMENTS_PER_PATTERN } from "@parentpal/shared";
import { Icon } from "@/components/Icon";
import { MomentCard } from "@/components/MomentCard";
import { PatternCard } from "@/components/PatternCard";
import { Pebble } from "@/components/Pebble";
import { Button, ErrorNote, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { usePrimaryChild } from "@/lib/session";
import { color, radius, space } from "@/theme/tokens";

function PatternExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderRadius: radius.card, borderWidth: 1.5, borderColor: color.line, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed, focused }: PState) => [
          { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg, backgroundColor: pressed ? color.paperDeep : color.card },
          focused && ui.focusRing,
        ]}
      >
        <T variant="bodyStrong">What's a pattern?</T>
        <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
          <Icon name="chevronRight" size={18} color={color.inkMuted} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ padding: space.lg, paddingTop: 0, gap: space.sm, backgroundColor: color.card }}>
          <T color={color.inkSoft}>
            A pattern is something that keeps showing up across moments: the same trigger, the same time of day, or the same thing that helped.
          </T>
          <T color={color.inkSoft}>
            For example: "Three of the last four meltdowns started when it was time to leave somewhere fun." Spotting that makes it easier to plan ahead.
          </T>
          <T color={color.inkSoft}>
            Every insight links back to the moments it came from, so you can check it against what really happened.
          </T>
        </View>
      ) : null}
    </View>
  );
}

export default function Story() {
  const child = usePrimaryChild();
  const name = child?.nickname ?? "your child";
  const moments = useQuery({ queryKey: ["moments"], queryFn: api.moments });
  const patterns = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });
  const list = moments.data?.moments ?? [];
  const count = list.filter((m) => m.tagStatus !== "safety").length;
  const latestPattern = patterns.data?.patterns[0];

  return (
    <Screen>
      <View style={{ paddingTop: space.lg, gap: space.xl }}>
        <T variant="h1" accessibilityRole="header">
          {child ? `${name}'s Story` : "Story"}
        </T>

        {moments.isLoading ? <Loading /> : null}
        {moments.error ? <ErrorNote message={(moments.error as Error).message} onRetry={() => moments.refetch()} /> : null}

        {latestPattern ? <PatternCard pattern={latestPattern} moments={list} /> : null}

        {!latestPattern && moments.data ? (
          <View style={{ backgroundColor: color.card, borderRadius: radius.hero, padding: space.xl, gap: space.lg, borderWidth: 1.5, borderColor: color.line }}>
            {/* Progress to the first pattern: three pebble slots */}
            <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }} accessibilityLabel={`${Math.min(count, 3)} of ${MOMENTS_PER_PATTERN} moments logged`}>
              {Array.from({ length: MOMENTS_PER_PATTERN }, (_, i) => (
                <Pebble
                  key={i}
                  width={64 - i * 6}
                  shape={i + 1}
                  fill={i < count ? color.apricot : color.paperDeep}
                  stroke={i < count ? color.ink : color.line}
                  strokeWidth={i < count ? 3 : 2.5}
                />
              ))}
            </View>
            <T variant="h2">Log at least 3 moments to understand {name} deeper</T>
            <T color={color.inkSoft}>
              {count === 0
                ? "A moment is a few lines about something that happened: what came before, what they did, how it ended."
                : `${count} down, ${MOMENTS_PER_PATTERN - count} to go. Your first pattern appears after the third.`}
            </T>
            <Button label="Add moment" icon="plus" onPress={() => router.push("/moment/new")} />
          </View>
        ) : null}

        {latestPattern ? <Button label="Add moment" icon="plus" onPress={() => router.push("/moment/new")} /> : null}

        <PatternExplainer />

        {list.length ? (
          <View style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <T variant="h2" accessibilityRole="header">
                Recent moments
              </T>
              <Button label="See all moments" kind="ghost" onPress={() => router.push("/moments")} />
            </View>
            {list.slice(0, 3).map((m) => (
              <MomentCard key={m.id} moment={m} highlight={latestPattern?.momentIds.includes(m.id)} />
            ))}
          </View>
        ) : (
          <Button label="See all moments" kind="ghost" onPress={() => router.push("/moments")} />
        )}
      </View>
    </Screen>
  );
}
