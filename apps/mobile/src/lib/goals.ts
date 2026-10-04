import type { GoalCategory, GoalSlug } from "@parentpal/shared";

/** Mirrors /content/goals. Kept static here so this step works before an account exists. */
export const GOAL_CHOICES: { slug: GoalSlug; title: string; category: GoalCategory; illustration: string; ready: boolean }[] = [
  { slug: "keeping-busy", title: "Keeping my child busy", category: "focus", illustration: "blocks", ready: true },
  { slug: "tantrums", title: "Handling tantrums", category: "emotion", illustration: "storm", ready: true },
  { slug: "screen-time", title: "Managing screen time", category: "focus", illustration: "screen", ready: true },
  { slug: "picky-eating", title: "Tackling picky eating", category: "habits", illustration: "bowl", ready: true },
  { slug: "focus", title: "Improving focus", category: "focus", illustration: "kite", ready: true },
  { slug: "sleep", title: "Fixing sleep issues", category: "sleep", illustration: "moon", ready: true },
  { slug: "potty-training", title: "Potty training", category: "habits", illustration: "duck", ready: true },
  { slug: "sibling-rivalry", title: "Easing sibling rivalry", category: "emotion", illustration: "siblings", ready: true },
  { slug: "anger", title: "Managing anger", category: "emotion", illustration: "volcano", ready: true },
  { slug: "lying", title: "Dealing with lying", category: "habits", illustration: "truth", ready: true },
  { slug: "bedwetting", title: "Bedwetting", category: "sleep", illustration: "drop", ready: true },
  { slug: "speech-language", title: "Speech and language delay", category: "habits", illustration: "chat", ready: true },
  { slug: "school-anxiety", title: "School anxiety", category: "emotion", illustration: "backpack", ready: true },
  { slug: "separation-anxiety", title: "Separation anxiety", category: "emotion", illustration: "hearts", ready: true },
];

export const goalTitle = (slug: string) => GOAL_CHOICES.find((g) => g.slug === slug)?.title ?? slug;
