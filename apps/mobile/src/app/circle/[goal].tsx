import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { AGE_BAND_LABELS, AGE_BANDS, type AgeBand, type GoalSlug } from "@parentpal/shared";
import { openPost, PostCard } from "@/components/PostCard";
import { Button, Chip, ErrorNote, IconButton, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { categoryColor, color, radius, space } from "@/theme/tokens";

export default function CircleFeed() {
  const { goal } = useLocalSearchParams<{ goal: GoalSlug }>();
  const circles = useQuery({ queryKey: ["circles"], queryFn: api.circles });
  const circle = circles.data?.circles.find((c) => c.goalSlug === goal);
  const myBand = circles.data?.myAgeBand ?? null;
  const canPost = circles.data?.canPost ?? false;
  const [picked, setPicked] = useState<AgeBand | "all" | null>(null);
  const band = picked ?? myBand ?? "all";

  const key = ["feed", goal, band];
  const feed = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.feed(goal, band, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!circles.data,
  });
  const posts = feed.data?.pages.flatMap((p) => p.posts) ?? [];
  const nearby = feed.data?.pages[0]?.nearby ?? [];
  const tone = circle ? categoryColor[circle.category] : categoryColor.emotion;
  const invalidate = [["feed", goal]];

  const compose = () => router.push({ pathname: "/post/new", params: { goal } });

  return (
    <Screen refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => feed.refetch()} tintColor={color.moss} />}>
      <View style={{ flexDirection: "row", marginLeft: -8, marginTop: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/circles"))} />
      </View>

      <View style={{ gap: space.lg }}>
        <View style={{ backgroundColor: tone.tint, borderRadius: radius.hero, padding: space.xl, gap: space.sm }}>
          <T variant="smallStrong" color={tone.deep}>
            Circle
          </T>
          <T variant="h1" accessibilityRole="header">
            {circle?.title ?? "Circle"}
          </T>
          <T color={color.inkSoft}>Questions, small wins and what actually worked, from parents like you.</T>
          {canPost ? <Button label="New post" icon="plus" onPress={compose} style={{ marginTop: space.sm }} /> : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          <Chip label="All ages" selected={band === "all"} onPress={() => setPicked("all")} />
          {AGE_BANDS.map((b) => (
            <Chip key={b} label={`${AGE_BAND_LABELS[b]}${b === myBand ? " (yours)" : ""}`} selected={band === b} onPress={() => setPicked(b)} />
          ))}
        </ScrollView>

        {feed.isLoading || circles.isLoading ? <Loading /> : null}
        {feed.error ? <ErrorNote message={(feed.error as Error).message} onRetry={() => feed.refetch()} /> : null}

        {feed.data && !posts.length ? (
          <View style={{ alignItems: "center", paddingVertical: space.xl, gap: space.sm }}>
            <T variant="h3">No posts for this age yet</T>
            <T color={color.inkMuted} style={{ textAlign: "center", maxWidth: 300 }}>
              {canPost ? "Ask a question and ParentPal's guide will answer right away, while other parents join in." : "Check back soon, or look at other ages."}
            </T>
            {canPost ? <Button label="Ask the circle" kind="secondary" onPress={compose} /> : null}
          </View>
        ) : null}

        {posts.map((p) => (
          <PostCard key={p.id} post={p} onPress={() => openPost(p.id)} canReact={canPost} invalidate={invalidate} />
        ))}

        {feed.hasNextPage ? <Button label="Load more" kind="ghost" loading={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()} /> : null}

        {nearby.length ? (
          <View style={{ gap: space.md }}>
            <T variant="h3" accessibilityRole="header">
              From nearby ages
            </T>
            {nearby.map((p) => (
              <PostCard key={p.id} post={p} onPress={() => openPost(p.id)} canReact={canPost} invalidate={invalidate} />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
