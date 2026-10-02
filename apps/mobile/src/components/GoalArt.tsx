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
    default:
      return <Circle cx={60} cy={60} r={20} fill={deep} />;
  }
}
