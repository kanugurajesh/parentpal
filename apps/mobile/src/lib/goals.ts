import type { GoalCategory, GoalSlug } from "@parentpal/shared";

/** Mirrors /content/goals. Kept static here so this step works before an account exists. */
export const GOAL_CHOICES: { slug: GoalSlug; title: string; category: GoalCategory; illustration: string; ready: boolean }[] = [
  { slug: "keeping-busy", title: "Keeping my child busy", category: "focus", illustration: "blocks", ready: false },
  { slug: "tantrums", title: "Handling tantrums", category: "emotion", illustration: "storm", ready: true },
  { slug: "screen-time", title: "Managing screen time", category: "focus", illustration: "screen", ready: false },
  { slug: "picky-eating", title: "Tackling picky eating", category: "habits", illustration: "bowl", ready: true },
  { slug: "focus", title: "Improving focus", category: "focus", illustration: "kite", ready: false },
  { slug: "sleep", title: "Fixing sleep issues", category: "sleep", illustration: "moon", ready: true },
  { slug: "potty-training", title: "Potty training", category: "habits", illustration: "duck", ready: false },
];

export const goalTitle = (slug: string) => GOAL_CHOICES.find((g) => g.slug === slug)?.title ?? slug;
