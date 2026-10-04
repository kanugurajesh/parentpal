import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { REPLY_MAX, type CommunityReply, type SafetyNotice } from "@parentpal/shared";
import { AnswerText, Sources } from "@/components/ChatBubble";
import { Icon } from "@/components/Icon";
import { AuthorLine, MoreMenu, PostCard, Reactions } from "@/components/PostCard";
import { SafetyCard } from "@/components/SafetyCard";
import { Disclaimer, ErrorNote, IconButton, Loading, Screen, T, styles as ui } from "@/components/ui";
import { api } from "@/lib/api";
import { color, GUTTER, radius, space } from "@/theme/tokens";
import { useActiveChild } from "@/lib/session";

function GuideReply({ reply }: { reply: CommunityReply }) {
  return (
    <View style={{ backgroundColor: color.mossTint, borderRadius: radius.card, padding: space.lg, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: color.moss, alignItems: "center", justifyContent: "center" }}>
          <Icon name="spark" size={18} color={color.white} />
        </View>
        <View style={{ flex: 1 }}>
          <T variant="smallStrong">ParentPal guide</T>
          <T variant="tiny" color={color.inkSoft}>
            From our expert-sourced guides, not another parent
          </T>
        </View>
      </View>
      <AnswerText text={reply.body} />
      <Sources citations={reply.citations} />
      <Disclaimer />
    </View>
  );
}

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const key = ["post", id];
  const q = useQuery({ queryKey: key, queryFn: () => api.post(id) });
  const child = useActiveChild();
  const circles = useQuery({ queryKey: ["circles", child?.id], queryFn: () => api.circles(child?.id) });
  const canPost = circles.data?.canPost ?? false;
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [safety, setSafety] = useState<SafetyNotice | null>(null);

  const goal = q.data?.post.goalSlug;
  const invalidate = [key, ["feed", goal]];
  const refresh = () => Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));

  const send = useMutation({
    // The reply's "Mom of a 2-year-old" label follows the active child.
    mutationFn: () => api.reply(id, text.trim(), child?.id),
    onSuccess: async (res) => {
      setSafety(res.safety);
      setNotice(res.outcome === "review" ? "Thanks! Your reply will appear once a moderator has checked it." : null);
      if (res.outcome !== "safety") setText("");
      await refresh();
    },
  });

  const afterAction = (action: "deleted" | "reported" | "blocked", isPost: boolean) => {
    if (isPost || action === "blocked") {
      void qc.invalidateQueries({ queryKey: ["feed", goal] });
      return router.canGoBack() ? router.back() : router.replace("/(tabs)/circles");
    }
    setNotice(action === "reported" ? "Thanks for reporting. A moderator will take a look." : null);
    void refresh();
  };

  const post = q.data?.post;
  const replies = q.data?.replies ?? [];
  const guide = replies.filter((r) => r.isGuide);
  const parents = replies.filter((r) => !r.isGuide);
  const canReply = canPost && post?.status === "live";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Screen edges={[]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginLeft: -8, marginTop: space.sm }}>
            <IconButton icon="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/circles"))} />
            {post ? <MoreMenu targetType="post" targetId={post.id} isMe={post.author.isMe} canReport={canPost} onDone={(a) => afterAction(a, true)} /> : null}
          </View>
          {q.isLoading ? <Loading /> : null}
          {q.error ? <ErrorNote message={(q.error as Error).message} onRetry={() => q.refetch()} /> : null}
          {post ? (
            <View style={{ gap: space.lg }}>
              <PostCard post={post} canReact={canPost} invalidate={invalidate} />
              {post.safety ? <SafetyCard notice={post.safety} /> : null}
              {post.status === "review" ? (
                <T variant="small" color={color.inkMuted}>
                  Only you can see this until a moderator has checked it. That usually takes a few hours.
                </T>
              ) : null}

              {guide.map((r) => (
                <GuideReply key={r.id} reply={r} />
              ))}

              <T variant="h3" accessibilityRole="header">
                {parents.length ? `${parents.length} ${parents.length === 1 ? "reply" : "replies"} from parents` : "No replies from parents yet"}
              </T>
              {parents.map((r) => (
                <View key={r.id} style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: color.line }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>{r.author ? <AuthorLine author={r.author} createdAt={r.createdAt} status={r.status} /> : null}</View>
                    <MoreMenu targetType="reply" targetId={r.id} isMe={!!r.author?.isMe} canReport={canPost} onDone={(a) => afterAction(a, false)} />
                  </View>
                  <T>{r.body}</T>
                  <Reactions targetType="reply" targetId={r.id} reactions={r.reactions} mine={r.myReactions} canReact={canPost && r.status === "live"} invalidate={invalidate} />
                </View>
              ))}
              {notice ? (
                <T variant="small" color={color.moss} accessibilityLiveRegion="polite">
                  {notice}
                </T>
              ) : null}
              {safety ? <SafetyCard notice={safety} /> : null}
              {send.error ? <ErrorNote message={(send.error as Error).message} /> : null}
            </View>
          ) : null}
        </Screen>

        {canReply ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: GUTTER, paddingVertical: space.sm, borderTopWidth: 1, borderColor: color.line, backgroundColor: color.card }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Reply kindly. Share what worked for you"
              placeholderTextColor={color.inkMuted}
              accessibilityLabel="Your reply"
              multiline
              maxLength={REPLY_MAX}
              style={[ui.input, { flex: 1, maxHeight: 120, paddingTop: 14 }]}
            />
            <IconButton icon="send" label="Send reply" size={52} tint={color.moss} onPress={() => (text.trim().length >= 2 && !send.isPending ? send.mutate() : undefined)} />
          </View>
        ) : post && !canPost ? (
          <View style={{ paddingHorizontal: GUTTER, paddingVertical: space.md, borderTopWidth: 1, borderColor: color.line, backgroundColor: color.card }}>
            <T variant="small" color={color.inkSoft}>
              <T variant="smallStrong" color={color.moss} onPress={() => router.push({ pathname: "/sign-in", params: { mode: "create" } })}>
                Create a free account
              </T>{" "}
              to reply. You'll stay anonymous.
            </T>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
