import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { MomentCard } from "@/components/MomentCard";
import { Button, ErrorNote, IconButton, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { color, space } from "@/theme/tokens";

export default function AllMoments() {
  const qc = useQueryClient();
  const moments = useQuery({ queryKey: ["moments"], queryFn: api.moments });
  const patterns = useQuery({ queryKey: ["patterns"], queryFn: api.patterns });
  const linked = new Set(patterns.data?.patterns.flatMap((p) => p.momentIds) ?? []);
  const remove = useMutation({
    mutationFn: api.deleteMoment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moments"] });
      qc.invalidateQueries({ queryKey: ["patterns"] });
    },
  });
  const askRemove = async (id: string) => {
    const ok = await confirm({ title: "Delete this moment?", message: "It will be removed from your Story. This can't be undone.", confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger", icon: "trash" });
    if (ok) remove.mutate(id);
  };

  return (
    <Screen>
      <View style={{ flexDirection: "row", marginLeft: -8, marginTop: space.sm }}>
        <IconButton icon="chevronLeft" label="Back" onPress={() => router.back()} />
      </View>
      <View style={{ gap: space.lg }}>
        <T variant="h1" accessibilityRole="header">
          All moments
        </T>
        {moments.isLoading ? <Loading /> : null}
        {moments.error ? <ErrorNote message={(moments.error as Error).message} onRetry={() => moments.refetch()} /> : null}
        {remove.error ? <ErrorNote message={(remove.error as Error).message} /> : null}
        {moments.data && !moments.data.moments.length ? (
          <View style={{ gap: space.md }}>
            <T color={color.inkSoft}>No moments yet. Your first one takes less than a minute.</T>
            <Button label="Add moment" icon="plus" onPress={() => router.push("/moment/new")} />
          </View>
        ) : null}
        {linked.size ? (
          <T variant="small" color={color.inkMuted}>
            Moments outlined in apricot are part of a pattern insight.
          </T>
        ) : null}
        {moments.data?.moments.map((m) => (
          <MomentCard
            key={m.id}
            moment={m}
            highlight={linked.has(m.id)}
            footer={<Button label="Delete" kind="ghost" onPress={() => void askRemove(m.id)} style={{ alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 0 }} />}
          />
        ))}
      </View>
    </Screen>
  );
}
