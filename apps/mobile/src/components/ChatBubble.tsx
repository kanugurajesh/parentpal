import type { PState } from "@/components/ui";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Share, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import type { ChatMessage, Citation } from "@parentpal/shared";
import { color, radius, space, type as typeScale } from "@/theme/tokens";
import { Icon } from "./Icon";
import { SafetyCard } from "./SafetyCard";
import { Chip, Disclaimer, IconButton, T, styles as ui } from "./ui";

/** Renders "[1]" markers as small superscript-style tags that match the source list below. */
function withCitations(text: string, keyPrefix: string) {
  return text.split(/(\[\d+\])/g).map((p, i) =>
    /^\[\d+\]$/.test(p) ? (
      <T key={`${keyPrefix}-${i}`} variant="tiny" color={color.moss} style={{ fontFamily: typeScale.smallStrong.fontFamily }}>
        {` ${p.slice(1, -1)} `}
      </T>
    ) : (
      p
    ),
  );
}

/**
 * The small slice of Markdown models actually produce in chat: **bold**, *italic*, `code`.
 * Italic and code render as plain text (the body font has no italic face). Unclosed markers,
 * e.g. mid-stream, are dropped rather than shown as raw asterisks.
 */
function inline(text: string, key: string) {
  return text.split(/(\*\*[^*\n]+?\*\*)/g).map((p, i) => {
    const k = `${key}-${i}`;
    if (/^\*\*.+\*\*$/.test(p)) {
      return (
        <T key={k} style={{ fontFamily: typeScale.bodyStrong.fontFamily }}>
          {withCitations(p.slice(2, -2), k)}
        </T>
      );
    }
    const clean = p
      .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1$2")
      .replace(/`([^`\n]+)`/g, "$1")
      .replace(/\*\*/g, "");
    return withCitations(clean, k);
  });
}

type Block = { kind: "para"; text: string } | { kind: "heading"; text: string } | { kind: "item"; marker: string; text: string };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      blocks.push({ kind: "para", text: "" });
    } else if ((m = line.match(/^\s{0,3}#{1,6}\s+(.*)$/))) {
      blocks.push({ kind: "heading", text: m[1] });
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      blocks.push({ kind: "item", marker: "•", text: m[1] });
    } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      blocks.push({ kind: "item", marker: `${m[1]}.`, text: m[2] });
    } else {
      const prev = blocks[blocks.length - 1];
      // Consecutive plain lines stay one paragraph, keeping the model's line breaks.
      if (prev?.kind === "para" && prev.text) prev.text += `\n${line}`;
      else blocks.push({ kind: "para", text: line });
    }
  }
  // Blank lines only separate blocks; the gap between Views provides the spacing.
  return blocks.filter((b) => b.kind !== "para" || b.text);
}

export function AnswerText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <View style={{ gap: space.sm }}>
      {blocks.map((b, i) =>
        b.kind === "item" ? (
          <View key={i} style={{ flexDirection: "row", gap: space.sm, paddingLeft: space.xs }}>
            <T style={{ minWidth: 16 }}>{b.marker}</T>
            <T style={{ flex: 1 }}>{inline(b.text, `b${i}`)}</T>
          </View>
        ) : (
          <T key={i} variant={b.kind === "heading" ? "bodyStrong" : "body"}>
            {inline(b.text, `b${i}`)}
          </T>
        ),
      )}
    </View>
  );
}

/** Copy/share text: no citation markers or Markdown syntax. */
function toPlain(text: string) {
  return text
    .replace(/\s?\[\d+\]/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^(\s*)[-*]\s+/gm, "$1• ")
    .replace(/\*\*|`/g, "");
}

function Caret() {
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduced) o.value = withRepeat(withTiming(0.2, { duration: 500 }), -1, true);
  }, [o, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 8, height: 18, borderRadius: 2, backgroundColor: color.moss, marginTop: 4 }, style]} />;
}

export function Sources({ citations }: { citations: Citation[] }) {
  if (!citations.length) return null;
  return (
    <View style={{ gap: space.xs }}>
      <T variant="tiny" color={color.inkMuted}>
        Based on
      </T>
      {citations.map((c, i) => (
        <Pressable
          key={c.chunkId}
          accessibilityRole="link"
          accessibilityLabel={`Source ${i + 1}: ${c.goalTitle}, ${c.label}`}
          onPress={() => router.push({ pathname: "/goal/[slug]", params: { slug: c.goalSlug } })}
          style={({ pressed, focused }: PState) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              backgroundColor: pressed ? color.mossTint : color.paper,
              borderRadius: radius.inner,
              paddingVertical: space.sm,
              paddingHorizontal: space.md,
            },
            focused && ui.focusRing,
          ]}
        >
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: color.mossTint, alignItems: "center", justifyContent: "center" }}>
            <T variant="tiny" color={color.moss} style={{ fontFamily: typeScale.smallStrong.fontFamily }}>
              {i + 1}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T variant="smallStrong">{c.label}</T>
            <T variant="tiny" color={color.inkMuted}>
              {c.goalTitle}
            </T>
          </View>
          <Icon name="chevronRight" size={16} color={color.inkMuted} />
        </Pressable>
      ))}
    </View>
  );
}

export function UserBubble({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: color.ink, borderRadius: radius.card, borderBottomRightRadius: 6, padding: space.md, paddingHorizontal: space.lg }}>
      <T color={color.white}>{text}</T>
    </View>
  );
}

export function AssistantBubble({
  message,
  streaming,
  onRate,
  onBookmark,
  onPickOption,
  optionsDisabled,
  onAskParents,
}: {
  message: ChatMessage;
  streaming?: boolean;
  onRate?: (r: 1 | -1) => void;
  onBookmark?: (on: boolean) => void;
  onPickOption?: (o: string) => void;
  optionsDisabled?: boolean;
  /** Offers to take the question to a Circle when the guide answer isn't enough. */
  onAskParents?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const plain = toPlain(message.content);

  if (message.kind === "safety" && message.safety) {
    return (
      <View style={{ maxWidth: "95%" }}>
        <SafetyCard notice={message.safety} />
      </View>
    );
  }

  return (
    <View style={{ alignSelf: "flex-start", maxWidth: "95%", gap: space.sm }}>
      <View style={{ backgroundColor: color.card, borderRadius: radius.card, borderBottomLeftRadius: 6, padding: space.lg, gap: space.md, borderWidth: 1.5, borderColor: color.line }}>
        {message.content ? <AnswerText text={message.content} /> : null}
        {streaming ? <Caret /> : null}
        {message.kind === "clarify" && message.clarifyOptions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {message.clarifyOptions.map((o) => (
              <Chip key={o} label={o} onPress={optionsDisabled ? undefined : () => onPickOption?.(o)} />
            ))}
          </View>
        ) : null}
        {!streaming && message.kind === "answer" ? <Sources citations={message.citations} /> : null}
        {message.safety && message.kind === "answer" ? <SafetyCard notice={message.safety} /> : null}
        {!streaming ? <Disclaimer /> : null}
      </View>
      {!streaming && message.kind === "answer" ? (
        <View style={{ flexDirection: "row", gap: 2, marginLeft: space.xs }}>
          <IconButton icon="thumbUp" label="Helpful" active={message.rating === 1} onPress={() => onRate?.(1)} />
          <IconButton icon="thumbDown" label="Not helpful" active={message.rating === -1} onPress={() => onRate?.(-1)} />
          <IconButton
            icon={copied ? "check" : "copy"}
            label={copied ? "Copied" : "Copy"}
            onPress={async () => {
              await Clipboard.setStringAsync(plain);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          <IconButton icon="share" label="Share" onPress={() => Share.share({ message: `${plain}\n\n(From ParentPal. AI-generated, not medical advice.)` }).catch(() => {})} />
          <IconButton
            icon={message.bookmarked ? "bookmarkFilled" : "bookmark"}
            label={message.bookmarked ? "Remove bookmark" : "Bookmark"}
            active={message.bookmarked}
            onPress={() => onBookmark?.(!message.bookmarked)}
          />
        </View>
      ) : null}
      {!streaming && message.kind === "answer" && onAskParents ? (
        <Pressable
          onPress={onAskParents}
          accessibilityRole="button"
          accessibilityHint="Opens a new anonymous post in Circles with your question"
          style={({ pressed, focused }: PState) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
              alignSelf: "flex-start",
              marginLeft: space.sm,
              paddingVertical: space.xs,
              paddingHorizontal: space.md,
              borderRadius: radius.pill,
              backgroundColor: pressed || message.rating === -1 ? color.mossTint : "transparent",
            },
            focused && ui.focusRing,
          ]}
        >
          <Icon name="people" size={18} color={color.moss} />
          <T variant="smallStrong" color={color.moss}>
            {message.rating === -1 ? "Not quite right? Ask other parents" : "Ask other parents"}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}
