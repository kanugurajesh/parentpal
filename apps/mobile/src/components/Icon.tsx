import Svg, { Circle, Path, Rect } from "react-native-svg";
import { View } from "react-native";
import { color as c } from "@/theme/tokens";

export type IconName =
  | "home"
  | "story"
  | "ask"
  | "bell"
  | "person"
  | "plus"
  | "lock"
  | "thumbUp"
  | "thumbDown"
  | "copy"
  | "share"
  | "bookmark"
  | "bookmarkFilled"
  | "close"
  | "chevronRight"
  | "chevronLeft"
  | "send"
  | "check"
  | "spark"
  | "trash"
  | "people"
  | "more"
  | "heart";

/** Hand-drawn, 24px grid, 1.8 stroke, rounded caps: one consistent icon voice for the app. */
export function Icon({ name, size = 24, color = c.ink, filled = false }: { name: IconName; size?: number; color?: string; filled?: boolean }) {
  const s = { stroke: color, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const fillCol = filled ? color : "none";
  let body: React.ReactNode;
  switch (name) {
    case "home":
      body = <Path {...s} fill={fillCol} d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-3.8v-5.3H9.3v5.3H5.5A1.5 1.5 0 0 1 4 19z" />;
      break;
    case "story":
      // Three stacked pebbles: the app's moment motif.
      body = (
        <>
          <Path {...s} fill={fillCol} d="M6 17.5c0-1.6 2.6-2.8 6-2.8s6 1.2 6 2.8-2.6 2.9-6 2.9-6-1.3-6-2.9z" />
          <Path {...s} d="M7.6 11.6c0-1.4 2-2.5 4.5-2.5s4.4 1.1 4.4 2.5-2 2.4-4.4 2.4-4.5-1-4.5-2.4z" />
          <Path {...s} d="M9.6 6.2c0-1.1 1.1-1.9 2.5-1.9s2.4.8 2.4 1.9-1 1.9-2.4 1.9-2.5-.8-2.5-1.9z" />
        </>
      );
      break;
    case "ask":
      body = <Path {...s} fill={fillCol} d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.6V16H7.5A2.5 2.5 0 0 1 5 13.5z" />;
      break;
    case "bell":
      body = (
        <>
          <Path {...s} fill={fillCol} d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.8H5z" />
          <Path {...s} d="M10 20.3a2.2 2.2 0 0 0 4 0" />
        </>
      );
      break;
    case "person":
      body = (
        <>
          <Circle {...s} fill={fillCol} cx={12} cy={8.5} r={3.8} />
          <Path {...s} d="M4.8 20c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6" />
        </>
      );
      break;
    case "plus":
      body = <Path {...s} d="M12 5v14M5 12h14" />;
      break;
    case "lock":
      body = (
        <>
          <Rect {...s} x={5.5} y={10.5} width={13} height={9.5} rx={2.5} />
          <Path {...s} d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
        </>
      );
      break;
    case "thumbUp":
      body = <Path {...s} fill={fillCol} d="M8 10.5 11.3 4c1.4 0 2.3 1.1 2 2.5l-.6 3h5c1.2 0 2 1.1 1.7 2.2l-1.6 6.2a2 2 0 0 1-2 1.6H8zM4 10.5h4v9.5H4z" />;
      break;
    case "thumbDown":
      body = <Path {...s} fill={fillCol} d="M16 13.5 12.7 20c-1.4 0-2.3-1.1-2-2.5l.6-3h-5c-1.2 0-2-1.1-1.7-2.2l1.6-6.2a2 2 0 0 1 2-1.6H16zM20 13.5h-4V4h4z" />;
      break;
    case "copy":
      body = (
        <>
          <Rect {...s} x={8.5} y={8.5} width={11} height={11} rx={2.5} />
          <Path {...s} d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
        </>
      );
      break;
    case "share":
      body = (
        <>
          <Path {...s} d="M12 4v11M8 7.5 12 4l4 3.5" />
          <Path {...s} d="M6.5 11.5H6A1.5 1.5 0 0 0 4.5 13v5.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5h-.5" />
        </>
      );
      break;
    case "bookmark":
    case "bookmarkFilled":
      body = <Path {...s} fill={name === "bookmarkFilled" ? color : "none"} d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-4-6 4V5.5a1 1 0 0 1 1-1z" />;
      break;
    case "close":
      body = <Path {...s} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />;
      break;
    case "chevronRight":
      body = <Path {...s} d="M9.5 6l6 6-6 6" />;
      break;
    case "chevronLeft":
      body = <Path {...s} d="M14.5 6l-6 6 6 6" />;
      break;
    case "send":
      body = <Path {...s} fill={fillCol} d="M4.5 12 19.5 5l-4.2 14.5-3.7-5.8zM11.6 13.7 19.5 5" />;
      break;
    case "check":
      body = <Path {...s} d="M5 12.5l4.5 4.5L19 7.5" />;
      break;
    case "spark":
      body = <Path {...s} fill={fillCol} d="M12 3.5c.6 4.1 2.4 5.9 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5 4.1-.6 5.9-2.4 6.5-6.5zM18 15.5c.3 1.6 1 2.3 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.2-1.5-.9-2.2-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5z" />;
      break;
    case "trash":
      body = (
        <>
          <Path {...s} d="M4.5 7h15M9.5 7V5.3c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3V7" />
          <Path {...s} fill={fillCol} d="M6.5 7l.9 11.6c.1 1 .9 1.9 2 1.9h5.2c1.1 0 1.9-.9 2-1.9L17.5 7" />
          <Path {...s} d="M10.3 11v5.5M13.7 11v5.5" />
        </>
      );
      break;
    case "people":
      body = (
        <>
          <Circle {...s} fill={fillCol} cx={9} cy={8.5} r={3.3} />
          <Path {...s} d="M3.5 19.5c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" />
          <Path {...s} d="M15.2 5.6a3.2 3.2 0 0 1 0 6M17.2 14.7c1.8.6 3 2.2 3.4 4.8" />
        </>
      );
      break;
    case "more":
      body = (
        <>
          <Circle cx={6} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={18} cy={12} r={1.6} fill={color} />
        </>
      );
      break;
    case "heart":
      body = <Path {...s} fill={fillCol} d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />;
      break;
  }
  return (
    <View aria-hidden style={{ pointerEvents: "none" }}>
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
    </View>
  );
}
