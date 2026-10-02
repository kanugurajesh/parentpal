import type { GoalCategory } from "@parentpal/shared";

/**
 * ParentPal palette. Cool, sage-tinted paper rather than cream; moss for action;
 * apricot reserved for "wins" and insights. Category colours are information, not decoration:
 * a goal's tint tells you its area at a glance, and the same tint follows it everywhere.
 */
export const color = {
  paper: "#F2F5F0",
  paperDeep: "#E6ECE4",
  card: "#FBFCFA",
  ink: "#1E2A3A",
  inkSoft: "#4A5768",
  inkMuted: "#7A8696",
  line: "#D5DDD3",
  moss: "#2E6A4F",
  mossDeep: "#21503B",
  mossTint: "#DCEAE1",
  apricot: "#F4A259",
  apricotTint: "#FCE6CF",
  danger: "#B3261E",
  dangerTint: "#FBE3E0",
  white: "#FFFFFF",
} as const;

export const categoryColor: Record<GoalCategory, { tint: string; deep: string; label: string }> = {
  emotion: { tint: "#E4DBF7", deep: "#5B45A0", label: "Emotion" },
  sleep: { tint: "#D7EAF5", deep: "#2C6A93", label: "Sleep" },
  focus: { tint: "#EEF3C6", deep: "#5E6B12", label: "Focus" },
  habits: { tint: "#FBE1C8", deep: "#9A5218", label: "Habits" },
};

export const font = {
  display: "BricolageGrotesque_700Bold",
  displayHeavy: "BricolageGrotesque_800ExtraBold",
  displayMedium: "BricolageGrotesque_600SemiBold",
  body: "AtkinsonHyperlegible_400Regular",
  bodyBold: "AtkinsonHyperlegible_700Bold",
  bodyItalic: "AtkinsonHyperlegible_400Regular_Italic",
} as const;

/** Modular scale (~1.25), anchored on a 16px body. */
export const type = {
  hero: { fontFamily: font.displayHeavy, fontSize: 40, lineHeight: 42, letterSpacing: -1.2 },
  h1: { fontFamily: font.display, fontSize: 31, lineHeight: 35, letterSpacing: -0.8 },
  h2: { fontFamily: font.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4 },
  h3: { fontFamily: font.displayMedium, fontSize: 19, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: font.bodyBold, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: font.body, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: font.bodyBold, fontSize: 14, lineHeight: 20 },
  tiny: { fontFamily: font.body, fontSize: 12, lineHeight: 16 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radius follows hierarchy: hero surfaces are softest, controls are pills. */
export const radius = { hero: 32, card: 22, inner: 14, pill: 999 } as const;

export const GUTTER = 20;
