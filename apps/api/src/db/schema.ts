import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

export const parentRole = pgEnum("parent_role", ["mother", "father"]);
export const childSex = pgEnum("child_sex", ["girl", "boy"]);
export const goalCategory = pgEnum("goal_category", ["focus", "sleep", "emotion", "habits"]);
export const plan = pgEnum("plan", ["weekly", "semiannual", "annual"]);
export const subStatus = pgEnum("sub_status", ["active_fake", "canceled"]);
export const tagStatus = pgEnum("tag_status", ["ok", "failed", "safety"]);
export const msgRole = pgEnum("msg_role", ["user", "assistant"]);
export const msgKind = pgEnum("msg_kind", ["answer", "clarify", "safety"]);
export const safetySurface = pgEnum("safety_surface", ["chat", "moment", "community", "caregiver"]);
export const caregiverRelation = pgEnum("caregiver_relation", ["grandparent", "parent", "nanny", "teacher", "other"]);
export const postKind = pgEnum("post_kind", ["question", "worked", "share"]);
export const modStatus = pgEnum("mod_status", ["live", "review", "hidden", "removed"]);
export const workedOutcome = pgEnum("worked_outcome", ["helped", "somewhat", "didnt"]);
export const reactionKind = pgEnum("reaction_kind", ["same", "helpful"]);
export const targetType = pgEnum("target_type", ["post", "reply"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const userRef = () =>
  uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

/* ---------------- Users & family ---------------- */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  isGuest: boolean("is_guest").notNull().default(true),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  parentRole: parentRole("parent_role"),
  firstName: text("first_name"),
  /** Daily ideas and reminders. Off: no new tips are created and the app cancels phone alerts. */
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  /** Set once the parent picks Family Playbook wins; until then the playbook shares win 1 of each goal. */
  playbookChosenAt: timestamp("playbook_chosen_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const children = pgTable(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    nickname: text("nickname").notNull(),
    sex: childSex("sex").notNull(),
    // Deliberately no full date of birth: month + year is enough for age-appropriate advice.
    birthMonth: smallint("birth_month").notNull(),
    birthYear: smallint("birth_year").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("children_user_idx").on(t.userId)],
);

/* ---------------- Content (seeded from /content) ---------------- */

export const goals = pgTable("goals", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull(),
  intro: text("intro").notNull().default(""),
  category: goalCategory("category").notNull(),
  illustration: text("illustration").notNull(),
  hasContent: boolean("has_content").notNull().default(false),
  sourceIds: text("source_ids").array().notNull().default(sql`'{}'::text[]`),
  sort: integer("sort").notNull().default(0),
});

export const wins = pgTable(
  "wins",
  {
    id: text("id").primaryKey(),
    goalSlug: text("goal_slug")
      .notNull()
      .references(() => goals.slug, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    action: text("action").notNull(),
    script: text("script").notNull(),
    whatToExpect: text("what_to_expect").notNull(),
    sourceIds: text("source_ids").array().notNull().default(sql`'{}'::text[]`),
  },
  (t) => [uniqueIndex("wins_goal_pos_idx").on(t.goalSlug, t.position)],
);

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  url: text("url").notNull(),
  accessedOn: date("accessed_on").notNull(),
});

export const contentChunks = pgTable(
  "content_chunks",
  {
    id: text("id").primaryKey(),
    goalSlug: text("goal_slug")
      .notNull()
      .references(() => goals.slug, { onDelete: "cascade" }),
    winId: text("win_id").references(() => wins.id, { onDelete: "cascade" }),
    heading: text("heading").notNull(),
    body: text("body").notNull(),
    tsv: tsvector("tsv")
      .notNull()
      .generatedAlwaysAs(
        sql`setweight(to_tsvector('english', coalesce(heading, '')), 'A') || setweight(to_tsvector('english', coalesce(body, '')), 'B')`,
      ),
  },
  (t) => [index("content_chunks_tsv_idx").using("gin", t.tsv)],
);

/* ---------------- Per-user state ---------------- */

export const userGoals = pgTable(
  "user_goals",
  {
    userId: userRef(),
    goalSlug: text("goal_slug")
      .notNull()
      .references(() => goals.slug, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.goalSlug] })],
);

export const subscriptions = pgTable("subscriptions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  plan: plan("plan").notNull(),
  status: subStatus("status").notNull().default("active_fake"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moments = pgTable(
  "moments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    trigger: text("trigger"),
    behavior: text("behavior"),
    outcome: text("outcome"),
    tagStatus: tagStatus("tag_status").notNull(),
    /** Set when logged from a Family Playbook link. The name is a snapshot, so it survives removing the caregiver. */
    caregiverId: uuid("caregiver_id").references(() => caregivers.id, { onDelete: "set null" }),
    loggedBy: text("logged_by"),
    createdAt: createdAt(),
  },
  (t) => [index("moments_user_created_idx").on(t.userId, t.createdAt)],
);

/* ---------------- Family Playbook ---------------- */

/** Another adult in the child's life, reached through a secret link (no app, no login). */
export const caregivers = pgTable(
  "caregivers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    relation: caregiverRelation("relation").notNull(),
    token: text("token").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("caregivers_token_idx").on(t.token), index("caregivers_user_idx").on(t.userId)],
);

/** The wins the parent chose to share with every caregiver. */
export const playbookWins = pgTable(
  "playbook_wins",
  {
    userId: userRef(),
    winId: text("win_id")
      .notNull()
      .references(() => wins.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.winId] })],
);

/* ---------------- Progress ---------------- */

/** One attempt at a win ("I'll try this"), open until someone says how it went. */
export const winTries = pgTable(
  "win_tries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    winId: text("win_id")
      .notNull()
      .references(() => wins.id, { onDelete: "cascade" }),
    goalSlug: text("goal_slug").notNull(),
    outcome: workedOutcome("outcome"),
    momentId: uuid("moment_id").references(() => moments.id, { onDelete: "set null" }),
    /** Set when a caregiver reported it from a Family Playbook link. */
    caregiverId: uuid("caregiver_id").references(() => caregivers.id, { onDelete: "set null" }),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("win_tries_user_goal_idx").on(t.userId, t.goalSlug, t.createdAt)],
);

export const patterns = pgTable("patterns", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userRef(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  insight: text("insight").notNull(),
  suggestion: text("suggestion").notNull(),
  createdAt: createdAt(),
});

export const patternMoments = pgTable(
  "pattern_moments",
  {
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => patterns.id, { onDelete: "cascade" }),
    momentId: uuid("moment_id")
      .notNull()
      .references(() => moments.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.patternId, t.momentId] })],
);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userRef(),
  createdAt: createdAt(),
});

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: msgRole("role").notNull(),
    kind: msgKind("kind").notNull().default("answer"),
    content: text("content").notNull(),
    citations: jsonb("citations").notNull().default(sql`'[]'::jsonb`),
    clarifyOptions: jsonb("clarify_options").notNull().default(sql`'[]'::jsonb`),
    safety: jsonb("safety"),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conv_idx").on(t.conversationId, t.createdAt)],
);

export const messageFeedback = pgTable(
  "message_feedback",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: userRef(),
    rating: smallint("rating").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] })],
);

export const bookmarks = pgTable(
  "bookmarks",
  {
    userId: userRef(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.messageId] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    goalSlug: text("goal_slug"),
    winId: text("win_id"),
    forDate: date("for_date").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  // One tip per user per day: makes the scheduled job idempotent.
  (t) => [uniqueIndex("notifications_user_day_idx").on(t.userId, t.forDate)],
);

/* ---------------- Circles (anonymous community) ---------------- */

export const communityPosts = pgTable(
  "community_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    goalSlug: text("goal_slug")
      .notNull()
      .references(() => goals.slug, { onDelete: "cascade" }),
    // Snapshot at posting time: the band and label describe the post, not the parent today.
    ageBand: text("age_band"),
    authorLabel: text("author_label").notNull(),
    kind: postKind("kind").notNull(),
    body: text("body").notNull(),
    winId: text("win_id").references(() => wins.id, { onDelete: "set null" }),
    outcome: workedOutcome("outcome"),
    status: modStatus("status").notNull(),
    modReasons: jsonb("mod_reasons").notNull().default(sql`'[]'::jsonb`),
    safety: jsonb("safety"),
    /** Set when a moderator approves: reports alone can no longer auto-hide it. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("community_posts_feed_idx").on(t.goalSlug, t.status, t.createdAt),
    index("community_posts_user_idx").on(t.userId, t.createdAt),
  ],
);

export const communityReplies = pgTable(
  "community_replies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    // Null for the ParentPal guide reply.
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    authorLabel: text("author_label"),
    isGuide: boolean("is_guide").notNull().default(false),
    body: text("body").notNull(),
    citations: jsonb("citations").notNull().default(sql`'[]'::jsonb`),
    status: modStatus("status").notNull(),
    modReasons: jsonb("mod_reasons").notNull().default(sql`'[]'::jsonb`),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("community_replies_post_idx").on(t.postId, t.createdAt), index("community_replies_user_idx").on(t.userId, t.createdAt)],
);

export const communityReactions = pgTable(
  "community_reactions",
  {
    userId: userRef(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    kind: reactionKind("kind").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetId, t.kind] }), index("community_reactions_target_idx").on(t.targetId)],
);

export const communityReports = pgTable(
  "community_reports",
  {
    userId: userRef(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetId] })],
);

export const communityBlocks = pgTable(
  "community_blocks",
  {
    userId: userRef(),
    blockedUserId: uuid("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.blockedUserId] })],
);

/** "New replies to your post": at most one row per post per day, merged into the inbox. */
export const communityNotices = pgTable(
  "community_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userRef(),
    postId: uuid("post_id")
      .notNull()
      .references(() => communityPosts.id, { onDelete: "cascade" }),
    forDate: date("for_date").notNull(),
    count: integer("count").notNull().default(1),
    guideReplied: boolean("guide_replied").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("community_notices_post_day_idx").on(t.userId, t.postId, t.forDate)],
);

/* ---------------- Observability ---------------- */

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable + set null: cost history survives account deletion without linking to a person.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [index("llm_calls_created_idx").on(t.createdAt)],
);

export const safetyEvents = pgTable("safety_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: userRef(),
  surface: safetySurface("surface").notNull(),
  category: text("category").notNull(),
  createdAt: createdAt(),
});
