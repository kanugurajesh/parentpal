import { useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import type { CommunityAuthor, CommunityPost, ReactionKind, ReportReason, TargetType, WorkedOutcome } from "@parentpal/shared";
import { api } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { color, radius, space } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Button, ErrorNote, IconButton, ListRow, T, type PState, styles as ui } from "./ui";

export const KIND_LABEL: Record<CommunityPost["kind"], string> = { question: "Question", worked: "What worked", share: "Sharing" };
export const OUTCOME_LABEL: Record<WorkedOutcome, string> = { helped: "It helped", somewhat: "Helped a bit", didnt: "Didn't help" };

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Pebble-coloured initial avatar: the pseudonym is the only identity a parent has here. */
function Avatar({ name }: { name: string }) {
  const tones = [color.mossTint, color.apricotTint, "#E4DBF7", "#D7EAF5"];
  const tone = tones[(name.charCodeAt(0) + name.length) % tones.length];
  return (
    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tone, alignItems: "center", justifyContent: "center" }}>
      <T variant="smallStrong">{name[0]}</T>
    </View>
  );
}

export function AuthorLine({ author, createdAt, status }: { author: CommunityAuthor; createdAt: string; status?: CommunityPost["status"] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Avatar name={author.pseudonym} />
      <View style={{ flex: 1 }}>
        <T variant="smallStrong">
          {author.pseudonym}
          {author.isMe ? <T variant="small" color={color.inkMuted}> (you)</T> : null}
        </T>
        <T variant="tiny" color={color.inkMuted}>
          {author.label} · {timeAgo(createdAt)}
        </T>
      </View>
      {status === "review" ? (
        <View style={{ backgroundColor: color.apricotTint, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 }}>
          <T variant="tiny" color="#8A4B12">
            Pending review
          </T>
        </View>
      ) : null}
    </View>
  );
}

function ReactionButton({ icon, label, count, active, onPress }: { icon: IconName; label: string; count: number; active: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{ selected: active }}
      hitSlop={6}
      style={({ pressed, focused }: PState) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingVertical: 6,
          paddingHorizontal: space.md,
          borderRadius: radius.pill,
          backgroundColor: active ? color.mossTint : pressed ? color.paperDeep : "transparent",
        },
        focused && ui.focusRing,
      ]}
    >
      <Icon name={icon} size={18} color={active ? color.moss : color.inkSoft} filled={active} />
      <T variant="smallStrong" color={active ? color.moss : color.inkSoft}>
        {label}
        {count ? ` · ${count}` : ""}
      </T>
    </Pressable>
  );
}

/** "Same here" and "Helpful": the only reactions. No downvotes, no scores. */
export function Reactions({
  targetType,
  targetId,
  reactions,
  mine,
  canReact,
  invalidate,
}: {
  targetType: TargetType;
  targetId: string;
  reactions: { same: number; helpful: number };
  mine: ReactionKind[];
  canReact: boolean;
  invalidate: unknown[][];
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (kind: ReactionKind) => api.react(targetType, targetId, kind),
    onSuccess: () => Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey }))),
  });
  const press = (kind: ReactionKind) => (canReact ? () => m.mutate(kind) : undefined);
  return (
    <View style={{ flexDirection: "row", gap: space.xs, marginLeft: -space.sm }}>
      <ReactionButton icon="heart" label="Same here" count={reactions.same} active={mine.includes("same")} onPress={press("same")} />
      <ReactionButton icon="thumbUp" label="Helpful" count={reactions.helpful} active={mine.includes("helpful")} onPress={press("helpful")} />
    </View>
  );
}

const REPORT_REASONS: { reason: ReportReason; label: string }[] = [
  { reason: "unkind", label: "Unkind or shaming" },
  { reason: "medical_advice", label: "Risky medical advice" },
  { reason: "personal_info", label: "Shares personal info" },
  { reason: "spam", label: "Spam or selling" },
];

/** Report, block or delete. Reports and blocks go through a small sheet; delete asks to confirm. */
export function MoreMenu({
  targetType,
  targetId,
  isMe,
  isGuide,
  canReport,
  onDone,
}: {
  targetType: TargetType;
  targetId: string;
  isMe: boolean;
  isGuide?: boolean;
  canReport: boolean;
  onDone: (action: "deleted" | "reported" | "blocked") => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = targetType === "post" ? "post" : "reply";

  const run = async (fn: () => Promise<unknown>, action: "deleted" | "reported" | "blocked") => {
    try {
      await fn();
      setOpen(false);
      onDone(action);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onPress = async () => {
    if (!isMe) return setOpen(true);
    const ok = await confirm({ title: `Delete this ${what}?`, message: "It will be removed for everyone. This can't be undone.", confirmLabel: "Delete", cancelLabel: "Cancel", tone: "danger", icon: "trash" });
    if (ok) await run(() => (targetType === "post" ? api.deletePost(targetId) : api.deleteReply(targetId)), "deleted");
  };

  return (
    <>
      <IconButton icon="more" label={isMe ? `Delete ${what}` : "Report or block"} onPress={() => void onPress()} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(30,42,58,0.35)", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: color.card, borderTopLeftRadius: radius.hero, borderTopRightRadius: radius.hero, padding: space.xl, paddingBottom: space.xxl, gap: space.sm }}>
            <T variant="h3" accessibilityRole="header">
              {canReport ? `Report this ${what}` : `About this ${what}`}
            </T>
            {canReport ? (
              <>
                <T variant="small" color={color.inkMuted}>
                  A moderator reviews every report. The author won't know who reported it.
                </T>
                {REPORT_REASONS.map((r) => (
                  <ListRow key={r.reason} label={r.label} icon="close" onPress={() => void run(() => api.report(targetType, targetId, r.reason), "reported")} />
                ))}
              </>
            ) : (
              <T variant="small" color={color.inkMuted}>
                Create a free account to report posts.
              </T>
            )}
            {!isGuide ? (
              <ListRow label="Block this parent" detail="Hide their posts and replies everywhere. They won't be told." icon="lock" danger onPress={() => void run(() => api.block(targetType, targetId), "blocked")} />
            ) : null}
            {error ? <ErrorNote message={error} /> : null}
            <Button label="Cancel" kind="ghost" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function PostCard({ post, onPress, canReact, invalidate }: { post: CommunityPost; onPress?: () => void; canReact: boolean; invalidate: unknown[][] }) {
  const body = (
    <View style={{ gap: space.md }}>
      <AuthorLine author={post.author} createdAt={post.createdAt} status={post.status} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <View style={{ backgroundColor: post.kind === "worked" ? color.apricotTint : color.paperDeep, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 2 }}>
          <T variant="tiny" color={post.kind === "worked" ? "#8A4B12" : color.inkSoft} style={{ fontFamily: "AtkinsonHyperlegible_700Bold" }}>
            {KIND_LABEL[post.kind]}
          </T>
        </View>
        {post.win ? (
          <T variant="tiny" color={color.inkSoft} style={{ alignSelf: "center" }}>
            {post.win.title}
            {post.outcome ? ` · ${OUTCOME_LABEL[post.outcome]}` : ""}
          </T>
        ) : null}
      </View>
      <T numberOfLines={onPress ? 6 : undefined}>{post.body}</T>
    </View>
  );
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, gap: space.md, borderWidth: 1.5, borderColor: color.line }}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Opens the post and its replies" style={({ focused }: PState) => [focused && ui.focusRing]}>
          {body}
        </Pressable>
      ) : (
        body
      )}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Reactions targetType="post" targetId={post.id} reactions={post.reactions} mine={post.myReactions} canReact={canReact && post.status === "live"} invalidate={invalidate} />
        {onPress ? (
          <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Icon name="ask" size={18} color={color.inkSoft} />
            <T variant="smallStrong" color={color.inkSoft}>
              {post.replyCount}
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export const openPost = (id: string) => router.push({ pathname: "/post/[id]", params: { id } });
