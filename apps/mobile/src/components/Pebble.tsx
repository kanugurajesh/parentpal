import Svg, { Path } from "react-native-svg";
import { View } from "react-native";

/** Five hand-tuned pebble outlines in a 100×70 box. Picking by index keeps each moment's shape stable. */
const SHAPES = [
  "M6 44C4 28 18 12 40 9c22-3 46 2 52 18 6 16-4 32-24 37-22 5-58 2-62-20z",
  "M10 34C12 16 34 6 58 9c22 3 36 15 34 30-2 17-20 25-44 25C24 64 8 52 10 34z",
  "M4 40C6 24 22 10 44 8c18-2 34 4 44 14 10 12 6 30-10 38-18 8-44 8-60 0C8 54 3 48 4 40z",
  "M12 30C18 14 40 4 62 10c20 6 32 20 28 34-4 14-22 22-46 20C22 62 6 48 12 30z",
  "M8 38C8 22 20 12 36 10c10-1 16 3 26 2 14-2 30 6 32 22 2 18-16 30-44 30C24 64 8 54 8 38z",
];

export function pebbleIndex(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % SHAPES.length;
}

export function Pebble({
  width = 100,
  fill,
  stroke,
  shape = 0,
  strokeWidth = 2,
}: {
  width?: number;
  fill: string;
  stroke?: string;
  shape?: number;
  strokeWidth?: number;
}) {
  return (
    <View aria-hidden style={{ pointerEvents: "none" }}>
      <Svg width={width} height={width * 0.7} viewBox="0 0 100 70">
        <Path d={SHAPES[shape % SHAPES.length]} fill={fill} stroke={stroke ?? "none"} strokeWidth={strokeWidth} />
      </Svg>
    </View>
  );
}
