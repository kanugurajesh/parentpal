import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { AssistantBubble } from "@/components/ChatBubble";
import { SubHeader } from "@/components/SubHeader";
import { Button, ErrorNote, Loading, Screen, T } from "@/components/ui";
import { api } from "@/lib/api";
import { color, space } from "@/theme/tokens";

export default function Bookmarks() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bookmarks"], queryFn: api.bookmarks });
  const unmark = useMutation({
    mutationFn: (id: string) => api.bookmark(id, false),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
      qc.invalidateQueries({ queryKey: ["chat"] });
    },
  });
  const rate = useMutation({ mutationFn: ({ id, r }: { id: string; r: 1 | -1 }) => api.feedback(id, r), onSuccess: () => qc.invalidateQueries({ queryKey: ["bookmarks"] }) });

  return (
    <Screen>
      <SubHeader title="Bookmarks" />
      <View style={{ gap: space.lg }}>
        {q.isLoading ? <Loading /> : null}
        {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
        {q.data && !q.data.messages.length ? (
          <View style={{ gap: space.md }}>
            <T color={color.inkSoft}>Nothing saved yet. Tap the bookmark under any answer in Ask to keep it here.</T>
            <Button label="Go to Ask" kind="secondary" onPress={() => router.navigate("/(tabs)/ask")} />
          </View>
        ) : null}
        {q.data?.messages.map((m) => (
          <AssistantBubble key={m.id} message={m} onBookmark={() => unmark.mutate(m.id)} onRate={(r) => rate.mutate({ id: m.id, r })} />
        ))}
      </View>
    </Screen>
  );
}
