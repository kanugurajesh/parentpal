import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Domain constants                                                    */
/* ------------------------------------------------------------------ */

export const GOAL_SLUGS = [
  "keeping-busy",
  "tantrums",
  "screen-time",
  "picky-eating",
  "focus",
  "sleep",
  "potty-training",
] as const;
export const GoalSlug = z.enum(GOAL_SLUGS);
export type GoalSlug = z.infer<typeof GoalSlug>;

export const GoalCategory = z.enum(["focus", "sleep", "emotion", "habits"]);
export type GoalCategory = z.infer<typeof GoalCategory>;

/** Chips shown on Home. "all" is not a stored category. */
export const GoalFilter = z.enum(["all", "focus", "sleep", "emotion"]);
export type GoalFilter = z.infer<typeof GoalFilter>;

export const ParentRole = z.enum(["mother", "father"]);
export const ChildSex = z.enum(["girl", "boy"]);
export const Plan = z.enum(["weekly", "semiannual", "annual"]);
export type Plan = z.infer<typeof Plan>;

export const SafetyCategory = z.enum([
  "medical_emergency",
  "abuse",
  "self_harm",
  "developmental_concern",
]);
export type SafetyCategory = z.infer<typeof SafetyCategory>;

export const AI_DISCLAIMER = "AI-generated, not medical advice.";
export const MAX_CHILDREN = 2;
export const MAX_GOALS = 2;
export const MOMENTS_PER_PATTERN = 3;

/* ------------------------------------------------------------------ */
/* Auth & profile                                                      */
/* ------------------------------------------------------------------ */

export const User = z.object({
  id: z.string().uuid(),
  isGuest: z.boolean(),
  email: z.string().email().nullable(),
  parentRole: ParentRole.nullable(),
  firstName: z.string().nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

export const AuthResponse = z.object({ token: z.string(), user: User });
export type AuthResponse = z.infer<typeof AuthResponse>;

export const Credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Use at least 8 characters").max(200),
});
export type Credentials = z.infer<typeof Credentials>;

export const UpdateMe = z.object({
  parentRole: ParentRole.optional(),
  firstName: z.string().trim().min(1).max(40).optional(),
});
export type UpdateMe = z.infer<typeof UpdateMe>;

export const Child = z.object({
  id: z.string().uuid(),
  nickname: z.string(),
  sex: ChildSex,
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z.number().int(),
  ageMonths: z.number().int(),
});
export type Child = z.infer<typeof Child>;

const thisYear = new Date().getFullYear();
export const CreateChild = z.object({
  nickname: z.string().trim().min(1).max(30),
  sex: ChildSex,
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z.number().int().min(thisYear - 18).max(thisYear),
});
export type CreateChild = z.infer<typeof CreateChild>;
export const UpdateChild = CreateChild.partial();

export const Me = z.object({
  user: User,
  children: z.array(Child),
  goals: z.array(GoalSlug),
  subscription: z
    .object({ plan: Plan, status: z.enum(["active_fake", "canceled"]), startedAt: z.string() })
    .nullable(),
});
export type Me = z.infer<typeof Me>;

export const SetGoals = z.object({
  slugs: z.array(GoalSlug).min(1).max(MAX_GOALS),
});

/* ------------------------------------------------------------------ */
/* Goals & wins                                                        */
/* ------------------------------------------------------------------ */

export const Source = z.object({
  id: z.string(),
  title: z.string(),
  publisher: z.string(),
  url: z.string().url(),
});
export type Source = z.infer<typeof Source>;

export const GoalSummary = z.object({
  slug: GoalSlug,
  title: z.string(),
  subtitle: z.string(),
  category: GoalCategory,
  illustration: z.string(),
  hasContent: z.boolean(),
  winCount: z.number().int(),
});
export type GoalSummary = z.infer<typeof GoalSummary>;

export const GoalsResponse = z.object({
  personalized: z.array(GoalSummary),
  others: z.array(GoalSummary),
});
export type GoalsResponse = z.infer<typeof GoalsResponse>;

export const Win = z.object({
  id: z.string(),
  position: z.number().int(),
  title: z.string(),
  locked: z.boolean(),
  action: z.string().nullable(),
  script: z.string().nullable(),
  whatToExpect: z.string().nullable(),
  sources: z.array(Source),
});
export type Win = z.infer<typeof Win>;

export const GoalDetail = GoalSummary.extend({
  intro: z.string(),
  wins: z.array(Win),
  sources: z.array(Source),
});
export type GoalDetail = z.infer<typeof GoalDetail>;

export const Advisor = z.object({
  id: z.string(),
  name: z.string(),
  focus: z.string(),
  bio: z.string(),
  initials: z.string(),
  isPlaceholder: z.literal(true),
});
export type Advisor = z.infer<typeof Advisor>;

export const StartSubscription = z.object({ plan: Plan });

/* ------------------------------------------------------------------ */
/* Story: moments & patterns                                           */
/* ------------------------------------------------------------------ */

export const CreateMoment = z.object({
  childId: z.string().uuid(),
  text: z.string().trim().min(3).max(1000),
});
export type CreateMoment = z.infer<typeof CreateMoment>;

export const Moment = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  text: z.string(),
  trigger: z.string().nullable(),
  behavior: z.string().nullable(),
  outcome: z.string().nullable(),
  tagStatus: z.enum(["ok", "failed", "safety"]),
  createdAt: z.string(),
});
export type Moment = z.infer<typeof Moment>;

export const SafetyNotice = z.object({
  category: SafetyCategory,
  title: z.string(),
  body: z.string(),
  actions: z.array(z.object({ label: z.string(), href: z.string() })),
});
export type SafetyNotice = z.infer<typeof SafetyNotice>;

export const Pattern = z.object({
  id: z.string().uuid(),
  childId: z.string().uuid(),
  title: z.string(),
  insight: z.string(),
  suggestion: z.string(),
  momentIds: z.array(z.string().uuid()),
  createdAt: z.string(),
});
export type Pattern = z.infer<typeof Pattern>;

export const CreateMomentResponse = z.object({
  moment: Moment,
  safety: SafetyNotice.nullable(),
  newPattern: Pattern.nullable(),
});
export type CreateMomentResponse = z.infer<typeof CreateMomentResponse>;

/* ------------------------------------------------------------------ */
/* Ask: chat                                                           */
/* ------------------------------------------------------------------ */

export const Citation = z.object({
  chunkId: z.string(),
  goalSlug: GoalSlug,
  goalTitle: z.string(),
  winId: z.string().nullable(),
  label: z.string(),
  sourceIds: z.array(z.string()),
});
export type Citation = z.infer<typeof Citation>;

export const MessageKind = z.enum(["answer", "clarify", "safety"]);
export type MessageKind = z.infer<typeof MessageKind>;

export const ChatMessage = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant"]),
  kind: MessageKind,
  content: z.string(),
  citations: z.array(Citation),
  clarifyOptions: z.array(z.string()),
  safety: SafetyNotice.nullable(),
  rating: z.number().int().nullable(),
  bookmarked: z.boolean(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const SendMessage = z.object({
  text: z.string().trim().min(1).max(2000),
  /** Set when the user tapped an option from a clarifying question. */
  clarifies: z.string().uuid().optional(),
});
export type SendMessage = z.infer<typeof SendMessage>;

/** Server-sent events emitted by POST /v1/chat/messages */
export type ChatStreamEvent =
  | { type: "user"; message: ChatMessage }
  | {
      type: "meta";
      kind: MessageKind;
      citations: Citation[];
      clarifyOptions: string[];
      safety: SafetyNotice | null;
    }
  | { type: "delta"; text: string }
  | { type: "done"; message: ChatMessage }
  | { type: "error"; message: string };

export const Feedback = z.object({ rating: z.union([z.literal(1), z.literal(-1)]) });

export const Topic = z.object({
  goalSlug: GoalSlug,
  title: z.string(),
  questions: z.array(z.string()),
});
export type Topic = z.infer<typeof Topic>;

/* ------------------------------------------------------------------ */
/* Notifications & admin                                               */
/* ------------------------------------------------------------------ */

export const Notification = z.object({
  id: z.string().uuid(),
  title: z.string(),
  body: z.string(),
  goalSlug: GoalSlug.nullable(),
  forDate: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof Notification>;

export const CostSummary = z.object({
  totalCalls: z.number(),
  failedCalls: z.number(),
  totalCostUsd: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  avgLatencyMs: z.number(),
  p95LatencyMs: z.number(),
  byPurpose: z.array(
    z.object({ purpose: z.string(), calls: z.number(), costUsd: z.number(), avgLatencyMs: z.number() }),
  ),
  byModel: z.array(z.object({ provider: z.string(), model: z.string(), calls: z.number(), costUsd: z.number() })),
  byDay: z.array(z.object({ day: z.string(), calls: z.number(), costUsd: z.number() })),
});
export type CostSummary = z.infer<typeof CostSummary>;

/* ------------------------------------------------------------------ */
/* Helpers shared by client and server                                 */
/* ------------------------------------------------------------------ */

export function ageInMonths(birthMonth: number, birthYear: number, now = new Date()): number {
  return Math.max(0, (now.getFullYear() - birthYear) * 12 + (now.getMonth() + 1 - birthMonth));
}

export function formatAge(months: number): string {
  if (months < 1) return "newborn";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${y} yr ${m} mo` : `${y} years`;
}
