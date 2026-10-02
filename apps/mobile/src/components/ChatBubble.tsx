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
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <T>
      {parts.map((p, i) =>
        /^\[\d+\]$/.test(p) ? (
          <T key={i} variant="tiny" color={color.moss} style={{ fontFamily: typeScale.smallStrong.fontFamily }}>
            {` ${p.slice(1, -1)} `}
          </T>
        ) : (
          p
        ),
      )}
    </T>
  );
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

function Sources({ citations }: { citations: Citation[] }) {
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
}: {
  message: ChatMessage;
  streaming?: boolean;
  onRate?: (r: 1 | -1) => void;
  onBookmark?: (on: boolean) => void;
  onPickOption?: (o: string) => void;
  optionsDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const plain = message.content.replace(/\s?\[\d+\]/g, "");

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
    </View>
  );
}
