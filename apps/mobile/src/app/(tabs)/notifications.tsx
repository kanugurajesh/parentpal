import type { PState } from "@/components/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Disclaimer, ErrorNote, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { color, radius, space } from "@/theme/tokens";

export default function Notifications() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const read = useMutation({ mutationFn: api.readNotification, onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const list = q.data?.notifications ?? [];

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={color.moss} />}>
      <View style={{ paddingTop: space.lg, gap: space.lg }}>
        <T variant="h1" accessibilityRole="header">
          Notifications
        </T>
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
        {q.data && !list.length ? (
          <View style={{ alignItems: "center", paddingVertical: space.xxxl, gap: space.md }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: color.paperDeep, alignItems: "center", justifyContent: "center" }}>
              <Icon name="bell" size={32} color={color.inkMuted} />
            </View>
            <T variant="h3">No new notifications</T>
            <T color={color.inkMuted} style={{ textAlign: "center", maxWidth: 300 }}>
              A personalized tip arrives here each morning, based on your goals.
            </T>
          </View>
        ) : null}
        {list.map((n) => {
          const unread = !n.readAt;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={`${unread ? "Unread. " : ""}${n.title}. ${n.body}`}
              onPress={() => {
                if (unread) read.mutate(n.id);
                if (n.goalSlug) router.push({ pathname: "/goal/[slug]", params: { slug: n.goalSlug } });
              }}
              style={({ pressed, focused }: PState) => [
                {
                  backgroundColor: unread ? color.card : "transparent",
                  borderRadius: radius.card,
                  padding: space.lg,
                  gap: space.xs,
                  borderWidth: 1.5,
                  borderColor: unread ? color.apricot : color.line,
                  opacity: pressed ? 0.85 : 1,
                },
                focused && ui.focusRing,
              ]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.apricot }} /> : null}
                <T variant="tiny" color={color.inkMuted}>
                  {new Date(`${n.forDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                </T>
              </View>
              <T variant="bodyStrong">{n.title}</T>
              <T color={color.inkSoft}>{n.body}</T>
            </Pressable>
          );
        })}
        {list.length ? <Disclaimer /> : null}
      </View>
    </Screen>
  );
}
