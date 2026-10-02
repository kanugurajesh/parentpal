import type { PState } from "@/components/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { Moment, Pattern } from "@parentpal/shared";
import { color, radius, space } from "@/theme/tokens";
import { Icon } from "./Icon";
import { momentDate } from "./MomentCard";
import { Pebble, pebbleIndex } from "./Pebble";
import { T, styles as ui } from "./ui";

/**
 * The insight card. A thread runs through the pebbles of the moments it was built from;
 * "See the moments" expands the actual entries so the parent can check the claim.
 */
export function PatternCard({ pattern, moments }: { pattern: Pattern; moments: Moment[] }) {
  const [open, setOpen] = useState(false);
  const linked = pattern.momentIds.map((id) => moments.find((m) => m.id === id)).filter((m): m is Moment => !!m);

  return (
    <View style={{ backgroundColor: color.apricotTint, borderRadius: radius.hero, padding: space.xl, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name="spark" size={18} color="#8A4B12" />
        <T variant="smallStrong" color="#8A4B12">
          Pattern insight
        </T>
      </View>
      <T variant="h2">{pattern.title}</T>
      <T>{pattern.insight}</T>
      <View style={{ backgroundColor: color.card, borderRadius: radius.inner, padding: space.lg, gap: space.xs }}>
        <T variant="smallStrong" color={color.moss}>
          Try next time
        </T>
        <T>{pattern.suggestion}</T>
      </View>

      {/* Evidence thread */}
      <View style={{ height: 44, justifyContent: "center" }} aria-hidden>
        <Svg width="100%" height={44} style={{ position: "absolute" }} viewBox="0 0 300 44" preserveAspectRatio="none">
          <Path d="M10 22 C 60 4, 90 40, 150 22 S 240 4, 290 22" stroke={color.ink} strokeWidth={1.5} strokeDasharray="4 5" fill="none" />
        </Svg>
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          {linked.map((m) => (
            <Pebble key={m.id} width={44} fill={color.apricot} stroke={color.ink} strokeWidth={3} shape={pebbleIndex(m.id)} />
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ focused }: PState) => [{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingVertical: space.xs }, focused && ui.focusRing]}
      >
        <T variant="smallStrong" color={color.moss}>
          {open ? "Hide the moments" : `See the ${linked.length} moments this is based on`}
        </T>
        <View style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }}>
          <Icon name="chevronRight" size={16} color={color.moss} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: space.sm }}>
          {linked.map((m) => (
            <View key={m.id} style={{ backgroundColor: color.card, borderRadius: radius.inner, padding: space.md, gap: 2 }}>
              <T variant="tiny" color={color.inkMuted}>
                {momentDate(m.createdAt)}
                {m.trigger ? `, ${m.trigger.toLowerCase()}` : ""}
              </T>
              <T variant="small">{m.text}</T>
            </View>
          ))}
        </View>
      ) : null}
      <T variant="tiny" color={color.inkSoft}>
        AI-generated from your entries. A pattern is a hint, not a diagnosis.
      </T>
    </View>
  );
}
