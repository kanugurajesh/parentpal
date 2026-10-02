import { createElement } from "react";
import { View } from "react-native";
import { color, radius, space, type as typeScale } from "@/theme/tokens";
import { T } from "./ui";

export interface MonthYear {
  month: number;
  year: number;
}

export const formatMonthYear = (v: MonthYear) =>
  new Date(v.year, v.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

/**
 * Web fallback: the community date picker has no web build, so we use the browser's own
 * month picker (<input type="month">). It's still the platform's native control, and it
 * asks only for what we store.
 */
export function BirthDatePicker({ value, onChange, label }: { value: MonthYear | null; onChange: (v: MonthYear) => void; label: string }) {
  const now = new Date();
  const fmt = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  return (
    <View style={{ gap: space.sm }}>
      <T variant="smallStrong" color={color.inkSoft}>
        {label}
      </T>
      {createElement("input", {
        type: "month",
        "aria-label": label,
        value: value ? fmt(value.year, value.month) : "",
        max: fmt(now.getFullYear(), now.getMonth() + 1),
        min: fmt(now.getFullYear() - 12, 1),
        onChange: (e: { target: { value: string } }) => {
          const [y, m] = e.target.value.split("-").map(Number);
          if (y && m) onChange({ year: y, month: m });
        },
        style: {
          ...typeScale.body,
          fontFamily: "AtkinsonHyperlegible_400Regular, system-ui, sans-serif",
          color: color.ink,
          background: color.card,
          border: `1.5px solid ${color.line}`,
          borderRadius: radius.inner,
          height: 52,
          lineHeight: "normal",
          padding: `0 ${space.lg}px`,
          boxSizing: "border-box",
          width: "100%",
        },
      })}
    </View>
  );
}
