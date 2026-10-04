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
  "sibling-rivalry",
  "anger",
  "lying",
  "bedwetting",
  "speech-language",
  "school-anxiety",
  "separation-anxiety",
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
  notificationsEnabled: z.boolean(),
  createdAt: z.string(),
});
export type User = z.infer<typeof User>;

export const AuthResponse = z.object({ token: z.string(), user: User });
export type AuthResponse = z.infer<typeof AuthResponse>;

const Email = z.string().trim().toLowerCase().email();
const Password = z.string().min(8, "Use at least 8 characters").max(200);

export const Credentials = z.object({ email: Email, password: Password });
export type Credentials = z.infer<typeof Credentials>;

/** Step 1 of "forgot password": always answers ok, so it can't be used to find out who has an account. */
export const ForgotPassword = z.object({ email: Email });
export type ForgotPassword = z.infer<typeof ForgotPassword>;

/** Step 2: the 6-digit code from the email plus the new password. Signs in and signs out other devices. */
export const ResetPassword = z.object({
  email: Email,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
  password: Password,
});
export type ResetPassword = z.infer<typeof ResetPassword>;

/** Codes expire after this many minutes and allow this many wrong guesses. */
export const RESET_CODE_MINUTES = 15;
export const RESET_CODE_MAX_ATTEMPTS = 5;

export const UpdateMe = z.object({
  parentRole: ParentRole.optional(),
  firstName: z.string().trim().min(1).max(40).optional(),
  notificationsEnabled: z.boolean().optional(),
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

// "Now" is read on every validation, not at module load, so a long-running server accepts
// babies born after New Year without a restart.
const ChildFields = z.object({
  nickname: z.string().trim().min(1).max(30),
  sex: ChildSex,
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z
    .number()
    .int()
    .refine((y) => {
      const now = new Date().getFullYear();
      return y >= now - 18 && y <= now;
    }, "Birth year must be within the last 18 years"),
});
function notInFuture(c: { birthMonth?: number; birthYear?: number }, ctx: z.RefinementCtx) {
  if (c.birthMonth === undefined || c.birthYear === undefined) return;
  const now = new Date();
  if (c.birthYear === now.getFullYear() && c.birthMonth > now.getMonth() + 1) {
    ctx.addIssue({ code: "custom", path: ["birthMonth"], message: "Birth month can't be in the future" });
  }
}
export const CreateChild = ChildFields.superRefine(notInFuture);
export type CreateChild = z.infer<typeof CreateChild>;
export const UpdateChild = ChildFields.partial().superRefine(notInFuture);

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

/**
 * Rule-based next step for a win (no LLM):
 *  - keep: the last 2 tries helped
 *  - patience: it's helping a bit, not yet fully
 *  - switch: the last 3 didn't help, and another unlocked win is available (winId)
 *  - ask: the last 3 didn't help, and there's nothing else unlocked to try
 */
export const WinAdvice = z.object({
  kind: z.enum(["keep", "patience", "switch", "ask"]),
  text: z.string(),
  winId: z.string().nullable(),
});
export type WinAdvice = z.infer<typeof WinAdvice>;

export const Win = z.object({
  id: z.string(),
  position: z.number().int(),
  title: z.string(),
  locked: z.boolean(),
  action: z.string().nullable(),
  script: z.string().nullable(),
  whatToExpect: z.string().nullable(),
  sources: z.array(Source),
  /** "What worked" reports from Circles. Null until enough parents have reported (no small-sample stats). */
  community: z.object({ tried: z.number().int(), helped: z.number().int() }).nullable().optional(),
  /** This family's own record with the win. Null for locked wins. */
  mine: z
    .object({
      tried: z.number().int(),
      helped: z.number().int(),
      openTryId: z.string().uuid().nullable(),
      /** What to do next, from the recent outcomes. Null until there's a clear signal. */
      advice: WinAdvice.nullable().optional(),
    })
    .nullable()
    .optional(),
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
  /** Set when a caregiver logged it from a Family Playbook link, e.g. "Nani". */
  loggedBy: z.string().nullable().optional(),
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
  /** The child the question is about (the app's active child). Default: the first child. */
  childId: z.string().uuid().optional(),
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
  /** Set on "new replies to your post" notices from Circles; tapping opens the post. */
  postId: z.string().uuid().nullable().optional(),
});
export type Notification = z.infer<typeof Notification>;

/* ------------------------------------------------------------------ */
/* Circles: anonymous parent community                                 */
/* ------------------------------------------------------------------ */

export const AGE_BANDS = ["0-1y", "1-2y", "2-3y", "3-5y", "5y+"] as const;
export const AgeBand = z.enum(AGE_BANDS);
export type AgeBand = z.infer<typeof AgeBand>;

export const AGE_BAND_LABELS: Record<AgeBand, string> = {
  "0-1y": "Under 1",
  "1-2y": "1 to 2",
  "2-3y": "2 to 3",
  "3-5y": "3 to 5",
  "5y+": "5 and up",
};

export const PostKind = z.enum(["question", "worked", "share"]);
export type PostKind = z.infer<typeof PostKind>;
export const WorkedOutcome = z.enum(["helped", "somewhat", "didnt"]);
export type WorkedOutcome = z.infer<typeof WorkedOutcome>;
export const ModStatus = z.enum(["live", "review", "hidden", "removed"]);
export type ModStatus = z.infer<typeof ModStatus>;
export const ReactionKind = z.enum(["same", "helpful"]);
export type ReactionKind = z.infer<typeof ReactionKind>;
export const TargetType = z.enum(["post", "reply"]);
export type TargetType = z.infer<typeof TargetType>;

export const POST_MIN = 20;
export const POST_MAX = 600;
export const REPLY_MAX = 600;
/** "Parents like you" stats on a win only appear once this many parents have reported. */
export const MIN_WIN_REPORTS = 3;

export const CommunityAuthor = z.object({
  /** Stable per circle, unlinkable across circles. Never a real name. */
  pseudonym: z.string(),
  /** e.g. "Mom of a 2 to 3 year old". */
  label: z.string(),
  isMe: z.boolean(),
});
export type CommunityAuthor = z.infer<typeof CommunityAuthor>;

const Reactions = z.object({ same: z.number().int(), helpful: z.number().int() });

export const CommunityPost = z.object({
  id: z.string().uuid(),
  goalSlug: GoalSlug,
  kind: PostKind,
  body: z.string(),
  ageBand: AgeBand.nullable(),
  win: z.object({ id: z.string(), title: z.string() }).nullable(),
  outcome: WorkedOutcome.nullable(),
  status: ModStatus,
  author: CommunityAuthor,
  reactions: Reactions,
  myReactions: z.array(ReactionKind),
  replyCount: z.number().int(),
  /** Pinned support notice, e.g. for a developmental concern. */
  safety: SafetyNotice.nullable(),
  createdAt: z.string(),
});
export type CommunityPost = z.infer<typeof CommunityPost>;

export const CommunityReply = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  body: z.string(),
  /** The ParentPal guide reply: grounded in the content library, with citations. */
  isGuide: z.boolean(),
  citations: z.array(Citation),
  status: ModStatus,
  author: CommunityAuthor.nullable(),
  reactions: Reactions,
  myReactions: z.array(ReactionKind),
  createdAt: z.string(),
});
export type CommunityReply = z.infer<typeof CommunityReply>;

export const Circle = z.object({
  goalSlug: GoalSlug,
  title: z.string(),
  category: GoalCategory,
  illustration: z.string(),
  mine: z.boolean(),
  postsThisWeek: z.number().int(),
});
export type Circle = z.infer<typeof Circle>;

export const CirclesResponse = z.object({
  circles: z.array(Circle),
  /** The viewer's age band (the requested child, else the first), used as the default feed filter. */
  myAgeBand: AgeBand.nullable(),
  canPost: z.boolean(),
});
export type CirclesResponse = z.infer<typeof CirclesResponse>;

export const FeedResponse = z.object({
  posts: z.array(CommunityPost),
  /** Cold-start fallback: posts from neighbouring age bands when the chosen band is quiet. */
  nearby: z.array(CommunityPost),
  nextCursor: z.string().nullable(),
});
export type FeedResponse = z.infer<typeof FeedResponse>;

export const PostDetail = z.object({ post: CommunityPost, replies: z.array(CommunityReply) });
export type PostDetail = z.infer<typeof PostDetail>;

export const CreatePost = z
  .object({
    kind: PostKind,
    body: z.string().trim().min(POST_MIN, `Write at least ${POST_MIN} characters`).max(POST_MAX),
    winId: z.string().optional(),
    outcome: WorkedOutcome.optional(),
    /** Which child the post is about: sets its age band. Default: the first child. */
    childId: z.string().uuid().optional(),
  })
  .refine((p) => p.kind !== "worked" || (p.winId && p.outcome), { message: "Pick the win you tried and how it went", path: ["winId"] });
export type CreatePost = z.infer<typeof CreatePost>;

export const CreateReply = z.object({ body: z.string().trim().min(2).max(REPLY_MAX), childId: z.string().uuid().optional() });
export type CreateReply = z.infer<typeof CreateReply>;

/** live: visible now. review: only the author sees it until a moderator approves. safety: not posted, support shown. */
export const CreateOutcome = z.enum(["live", "review", "safety"]);
export type CreateOutcome = z.infer<typeof CreateOutcome>;

export const CreatePostResponse = z.object({
  outcome: CreateOutcome,
  post: CommunityPost.nullable(),
  safety: SafetyNotice.nullable(),
});
export type CreatePostResponse = z.infer<typeof CreatePostResponse>;

export const CreateReplyResponse = z.object({
  outcome: CreateOutcome,
  reply: CommunityReply.nullable(),
  safety: SafetyNotice.nullable(),
});
export type CreateReplyResponse = z.infer<typeof CreateReplyResponse>;

export const ReactInput = z.object({ targetType: TargetType, targetId: z.string().uuid(), kind: ReactionKind });
export const ReportReason = z.enum(["unkind", "medical_advice", "personal_info", "spam", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;
export const ReportInput = z.object({ targetType: TargetType, targetId: z.string().uuid(), reason: ReportReason });
export const BlockInput = z.object({ targetType: TargetType, targetId: z.string().uuid() });

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
/* Family Playbook: share the plan with other caregivers               */
/* ------------------------------------------------------------------ */

export const MAX_CAREGIVERS = 5;
export const MAX_PLAYBOOK_WINS = 4;

export const Relation = z.enum(["grandparent", "parent", "nanny", "teacher", "other"]);
export type Relation = z.infer<typeof Relation>;
export const RELATION_LABELS: Record<Relation, string> = {
  grandparent: "Grandparent",
  parent: "Other parent",
  nanny: "Nanny",
  teacher: "Teacher",
  other: "Other",
};

export const Caregiver = z.object({
  id: z.string().uuid(),
  name: z.string(),
  relation: Relation,
  url: z.string(),
  lastOpenedAt: z.string().nullable(),
  notesCount: z.number().int(),
  /** The child this link is for: the page shows their name, and notes land in their Story. */
  childId: z.string().uuid(),
  childNickname: z.string(),
  createdAt: z.string(),
});
export type Caregiver = z.infer<typeof Caregiver>;

export const CreateCaregiver = z.object({
  name: z.string().trim().min(1, "Add a name").max(30),
  relation: Relation,
  /** Default: the first child. */
  childId: z.string().uuid().optional(),
});
export type CreateCaregiver = z.infer<typeof CreateCaregiver>;

export const PlaybookWin = z.object({
  id: z.string(),
  goalSlug: GoalSlug,
  goalTitle: z.string(),
  position: z.number().int(),
  title: z.string(),
  action: z.string(),
  script: z.string(),
  whatToExpect: z.string(),
});
export type PlaybookWin = z.infer<typeof PlaybookWin>;

export const PlaybookResponse = z.object({
  childNickname: z.string().nullable(),
  wins: z.array(PlaybookWin),
  /** Wins the parent can add: unlocked wins from their goals. */
  available: z.array(PlaybookWin.pick({ id: true, goalSlug: true, goalTitle: true, position: true, title: true })),
  caregivers: z.array(Caregiver),
});
export type PlaybookResponse = z.infer<typeof PlaybookResponse>;

export const SetPlaybookWins = z.object({ winIds: z.array(z.string()).max(MAX_PLAYBOOK_WINS) });

export const CreateCaregiverResponse = z.object({ caregiver: Caregiver, shareText: z.string() });
export type CreateCaregiverResponse = z.infer<typeof CreateCaregiverResponse>;

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

export function ageBandOf(months: number): AgeBand {
  if (months < 12) return "0-1y";
  if (months < 24) return "1-2y";
  if (months < 36) return "2-3y";
  if (months < 60) return "3-5y";
  return "5y+";
}

/* ------------------------------------------------------------------ */
/* Progress: tries and outcomes                                        */
/* ------------------------------------------------------------------ */

/** An open try older than this counts as "no answer" and drops out of progress. */
export const OPEN_TRY_DAYS = 7;

const WeekCounts = z.object({ tried: z.number().int(), helped: z.number().int() });
/** The first week of tries against the last 7 days. Null until both have at least 2 tries. */
export const ProgressTrend = z.object({ start: WeekCounts, now: WeekCounts });
export type ProgressTrend = z.infer<typeof ProgressTrend>;

export const WinTry = z.object({
  id: z.string().uuid(),
  winId: z.string(),
  winTitle: z.string(),
  goalSlug: GoalSlug,
  childId: z.string().uuid(),
  outcome: WorkedOutcome.nullable(),
  /** Set when a caregiver reported it, e.g. "Nani". */
  reportedBy: z.string().nullable(),
  createdAt: z.string(),
  reportedAt: z.string().nullable(),
});
export type WinTry = z.infer<typeof WinTry>;

export const StartTry = z.object({ winId: z.string(), childId: z.string().uuid().optional() });
export type StartTry = z.infer<typeof StartTry>;

export const ReportOutcome = z.object({ outcome: WorkedOutcome, text: z.string().trim().min(3).max(1000).optional() });
export type ReportOutcome = z.infer<typeof ReportOutcome>;

export const ReportOutcomeResponse = z.object({ try: WinTry, moment: CreateMomentResponse.nullable() });
export type ReportOutcomeResponse = z.infer<typeof ReportOutcomeResponse>;

const OutcomeCounts = z.object({
  tried: z.number().int(),
  helped: z.number().int(),
  somewhat: z.number().int(),
  didnt: z.number().int(),
});

export const GoalProgress = OutcomeCounts.extend({
  goalSlug: GoalSlug,
  goalTitle: z.string(),
  /** The last reported outcomes, oldest first. */
  recent: z.array(WorkedOutcome),
  trend: ProgressTrend.nullable(),
  wins: z.array(OutcomeCounts.extend({ winId: z.string(), title: z.string(), position: z.number().int() })),
});
export type GoalProgress = z.infer<typeof GoalProgress>;

export const ProgressResponse = z.object({ goals: z.array(GoalProgress), openTries: z.array(WinTry) });
export type ProgressResponse = z.infer<typeof ProgressResponse>;
