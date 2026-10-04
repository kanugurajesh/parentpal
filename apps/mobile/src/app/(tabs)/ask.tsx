import type { PState } from "@/components/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage, Topic } from "@parentpal/shared";
import { AssistantBubble, UserBubble } from "@/components/ChatBubble";
import { Icon } from "@/components/Icon";
import { Button, ErrorNote, Loading, T, styles as ui } from "@/components/ui";
import { api, streamChat } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { ChildSwitcher } from "@/components/ChildSwitcher";
import { useActiveChild } from "@/lib/session";
import { color, GUTTER, radius, space, type as typeScale } from "@/theme/tokens";

type ChatData = { messages: ChatMessage[] };

function TopicList({ topics, onAsk, initial }: { topics: Topic[]; onAsk: (q: string) => void; initial?: string }) {
  const [open, setOpen] = useState<string | null>(initial ?? topics[0]?.goalSlug ?? null);
  return (
    <View style={{ gap: space.sm }}>
      {topics.map((t) => (
        <View key={t.goalSlug} style={{ backgroundColor: color.card, borderRadius: radius.card, borderWidth: 1.5, borderColor: color.line, overflow: "hidden" }}>
          <Pressable
            onPress={() => setOpen(open === t.goalSlug ? null : t.goalSlug)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open === t.goalSlug }}
            style={({ focused }: PState) => [{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: space.lg }, focused && ui.focusRing]}
          >
            <T variant="bodyStrong">{t.title}</T>
            <View style={{ transform: [{ rotate: open === t.goalSlug ? "-90deg" : "90deg" }] }}>
              <Icon name="chevronRight" size={18} color={color.inkMuted} />
            </View>
          </Pressable>
          {open === t.goalSlug
            ? t.questions.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => onAsk(q)}
                  accessibilityRole="button"
                  style={({ pressed }) => ({ paddingHorizontal: space.lg, paddingVertical: space.md, borderTopWidth: 1, borderColor: color.line, backgroundColor: pressed ? color.mossTint : "transparent" })}
                >
                  <T color={color.moss}>{q}</T>
                </Pressable>
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

export default function Ask() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ topic?: string }>();
  const child = useActiveChild();
  const chat = useQuery({ queryKey: ["chat"], queryFn: api.chat });
  const starters = useQuery({ queryKey: ["starters", child?.id], queryFn: () => api.starters(child?.id) });
  const topics = useQuery({ queryKey: ["topics"], queryFn: api.topics, staleTime: Infinity });
  const [input, setInput] = useState("");
  const [showTopics, setShowTopics] = useState(!!params.topic);
  const [pending, setPending] = useState<{ user: string; reply: ChatMessage | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const busy = !!pending;

  useEffect(() => {
    if (params.topic) setShowTopics(true);
  }, [params.topic]);

  const patchMessage = (m: ChatMessage) =>
    qc.setQueryData<ChatData>(["chat"], (d) => (d ? { messages: d.messages.map((x) => (x.id === m.id ? m : x)) } : d));
  const rate = useMutation({ mutationFn: ({ id, r }: { id: string; r: 1 | -1 }) => api.feedback(id, r), onSuccess: patchMessage });
  const mark = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.bookmark(id, on),
    onSuccess: (m) => {
      patchMessage(m);
      qc.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });

  const clear = useMutation({
    mutationFn: api.clearChat,
    onSuccess: (d) => {
      qc.setQueryData<ChatData>(["chat"], d);
      setError(null);
    },
    onError: (err) => setError((err as Error).message),
  });

  async function send(text: string, clarifies?: string) {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    setError(null);
    setShowTopics(false);
    setPending({ user: t, reply: null });
    const append = (m: ChatMessage) => qc.setQueryData<ChatData>(["chat"], (d) => ({ messages: [...(d?.messages ?? []), m] }));
    try {
      await streamChat({ text: t, clarifies, childId: child?.id }, (e) => {
        if (e.type === "user") {
          append(e.message);
          setPending((p) => (p ? { ...p, user: "" } : p));
        } else if (e.type === "meta") {
          setPending((p) =>
            p && {
              ...p,
              reply: {
                id: "streaming",
                role: "assistant",
                kind: e.kind,
                content: "",
                citations: [],
                clarifyOptions: e.clarifyOptions,
                safety: e.safety,
                rating: null,
                bookmarked: false,
                createdAt: new Date().toISOString(),
              },
            },
          );
        } else if (e.type === "delta") {
          setPending((p) => (p?.reply ? { ...p, reply: { ...p.reply, content: p.reply.content + e.text } } : p));
        } else if (e.type === "done") {
          append(e.message);
          setPending(null);
        } else if (e.type === "error") {
          setError(e.message);
        }
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["chat"] });
    }
  }

  const messages = chat.data?.messages ?? [];
  const lastClarifyId = [...messages].reverse().find((m) => m.role === "assistant")?.kind === "clarify" ? [...messages].reverse().find((m) => m.role === "assistant")!.id : null;
  const empty = !messages.length && !pending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: GUTTER, paddingTop: space.lg, paddingBottom: space.sm }}>
        <T variant="h1" accessibilityRole="header">
          Ask
        </T>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {messages.length ? (
            <Button
              label="Clear"
              kind="ghost"
              loading={clear.isPending}
              disabled={busy}
              accessibilityHint="Deletes this chat. Bookmarked answers are kept."
              onPress={async () => {
                const ok = await confirm({
                  title: "Clear this chat?",
                  message: "The conversation will be deleted and the next question starts fresh. Bookmarked answers stay in Bookmarks.",
                  confirmLabel: "Clear chat",
                  tone: "danger",
                });
                if (ok) clear.mutate();
              }}
            />
          ) : null}
          <Button label={showTopics ? "Hide topics" : "View topics"} kind="ghost" onPress={() => setShowTopics((s) => !s)} />
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
        <ScrollView
          ref={scroll}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: space.xl, gap: space.lg }}
          onContentSizeChange={() => !showTopics && scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
        >
          {chat.isLoading ? <Loading /> : null}
          {chat.error ? <ErrorNote message={(chat.error as Error).message} onRetry={() => chat.refetch()} /> : null}

          {showTopics && topics.data ? <TopicList topics={topics.data.topics} onAsk={(q) => send(q)} initial={params.topic} /> : null}

          {empty && !showTopics && chat.data ? (
            <View style={{ gap: space.lg, paddingTop: space.md }}>
              <T variant="h2">What's on your mind{child ? ` about ${child.nickname}` : ""}?</T>
              <T color={color.inkSoft}>
                Answers use {child ? `${child.nickname}'s` : "your child's"} age, your goals and the moments you've logged, and show which guide they're based on.
              </T>
              <View style={{ gap: space.sm }}>
                {starters.data?.starters.map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => send(s)}
                    accessibilityRole="button"
                    style={({ pressed, focused }: PState) => [
                      { backgroundColor: pressed ? color.mossTint : color.card, borderRadius: radius.card, padding: space.lg, borderWidth: 1.5, borderColor: color.line },
                      focused && ui.focusRing,
                    ]}
                  >
                    <T>{s}</T>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserBubble key={m.id} text={m.content} />
            ) : (
              <AssistantBubble
                key={m.id}
                message={m}
                optionsDisabled={busy || m.id !== lastClarifyId}
                onPickOption={(o) => send(o, m.id)}
                onRate={(r) => rate.mutate({ id: m.id, r })}
                onBookmark={(on) => mark.mutate({ id: m.id, on })}
                onAskParents={() => {
                  const question = messages.slice(0, i).reverse().find((x) => x.role === "user")?.content ?? "";
                  router.push({
                    pathname: "/post/new",
                    params: { kind: "question", body: question, ...(m.citations[0] ? { goal: m.citations[0].goalSlug } : {}) },
                  });
                }}
              />
            ),
          )}
          {pending?.user ? <UserBubble text={pending.user} /> : null}
          {pending ? (
            pending.reply ? (
              <AssistantBubble message={pending.reply} streaming={pending.reply.kind === "answer"} />
            ) : (
              <View style={{ alignSelf: "flex-start", padding: space.lg }} accessibilityLabel="ParentPal is thinking">
                <Loading />
              </View>
            )
          ) : null}
          {error ? <ErrorNote message={error} /> : null}
        </ScrollView>

        {/* With two children, which one the next question is about. */}
        <ChildSwitcher style={{ paddingHorizontal: GUTTER, paddingTop: space.sm, backgroundColor: color.card, borderTopWidth: 1, borderColor: color.line }} />

        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, paddingHorizontal: GUTTER, paddingVertical: space.sm, borderTopWidth: 1, borderColor: color.line, backgroundColor: color.card }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={child ? `Ask about ${child.nickname}…` : "Ask a parenting question…"}
            placeholderTextColor={color.inkMuted}
            accessibilityLabel="Your question"
            multiline
            maxLength={2000}
            onSubmitEditing={() => send(input)}
            blurOnSubmit
            style={{ ...typeScale.body, flex: 1, color: color.ink, maxHeight: 120, minHeight: 44, paddingVertical: 10, paddingHorizontal: space.lg, backgroundColor: color.paper, borderRadius: 22 }}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={!input.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={({ pressed, focused }: PState) => [
              { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: !input.trim() || busy ? color.line : pressed ? color.mossDeep : color.moss },
              focused && ui.focusRing,
            ]}
          >
            <Icon name="send" size={20} color={color.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
