import { createHash } from "node:crypto";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, notInArray, or, sql, type SQL } from "drizzle-orm";
import {
  AGE_BANDS,
  ageBandOf,
  ageInMonths,
  MIN_WIN_REPORTS,
  type AgeBand,
  type Circle,
  type Citation,
  type CommunityAuthor,
  type CommunityPost,
  type CommunityReply,
  type CreatePost,
  type CreatePostResponse,
  type CreateReplyResponse,
  type FeedResponse,
  type GoalSlug,
  type Notification,
  type ReactionKind,
  type ReportReason,
  type SafetyNotice,
  type TargetType,
} from "@parentpal/shared";
import { db, schema } from "../db/client";
import { env } from "../env";
import { badRequest, HttpError, notFound } from "../lib/errors";
import { iso } from "../lib/serialize";
import { answerOnce } from "./chat";
import { todayISO } from "./dailyTips";
import { moderate } from "./moderation";

export const LIMITS = { postsPerDay: 5, repliesPerDay: 30, reportsToHide: 3, feedPage: 20, quietBand: 5, nearby: 10 } as const;

type PostRow = typeof schema.communityPosts.$inferSelect;
type ReplyRow = typeof schema.communityReplies.$inferSelect;

/* ------------------------------------------------------------------ */
/* Background jobs (the guide reply). Tests await them via settle().   */
/* ------------------------------------------------------------------ */

const pending = new Set<Promise<unknown>>();

function inBackground(job: () => Promise<unknown>) {
  const p: Promise<unknown> = job()
    .catch((err) => console.warn("[community] background job failed", err))
    .finally(() => pending.delete(p));
  pending.add(p);
}

export async function settleBackground() {
  while (pending.size) await Promise.all([...pending]);
}

/* ------------------------------------------------------------------ */
/* Identity: pseudonyms and labels                                     */
/* ------------------------------------------------------------------ */

const ADJECTIVES = [
  "Calm", "Brave", "Gentle", "Sunny", "Patient", "Cozy", "Bright", "Kind", "Steady", "Cheerful", "Quiet", "Hopeful",
  "Warm", "Curious", "Merry", "Tender", "Clever", "Breezy", "Golden", "Lucky", "Mellow", "Plucky", "Snug", "Spry",
  "Witty", "Jolly", "Earnest", "Nimble", "Rosy", "Wise", "Zesty", "Dreamy",
];
const NOUNS = [
  "Mango", "Otter", "Maple", "Sparrow", "Lotus", "Pebble", "Koala", "Fern", "Robin", "Panda", "Willow", "Comet",
  "Tulip", "Badger", "Lantern", "Meadow", "Heron", "Puffin", "Cedar", "Marigold", "Firefly", "Walrus", "Clover", "Teapot",
  "Acorn", "Dolphin", "Jasmine", "Pine", "Hedgehog", "Sunflower", "Kiwi", "Owl",
];

/**
 * Stable within a circle, different across circles, so one parent's posts can't be linked
 * across topics. Keyed with a server secret so it can't be recomputed from outside.
 */
export function pseudonymFor(userId: string, goalSlug: string) {
  const h = createHash("sha256").update(`${env.JWT_SECRET}:${goalSlug}:${userId}`).digest();
  return `${ADJECTIVES[h[0] % ADJECTIVES.length]} ${NOUNS[h[1] % NOUNS.length]}`;
}

const BAND_PHRASE: Record<AgeBand, string> = {
  "0-1y": "a baby under 1",
  "1-2y": "a 1-year-old",
  "2-3y": "a 2-year-old",
  "3-5y": "a 3 to 5 year old",
  "5y+": "a child over 5",
};

export function authorLabel(role: "mother" | "father" | null, band: AgeBand | null) {
  const who = role === "mother" ? "Mom" : role === "father" ? "Dad" : "Parent";
  return band ? `${who} of ${BAND_PHRASE[band]}` : who;
}

const author = (userId: string | null, label: string | null, goalSlug: string, viewerId: string): CommunityAuthor | null =>
  userId ? { pseudonym: pseudonymFor(userId, goalSlug), label: label ?? "Parent", isMe: userId === viewerId } : null;

/* ------------------------------------------------------------------ */
/* Viewer                                                              */
/* ------------------------------------------------------------------ */

async function loadViewer(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw notFound("User");
  const kids = await db.select().from(schema.children).where(eq(schema.children.userId, userId)).orderBy(asc(schema.children.createdAt));
  const band = kids[0] ? ageBandOf(ageInMonths(kids[0].birthMonth, kids[0].birthYear)) : null;
  return { user, band, nicknames: kids.map((k) => k.nickname) };
}

function requireMember(user: { isGuest: boolean }) {
  if (user.isGuest) throw new HttpError(403, "Create a free account to post in Circles. It keeps the community safe from spam.");
}

async function enforceRate(table: typeof schema.communityPosts | typeof schema.communityReplies, userId: string, max: number, what: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(table)
    .where(and(eq(table.userId, userId), gte(table.createdAt, since)));
  if (n >= max) throw new HttpError(429, `You've reached today's limit of ${max} ${what}. Try again tomorrow.`);
}

/** Visible to this viewer: live, or their own item awaiting review; never from someone they blocked. */
function visible(table: typeof schema.communityPosts | typeof schema.communityReplies, viewerId: string): SQL {
  const blocked = db
    .select({ id: schema.communityBlocks.blockedUserId })
    .from(schema.communityBlocks)
    .where(eq(schema.communityBlocks.userId, viewerId));
  return and(
    or(eq(table.status, "live"), and(eq(table.status, "review"), eq(table.userId, viewerId))),
    or(isNull(table.userId), notInArray(table.userId, blocked)),
  )!;
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

async function reactionsFor(ids: string[], viewerId: string) {
  const counts = new Map<string, { same: number; helpful: number }>();
  const mine = new Map<string, ReactionKind[]>();
  if (!ids.length) return { counts, mine };
  const rows = await db
    .select({ targetId: schema.communityReactions.targetId, kind: schema.communityReactions.kind, n: count(), mine: sql<number>`count(*) filter (where ${schema.communityReactions.userId} = ${viewerId})::int` })
    .from(schema.communityReactions)
    .where(inArray(schema.communityReactions.targetId, ids))
    .groupBy(schema.communityReactions.targetId, schema.communityReactions.kind);
  for (const r of rows) {
    const c = counts.get(r.targetId) ?? { same: 0, helpful: 0 };
    c[r.kind] = r.n;
    counts.set(r.targetId, c);
    if (r.mine) mine.set(r.targetId, [...(mine.get(r.targetId) ?? []), r.kind]);
  }
  return { counts, mine };
}

async function toPosts(rows: PostRow[], viewerId: string): Promise<CommunityPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const winIds = [...new Set(rows.map((r) => r.winId).filter((w): w is string => !!w))];
  const winTitles = winIds.length
    ? new Map((await db.select({ id: schema.wins.id, title: schema.wins.title }).from(schema.wins).where(inArray(schema.wins.id, winIds))).map((w) => [w.id, w.title]))
    : new Map<string, string>();
  const replyCounts = new Map(
    (
      await db
        .select({ postId: schema.communityReplies.postId, n: count() })
        .from(schema.communityReplies)
        .where(and(inArray(schema.communityReplies.postId, ids), eq(schema.communityReplies.status, "live")))
        .groupBy(schema.communityReplies.postId)
    ).map((r) => [r.postId, r.n]),
  );
  const { counts, mine } = await reactionsFor(ids, viewerId);
  return rows.map((p) => ({
    id: p.id,
    goalSlug: p.goalSlug as GoalSlug,
    kind: p.kind,
    body: p.body,
    ageBand: (p.ageBand as AgeBand | null) ?? null,
    win: p.winId && winTitles.has(p.winId) ? { id: p.winId, title: winTitles.get(p.winId)! } : null,
    outcome: p.outcome,
    status: p.status,
    author: author(p.userId, p.authorLabel, p.goalSlug, viewerId)!,
    reactions: counts.get(p.id) ?? { same: 0, helpful: 0 },
    myReactions: mine.get(p.id) ?? [],
    replyCount: replyCounts.get(p.id) ?? 0,
    safety: (p.safety as SafetyNotice | null) ?? null,
    createdAt: iso(p.createdAt),
  }));
}

async function toReplies(rows: ReplyRow[], goalSlug: string, viewerId: string): Promise<CommunityReply[]> {
  const { counts, mine } = await reactionsFor(
    rows.map((r) => r.id),
    viewerId,
  );
  return rows.map((r) => ({
    id: r.id,
    postId: r.postId,
    body: r.body,
    isGuide: r.isGuide,
    citations: (r.citations as Citation[]) ?? [],
    status: r.status,
    author: author(r.userId, r.authorLabel, goalSlug, viewerId),
    reactions: counts.get(r.id) ?? { same: 0, helpful: 0 },
    myReactions: mine.get(r.id) ?? [],
    createdAt: iso(r.createdAt),
  }));
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export async function listCircles(viewerId: string): Promise<{ circles: Circle[]; myAgeBand: AgeBand | null; canPost: boolean }> {
  const { user, band } = await loadViewer(viewerId);
  const goals = await db.select().from(schema.goals).orderBy(asc(schema.goals.sort));
  const mine = await db
    .select({ slug: schema.userGoals.goalSlug })
    .from(schema.userGoals)
    .where(eq(schema.userGoals.userId, viewerId))
    .orderBy(asc(schema.userGoals.createdAt));
  const week = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const activity = new Map(
    (
      await db
        .select({ slug: schema.communityPosts.goalSlug, n: count() })
        .from(schema.communityPosts)
        .where(and(eq(schema.communityPosts.status, "live"), gte(schema.communityPosts.createdAt, week)))
        .groupBy(schema.communityPosts.goalSlug)
    ).map((r) => [r.slug, r.n]),
  );
  const order = mine.map((m) => m.slug);
  const circles = goals.map(
    (g): Circle => ({
      goalSlug: g.slug as GoalSlug,
      title: g.title,
      category: g.category,
      illustration: g.illustration,
      mine: order.includes(g.slug),
      postsThisWeek: activity.get(g.slug) ?? 0,
    }),
  );
  // Your circles first (in the order you chose the goals), then the rest by activity.
  circles.sort((a, b) =>
    a.mine && b.mine ? order.indexOf(a.goalSlug) - order.indexOf(b.goalSlug) : a.mine !== b.mine ? (a.mine ? -1 : 1) : b.postsThisWeek - a.postsThisWeek,
  );
  return { circles, myAgeBand: band, canPost: !user.isGuest };
}

export async function feed(viewerId: string, goalSlug: GoalSlug, opts: { band: AgeBand | "all"; cursor?: string }): Promise<FeedResponse> {
  const t = schema.communityPosts;
  const base = and(eq(t.goalSlug, goalSlug), visible(t, viewerId));
  // Keyset cursor "<iso>|<id>". JS dates stop at milliseconds while timestamptz keeps microseconds,
  // so compare at millisecond precision and break ties by id; otherwise posts inside that gap are skipped.
  const ms = sql`date_trunc('milliseconds', ${t.createdAt})`;
  let after: SQL | undefined;
  if (opts.cursor) {
    const [at, id] = opts.cursor.split("|");
    const d = new Date(at).toISOString();
    after = or(sql`${ms} < ${d}::timestamptz`, and(sql`${ms} = ${d}::timestamptz`, lt(t.id, id)));
  }
  const rows = await db
    .select()
    .from(t)
    .where(and(base, opts.band === "all" ? undefined : eq(t.ageBand, opts.band), after))
    .orderBy(desc(ms), desc(t.id))
    .limit(LIMITS.feedPage + 1);
  const page = rows.slice(0, LIMITS.feedPage);
  const last = page[page.length - 1];
  const nextCursor = rows.length > LIMITS.feedPage ? `${iso(last.createdAt)}|${last.id}` : null;

  // Cold start: a quiet age band borrows from its neighbours instead of looking empty.
  let nearby: PostRow[] = [];
  if (opts.band !== "all" && !opts.cursor && page.length < LIMITS.quietBand) {
    const i = AGE_BANDS.indexOf(opts.band);
    const neighbours = [AGE_BANDS[i - 1], AGE_BANDS[i + 1]].filter((b): b is AgeBand => !!b);
    nearby = await db
      .select()
      .from(t)
      .where(and(base, inArray(t.ageBand, neighbours)))
      .orderBy(desc(t.createdAt))
      .limit(LIMITS.nearby);
  }
  return { posts: await toPosts(page, viewerId), nearby: await toPosts(nearby, viewerId), nextCursor };
}

async function visiblePost(viewerId: string, postId: string) {
  const [p] = await db
    .select()
    .from(schema.communityPosts)
    .where(and(eq(schema.communityPosts.id, postId), visible(schema.communityPosts, viewerId)));
  if (!p) throw notFound("Post");
  return p;
}

export async function getPost(viewerId: string, postId: string) {
  const p = await visiblePost(viewerId, postId);
  const replies = await db
    .select()
    .from(schema.communityReplies)
    .where(and(eq(schema.communityReplies.postId, p.id), visible(schema.communityReplies, viewerId)))
    .orderBy(desc(schema.communityReplies.isGuide), asc(schema.communityReplies.createdAt));
  const [post] = await toPosts([p], viewerId);
  return { post, replies: await toReplies(replies, p.goalSlug, viewerId) };
}

/** Per win: how many parents reported trying it, and how many said it helped. Hidden below MIN_WIN_REPORTS. */
export async function winCommunityStats(winIds: string[]) {
  const out = new Map<string, { tried: number; helped: number }>();
  if (!winIds.length) return out;
  const t = schema.communityPosts;
  const rows = await db
    .select({
      winId: t.winId,
      tried: sql<number>`count(distinct ${t.userId})::int`,
      helped: sql<number>`count(distinct ${t.userId}) filter (where ${t.outcome} = 'helped')::int`,
    })
    .from(t)
    .where(and(eq(t.kind, "worked"), eq(t.status, "live"), inArray(t.winId, winIds)))
    .groupBy(t.winId);
  for (const r of rows) if (r.winId && r.tried >= MIN_WIN_REPORTS) out.set(r.winId, { tried: r.tried, helped: r.helped });
  return out;
}

/* ------------------------------------------------------------------ */
/* Writing                                                             */
/* ------------------------------------------------------------------ */

export async function createPost(viewerId: string, goalSlug: GoalSlug, input: CreatePost): Promise<CreatePostResponse> {
  const { user, band, nicknames } = await loadViewer(viewerId);
  requireMember(user);
  await enforceRate(schema.communityPosts, viewerId, LIMITS.postsPerDay, "posts");

  let winId: string | null = null;
  if (input.kind === "worked") {
    const [w] = await db
      .select({ id: schema.wins.id })
      .from(schema.wins)
      .where(and(eq(schema.wins.id, input.winId!), eq(schema.wins.goalSlug, goalSlug)));
    if (!w) throw badRequest("That win isn't part of this circle's goal.");
    winId = w.id;
  }

  const mod = await moderate(viewerId, input.body, { surface: "post", childNicknames: nicknames });
  if (mod.status === "safety") return { outcome: "safety", post: null, safety: mod.safety };

  const [row] = await db
    .insert(schema.communityPosts)
    .values({
      userId: viewerId,
      goalSlug,
      ageBand: band,
      authorLabel: authorLabel(user.parentRole, band),
      kind: input.kind,
      body: mod.text,
      winId,
      outcome: input.kind === "worked" ? input.outcome! : null,
      status: mod.status,
      modReasons: mod.reasons,
      safety: mod.pinned,
    })
    .returning();
  if (row.status === "live") queueGuideReply(row);
  const [post] = await toPosts([row], viewerId);
  return { outcome: mod.status, post, safety: null };
}

export async function createReply(viewerId: string, postId: string, body: string): Promise<CreateReplyResponse> {
  const { user, band, nicknames } = await loadViewer(viewerId);
  requireMember(user);
  const post = await visiblePost(viewerId, postId);
  if (post.status !== "live") throw new HttpError(409, "Replies open once this post is approved.");
  await enforceRate(schema.communityReplies, viewerId, LIMITS.repliesPerDay, "replies");

  const mod = await moderate(viewerId, body, { surface: "reply", childNicknames: nicknames });
  if (mod.status === "safety") return { outcome: "safety", reply: null, safety: mod.safety };

  const [row] = await db
    .insert(schema.communityReplies)
    .values({
      postId: post.id,
      userId: viewerId,
      authorLabel: authorLabel(user.parentRole, band),
      body: mod.text,
      status: mod.status,
      modReasons: mod.reasons,
    })
    .returning();
  if (row.status === "live" && post.userId !== viewerId) await bumpNotice(post.userId, post.id, false);
  const [reply] = await toReplies([row], post.goalSlug, viewerId);
  return { outcome: mod.status, reply, safety: null };
}

/** ParentPal's guide answers every live question once, if (and only if) the content library covers it. */
function queueGuideReply(post: PostRow) {
  if (post.kind !== "question") return;
  inBackground(async () => {
    const [existing] = await db
      .select({ id: schema.communityReplies.id })
      .from(schema.communityReplies)
      .where(and(eq(schema.communityReplies.postId, post.id), eq(schema.communityReplies.isGuide, true)));
    if (existing) return;
    const band = post.ageBand as AgeBand | null;
    const answer = await answerOnce(post.userId, post.body, {
      goalSlug: post.goalSlug,
      ageLabel: band ? BAND_PHRASE[band] : null,
    });
    if (!answer) return;
    await db.insert(schema.communityReplies).values({ postId: post.id, isGuide: true, body: answer.text, citations: answer.citations, status: "live" });
    await bumpNotice(post.userId, post.id, true);
  });
}

async function bumpNotice(userId: string, postId: string, guide: boolean) {
  await db
    .insert(schema.communityNotices)
    .values({ userId, postId, forDate: todayISO(), guideReplied: guide })
    .onConflictDoUpdate({
      target: [schema.communityNotices.userId, schema.communityNotices.postId, schema.communityNotices.forDate],
      set: {
        count: sql`${schema.communityNotices.count} + 1`,
        readAt: null,
        ...(guide ? { guideReplied: true } : {}),
      },
    });
}

async function target(viewerId: string, type: TargetType, id: string) {
  if (type === "post") {
    const p = await visiblePost(viewerId, id);
    return { table: schema.communityPosts, row: p, authorId: p.userId as string | null };
  }
  const [r] = await db
    .select()
    .from(schema.communityReplies)
    .where(and(eq(schema.communityReplies.id, id), visible(schema.communityReplies, viewerId)));
  if (!r) throw notFound("Reply");
  await visiblePost(viewerId, r.postId);
  return { table: schema.communityReplies, row: r, authorId: r.userId };
}

/** Toggles a reaction and returns the new counts. */
export async function react(viewerId: string, type: TargetType, id: string, kind: ReactionKind) {
  const { user } = await loadViewer(viewerId);
  requireMember(user);
  await target(viewerId, type, id);
  const r = schema.communityReactions;
  const removed = await db
    .delete(r)
    .where(and(eq(r.userId, viewerId), eq(r.targetId, id), eq(r.kind, kind)))
    .returning({ id: r.targetId });
  if (!removed.length) await db.insert(r).values({ userId: viewerId, targetType: type, targetId: id, kind }).onConflictDoNothing();
  const { counts, mine } = await reactionsFor([id], viewerId);
  return { reactions: counts.get(id) ?? { same: 0, helpful: 0 }, myReactions: mine.get(id) ?? [] };
}

/** Enough distinct reports hide an item until a moderator decides, unless a moderator already approved it. */
export async function report(viewerId: string, type: TargetType, id: string, reason: ReportReason) {
  const { user } = await loadViewer(viewerId);
  requireMember(user);
  const t = await target(viewerId, type, id);
  if (t.authorId === viewerId) throw badRequest("You can't report your own post. You can delete it instead.");
  await db.insert(schema.communityReports).values({ userId: viewerId, targetType: type, targetId: id, reason }).onConflictDoNothing();
  const [{ n }] = await db.select({ n: count() }).from(schema.communityReports).where(eq(schema.communityReports.targetId, id));
  let hidden = false;
  if (n >= LIMITS.reportsToHide && t.row.status === "live" && !t.row.approvedAt) {
    await db.update(t.table).set({ status: "hidden" }).where(eq(t.table.id, id));
    hidden = true;
  }
  return { reported: true as const, hidden };
}

export async function block(viewerId: string, type: TargetType, id: string) {
  const t = await target(viewerId, type, id);
  if (!t.authorId) throw badRequest("ParentPal's guide replies can't be blocked. You can report one instead.");
  if (t.authorId === viewerId) throw badRequest("You can't block yourself.");
  await db.insert(schema.communityBlocks).values({ userId: viewerId, blockedUserId: t.authorId }).onConflictDoNothing();
  return { blocked: true as const };
}

export async function deleteOwn(viewerId: string, type: TargetType, id: string) {
  const table = type === "post" ? schema.communityPosts : schema.communityReplies;
  const res = await db
    .delete(table)
    .where(and(eq(table.id, id), eq(table.userId, viewerId)))
    .returning({ id: table.id });
  if (!res.length) throw notFound(type === "post" ? "Post" : "Reply");
  if (type === "reply") await db.delete(schema.communityReactions).where(eq(schema.communityReactions.targetId, id));
  return { deleted: true as const };
}

/* ------------------------------------------------------------------ */
/* Inbox notices                                                       */
/* ------------------------------------------------------------------ */

function selectNotices() {
  const n = schema.communityNotices;
  return db
    .select({ notice: n, goalSlug: schema.communityPosts.goalSlug, body: schema.communityPosts.body })
    .from(n)
    .innerJoin(schema.communityPosts, eq(schema.communityPosts.id, n.postId));
}

export async function noticesFor(userId: string, today?: string): Promise<Notification[]> {
  const n = schema.communityNotices;
  const rows = await selectNotices()
    .where(and(eq(n.userId, userId), today ? sql`${n.forDate} <= ${today}` : undefined))
    .orderBy(desc(n.forDate), desc(n.createdAt))
    .limit(30);
  return rows.map(toNotice);
}

function toNotice({ notice, goalSlug, body }: Awaited<ReturnType<typeof selectNotices>>[number]): Notification {
  const others = notice.count - (notice.guideReplied ? 1 : 0);
  const title =
    others === 0
      ? "ParentPal's guide answered your question"
      : `${others} new ${others === 1 ? "reply" : "replies"} to your post${notice.guideReplied ? ", plus a guide answer" : ""}`;
  return {
    id: notice.id,
    title,
    body: body.length > 90 ? `"${body.slice(0, 87).trimEnd()}…"` : `"${body}"`,
    goalSlug: goalSlug as GoalSlug,
    forDate: notice.forDate,
    readAt: notice.readAt ? iso(notice.readAt) : null,
    createdAt: iso(notice.createdAt),
    postId: notice.postId,
  };
}

/** Marks one of the user's notices read and returns it, or null if it isn't theirs. */
export async function markNoticeRead(userId: string, id: string): Promise<Notification | null> {
  const n = schema.communityNotices;
  const [row] = await db
    .update(n)
    .set({ readAt: new Date() })
    .where(and(eq(n.id, id), eq(n.userId, userId)))
    .returning({ id: n.id });
  if (!row) return null;
  const [notice] = await selectNotices().where(eq(n.id, id));
  return notice ? toNotice(notice) : null;
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function moderationQueue() {
  const statuses = ["review", "hidden"] as const;
  const posts = await db.select().from(schema.communityPosts).where(inArray(schema.communityPosts.status, [...statuses])).orderBy(asc(schema.communityPosts.createdAt));
  const replies = await db.select().from(schema.communityReplies).where(inArray(schema.communityReplies.status, [...statuses])).orderBy(asc(schema.communityReplies.createdAt));
  const ids = [...posts.map((p) => p.id), ...replies.map((r) => r.id)];
  const reports = ids.length
    ? await db.select({ targetId: schema.communityReports.targetId, reason: schema.communityReports.reason }).from(schema.communityReports).where(inArray(schema.communityReports.targetId, ids))
    : [];
  const reasonsFor = (id: string) => reports.filter((r) => r.targetId === id).map((r) => r.reason);
  return {
    items: [
      ...posts.map((p) => ({ type: "post" as const, id: p.id, goalSlug: p.goalSlug, body: p.body, status: p.status, modReasons: p.modReasons as string[], reports: reasonsFor(p.id), createdAt: iso(p.createdAt) })),
      ...replies.map((r) => ({ type: "reply" as const, id: r.id, postId: r.postId, body: r.body, status: r.status, modReasons: r.modReasons as string[], reports: reasonsFor(r.id), createdAt: iso(r.createdAt) })),
    ],
  };
}

export async function moderateItem(type: TargetType, id: string, action: "approve" | "remove") {
  const table = type === "post" ? schema.communityPosts : schema.communityReplies;
  const [before] = await db.select({ status: table.status }).from(table).where(eq(table.id, id));
  const [row] = await db
    .update(table)
    .set(action === "approve" ? { status: "live", approvedAt: new Date() } : { status: "removed" })
    .where(eq(table.id, id))
    .returning();
  if (!row) throw notFound(type === "post" ? "Post" : "Reply");
  if (action === "approve" && type === "post") queueGuideReply(row as PostRow);
  // A reply held for review notifies the post's author once it goes live, as a live reply would have.
  if (action === "approve" && type === "reply" && before?.status !== "live") {
    const reply = row as typeof schema.communityReplies.$inferSelect;
    const [post] = await db.select({ id: schema.communityPosts.id, userId: schema.communityPosts.userId }).from(schema.communityPosts).where(eq(schema.communityPosts.id, reply.postId));
    if (post?.userId && post.userId !== reply.userId) await bumpNotice(post.userId, post.id, reply.isGuide);
  }
  return { id: row.id, status: row.status };
}
