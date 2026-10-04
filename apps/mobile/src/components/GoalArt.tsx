import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import { View } from "react-native";
import type { GoalCategory } from "@parentpal/shared";
import { categoryColor, color } from "@/theme/tokens";

/**
 * Original placeholder illustrations: flat shapes on a soft blob in the goal's category tint.
 * Drawn in a 120×120 box so they scale cleanly from a 56px chip to a full-width header.
 */
export function GoalArt({ illustration, category, size = 96 }: { illustration: string; category: GoalCategory; size?: number }) {
  const tone = categoryColor[category];
  const ink = color.ink;
  return (
    <View aria-hidden style={{ pointerEvents: "none" }}>
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d="M60 8c26 0 50 15 51 46 1 30-20 57-52 58C28 113 9 92 9 62 9 31 32 8 60 8z" fill={tone.tint} />
      {art(illustration, tone.deep, ink)}
    </Svg>
    </View>
  );
}

function art(key: string, deep: string, ink: string) {
  switch (key) {
    case "storm":
      return (
        <G>
          <Path d="M34 62c-8 0-13-6-13-12 0-7 6-12 13-12 2-10 11-16 21-16 11 0 19 7 21 16 9 0 16 6 16 13s-6 11-14 11z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M58 64 49 80h10l-6 16 18-22H60l6-10z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M34 72l-4 8M84 72l-4 8" stroke={deep} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "moon":
      return (
        <G>
          <Path d="M70 24c-16 3-27 17-27 33 0 19 15 34 34 34 8 0 15-3 20-7-22 2-38-17-34-38 1-8 4-15 7-22z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M32 34l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM90 48l1.5 3.5L95 53l-3.5 1.5L90 58l-1.5-3.5L85 53l3.5-1.5z" fill={deep} />
          <Circle cx={40} cy={70} r={3} fill={deep} />
        </G>
      );
    case "bowl":
      return (
        <G>
          <Path d="M22 58h76c0 20-16 34-38 34S22 78 22 58z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Circle cx={46} cy={52} r={7} fill="#7DB36A" stroke={ink} strokeWidth={2} />
          <Circle cx={60} cy={48} r={7} fill="#7DB36A" stroke={ink} strokeWidth={2} />
          <Path d="M70 54l20-22c3-3 7 1 4 4L72 56z" fill={color.apricot} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
          <Path d="M88 30l6-6M92 34l7-3" stroke="#7DB36A" strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "blocks":
      return (
        <G>
          <Rect x={28} y={64} width={28} height={28} rx={4} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Rect x={60} y={64} width={28} height={28} rx={4} fill={color.white} stroke={ink} strokeWidth={2.5} />
          <Rect x={44} y={34} width={28} height={28} rx={4} fill={deep} stroke={ink} strokeWidth={2.5} transform="rotate(-8 58 48)" />
        </G>
      );
    case "screen":
      return (
        <G>
          <Rect x={28} y={26} width={52} height={70} rx={8} fill={color.white} stroke={ink} strokeWidth={2.5} />
          <Circle cx={80} cy={78} r={16} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Path d="M80 70v8l5 4" stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
          <Path d="M40 40h28M40 50h20" stroke={deep} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "kite":
      return (
        <G>
          <Path d="M62 18l24 26-24 34-24-34z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M62 18v60M38 44h48" stroke={ink} strokeWidth={2} />
          <Path d="M62 78c-4 8 4 10 0 18s-10 8-14 4" stroke={deep} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        </G>
      );
    case "duck":
      return (
        <G>
          <Ellipse cx={58} cy={74} rx={30} ry={18} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Circle cx={74} cy={48} r={15} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Path d="M88 48l12 3-12 4z" fill={deep} stroke={ink} strokeWidth={2} strokeLinejoin="round" />
          <Circle cx={78} cy={45} r={2.5} fill={ink} />
        </G>
      );
    case "siblings":
      return (
        <G>
          <Circle cx={44} cy={44} r={13} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Path d="M24 94c0-16 9-28 20-28s20 12 20 28z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Circle cx={78} cy={56} r={10} fill={color.white} stroke={ink} strokeWidth={2.5} />
          <Path d="M62 94c0-12 7-22 16-22s16 10 16 22z" fill={deep} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
        </G>
      );
    case "volcano":
      return (
        <G>
          <Path d="M20 94l26-46h28l26 46z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M46 48c4 6 10 6 14 0 4 6 10 6 14 0" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M52 36l-4-10M60 34V22M68 36l4-10" stroke={deep} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "truth":
      return (
        <G>
          <Path d="M26 32h68a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H54L40 94V80H26a6 6 0 0 1-6-6V38a6 6 0 0 1 6-6z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M44 56l10 10 20-20" stroke={deep} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </G>
      );
    case "drop":
      return (
        <G>
          <Rect x={18} y={70} width={84} height={22} rx={10} fill={color.white} stroke={ink} strokeWidth={2.5} />
          <Path d="M60 22c10 14 18 24 18 34a18 18 0 0 1-36 0c0-10 8-20 18-34z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M90 30l1.5 3.5L95 35l-3.5 1.5L90 40l-1.5-3.5L85 35l3.5-1.5z" fill={deep} />
        </G>
      );
    case "chat":
      return (
        <G>
          <Path d="M20 28h46a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H38l-12 10V62h-6a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M54 58h46a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-6v10L82 90H54a6 6 0 0 1-6-6V64a6 6 0 0 1 6-6z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Circle cx={32} cy={45} r={3} fill={deep} />
          <Circle cx={43} cy={45} r={3} fill={deep} />
          <Circle cx={54} cy={45} r={3} fill={deep} />
        </G>
      );
    case "backpack":
      return (
        <G>
          <Path d="M48 30v-6a12 12 0 0 1 24 0v6" stroke={ink} strokeWidth={2.5} fill="none" />
          <Rect x={32} y={30} width={56} height={64} rx={14} fill={color.apricot} stroke={ink} strokeWidth={2.5} />
          <Rect x={42} y={62} width={36} height={22} rx={6} fill={color.white} stroke={ink} strokeWidth={2.5} />
          <Path d="M42 48h36" stroke={deep} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "hearts":
      return (
        <G>
          <Path d="M50 92S20 74 20 52c0-10 8-18 17-18 6 0 10 3 13 8 3-5 7-8 13-8 9 0 17 8 17 18 0 22-30 40-30 40z" fill={color.apricot} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d="M88 56s-14-8-14-18c0-5 4-8 8-8 3 0 5 1 6 4 1-3 3-4 6-4 4 0 8 3 8 8 0 10-14 18-14 18z" fill={color.white} stroke={ink} strokeWidth={2.5} strokeLinejoin="round" />
        </G>
      );
    default:
      return <Circle cx={60} cy={60} r={20} fill={deep} />;
  }
}
