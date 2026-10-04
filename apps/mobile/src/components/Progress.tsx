import type { ReactNode } from "react";
import { View } from "react-native";
import type { GoalProgress, ProgressTrend, WinAdvice, WorkedOutcome } from "@parentpal/shared";
import { Icon, type IconName } from "@/components/Icon";
import { Chip, T } from "@/components/ui";
import { color, radius, space } from "@/theme/tokens";

export const OUTCOMES: { value: WorkedOutcome; label: string }[] = [
  { value: "helped", label: "Helped" },
  { value: "somewhat", label: "A bit" },
  { value: "didnt", label: "Not yet" },
];

const DOT: Record<WorkedOutcome, string> = { helped: color.moss, somewhat: color.apricot, didnt: color.line };

/** Three chips for "How did it go?". */
export function OutcomePicker({ value, onPick, disabled }: { value?: WorkedOutcome | null; onPick: (o: WorkedOutcome) => void; disabled?: boolean }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="How did it go?">
      {OUTCOMES.map((o) => (
        <Chip key={o.value} label={o.label} selected={value === o.value} onPress={disabled ? undefined : () => onPick(o.value)} />
      ))}
    </View>
  );
}

const trendText = (t: ProgressTrend) => `Helped ${t.now.helped} of ${t.now.tried} this week, up from ${t.start.helped} of ${t.start.tried} in week 1`;

/** "Helped 3 of the last 5 tries", or null before anything is reported. Shows the trend once there is one. */
export function progressLine(p: Pick<GoalProgress, "recent" | "trend"> | undefined) {
  if (!p?.recent.length) return null;
  // Only brag about change when it's an improvement; a dip shows as the plain recent count.
  if (p.trend && p.trend.now.helped / p.trend.now.tried > p.trend.start.helped / p.trend.start.tried) return trendText(p.trend);
  const helped = p.recent.filter((o) => o === "helped").length;
  return p.recent.length === 1 ? (helped ? "Helped the first time you tried" : "1 try so far") : `Helped ${helped} of the last ${p.recent.length} tries`;
}

/** Oldest to newest: green helped, apricot a bit, grey not yet. */
export function ProgressDots({ recent }: { recent: WorkedOutcome[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {recent.map((o, i) => (
        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: DOT[o], borderWidth: o === "didnt" ? 1.5 : 0, borderColor: color.inkMuted }} />
      ))}
    </View>
  );
}

/** The goal screen's summary: dots plus counts. */
export function ProgressCard({ progress }: { progress: GoalProgress }) {
  const line = progressLine(progress);
  return (
    <View
      style={{ backgroundColor: color.card, borderRadius: radius.card, padding: space.lg, gap: space.sm, borderWidth: 1.5, borderColor: color.line }}
      accessible
      accessibilityLabel={`Your progress. ${line ?? ""}. ${progress.helped} helped, ${progress.somewhat} helped a bit, ${progress.didnt} not yet.`}
    >
      <T variant="smallStrong" color={color.inkMuted}>
        Your progress
      </T>
      <T variant="h3">{line}</T>
      <ProgressDots recent={progress.recent} />
      {progress.trend ? <TrendBars trend={progress.trend} /> : null}
      <T variant="tiny" color={color.inkMuted}>
        {progress.tried} {progress.tried === 1 ? "try" : "tries"} · {progress.helped} helped · {progress.somewhat} a bit · {progress.didnt} not yet
      </T>
    </View>
  );
}

/** Week 1 against this week, as two bars of "helped" share. */
function TrendBars({ trend }: { trend: ProgressTrend }) {
  const rows = [
    { label: "Week 1", ...trend.start },
    { label: "This week", ...trend.now },
  ];
  return (
    <View style={{ gap: space.xs, marginTop: space.xs }}>
      {rows.map((r) => (
        <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <T variant="tiny" color={color.inkMuted} style={{ width: 64 }}>
            {r.label}
          </T>
          <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: color.paperDeep, overflow: "hidden" }}>
            <View style={{ width: `${Math.round((r.helped / r.tried) * 100)}%`, height: "100%", backgroundColor: color.moss }} />
          </View>
          <T variant="tiny" color={color.ink} style={{ width: 64, textAlign: "right" }}>
            {r.helped} of {r.tried}
          </T>
        </View>
      ))}
    </View>
  );
}

const ADVICE_STYLE: Record<WinAdvice["kind"], { icon: IconName; bg: string; fg: string }> = {
  keep: { icon: "check", bg: color.mossTint, fg: color.mossDeep },
  patience: { icon: "check", bg: color.apricotTint, fg: "#8A4B12" },
  switch: { icon: "chevronRight", bg: color.paperDeep, fg: color.ink },
  ask: { icon: "ask", bg: color.paperDeep, fg: color.ink },
};

/** The rule-based next step under a win. */
export function AdviceNote({ advice, action }: { advice: WinAdvice; action?: ReactNode }) {
  const st = ADVICE_STYLE[advice.kind];
  return (
    <View style={{ backgroundColor: st.bg, borderRadius: radius.inner, padding: space.md, gap: space.sm }} accessibilityLiveRegion="polite">
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name={st.icon} size={18} color={st.fg} />
        <T variant="smallStrong" color={st.fg} style={{ flex: 1 }}>
          {advice.text}
        </T>
      </View>
      {action}
    </View>
  );
}
