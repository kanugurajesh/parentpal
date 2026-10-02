import { View } from "react-native";
import type { Moment } from "@parentpal/shared";
import { color, radius, space } from "@/theme/tokens";
import { Pebble, pebbleIndex } from "./Pebble";
import { T } from "./ui";

export const momentDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

const TAGS: { key: "trigger" | "behavior" | "outcome"; label: string }[] = [
  { key: "trigger", label: "Before" },
  { key: "behavior", label: "What happened" },
  { key: "outcome", label: "How it ended" },
];

export function MomentCard({ moment, highlight, footer }: { moment: Moment; highlight?: boolean; footer?: React.ReactNode }) {
  const fill = moment.tagStatus === "safety" ? color.dangerTint : highlight ? color.apricot : color.mossTint;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: space.md,
        backgroundColor: color.card,
        borderRadius: radius.card,
        padding: space.lg,
        borderWidth: 1.5,
        borderColor: highlight ? color.apricot : color.line,
      }}
    >
      <View style={{ paddingTop: 2 }} aria-hidden>
        <Pebble width={34} fill={fill} stroke={color.ink} strokeWidth={3} shape={pebbleIndex(moment.id)} />
      </View>
      <View style={{ flex: 1, gap: space.sm }}>
        <T variant="tiny" color={color.inkMuted}>
          {momentDate(moment.createdAt)}
        </T>
        <T>{moment.text}</T>
        {moment.tagStatus === "ok" ? (
          <View style={{ gap: 4 }}>
            {TAGS.filter((t) => moment[t.key]).map((t) => (
              <View key={t.key} style={{ flexDirection: "row", gap: space.sm, alignItems: "baseline" }}>
                <T variant="tiny" color={color.inkMuted} style={{ width: 92 }}>
                  {t.label}
                </T>
                <T variant="smallStrong" style={{ flex: 1 }}>
                  {moment[t.key]}
                </T>
              </View>
            ))}
          </View>
        ) : moment.tagStatus === "failed" ? (
          <T variant="tiny" color={color.inkMuted}>
            Saved. We couldn't add tags this time.
          </T>
        ) : (
          <T variant="tiny" color={color.danger}>
            Saved privately. Not analysed, because it may need a professional's help.
          </T>
        )}
        {footer}
      </View>
    </View>
  );
}
