import { and, asc, desc, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  OPEN_TRY_DAYS,
  type GoalProgress,
  type GoalSlug,
  type ProgressResponse,
  type ReportOutcome,
  type ReportOutcomeResponse,
  type StartTry,
  type WinTry,
  type WorkedOutcome,
} from "@parentpal/shared";
import { db, schema } from "../db/client";
import { badRequest, HttpError, notFound } from "../lib/errors";
import { iso } from "../lib/serialize";
import { isSubscribed } from "./entitlement";
import { createMoment } from "./story";

/**
 * Progress: every "I'll try this" is a try, open until the parent (or a caregiver) says how it went.
 * Only reported tries count; an open try older than OPEN_TRY_DAYS is treated as "no answer".
 */

const RECENT = 10;

type TryRow = typeof schema.winTries.$inferSelect;

const openSince = () => new Date(Date.now() - OPEN_TRY_DAYS * 24 * 60 * 60 * 1000);

async function toWinTries(rows: TryRow[]): Promise<WinTry[]> {
  if (!rows.length) return [];
  const wins = new Map(
    (await db.select({ id: schema.wins.id, title: schema.wins.title }).from(schema.wins).where(inArray(schema.wins.id, [...new Set(rows.map((r) => r.winId))]))).map(
      (w) => [w.id, w.title],
    ),
  );
  const cgIds = [...new Set(rows.map((r) => r.caregiverId).filter((id): id is string => !!id))];
  const caregivers = new Map(
    cgIds.length
      ? (await db.select({ id: schema.caregivers.id, name: schema.caregivers.name }).from(schema.caregivers).where(inArray(schema.caregivers.id, cgIds))).map(
          (c) => [c.id, c.name],
        )
      : [],
  );
  return rows.map((r) => ({
    id: r.id,
    winId: r.winId,
    winTitle: wins.get(r.winId) ?? r.winId,
    goalSlug: r.goalSlug as GoalSlug,
    childId: r.childId,
    outcome: r.outcome,
    reportedBy: r.caregiverId ? (caregivers.get(r.caregiverId) ?? null) : null,
    createdAt: iso(r.createdAt),
    reportedAt: r.reportedAt ? iso(r.reportedAt) : null,
  }));
}

async function ownedChild(userId: string, childId?: string) {
  const where = childId ? and(eq(schema.children.userId, userId), eq(schema.children.id, childId)) : eq(schema.children.userId, userId);
  const [child] = await db.select().from(schema.children).where(where).orderBy(asc(schema.children.createdAt)).limit(1);
  if (!child) throw childId ? notFound("Child") : badRequest("Add your child first.");
  return child;
}

/** "I'll try this". Reuses the open try for the same win, so tapping twice doesn't count twice. */
export async function startTry(userId: string, input: StartTry): Promise<WinTry> {
  const [win] = await db.select().from(schema.wins).where(eq(schema.wins.id, input.winId));
  if (!win) throw notFound("Win");
  if (win.position > 1 && !(await isSubscribed(userId))) throw new HttpError(403, "Unlock this win to track it.");
  const child = await ownedChild(userId, input.childId);

  const [open] = await db
    .select()
    .from(schema.winTries)
    .where(
      and(
        eq(schema.winTries.userId, userId),
        eq(schema.winTries.winId, win.id),
        eq(schema.winTries.childId, child.id),
        isNull(schema.winTries.outcome),
        gte(schema.winTries.createdAt, openSince()),
      ),
    )
    .orderBy(desc(schema.winTries.createdAt))
    .limit(1);
  const row = open ?? (await db.insert(schema.winTries).values({ userId, childId: child.id, winId: win.id, goalSlug: win.goalSlug }).returning())[0];
  return (await toWinTries([row]))[0];
}

/** Says how a try went. Optional text becomes a moment in Story (safety check, tagging, patterns as usual). */
export async function reportOutcome(userId: string, tryId: string, input: ReportOutcome): Promise<ReportOutcomeResponse> {
  const [t] = await db
    .select()
    .from(schema.winTries)
    .where(and(eq(schema.winTries.id, tryId), eq(schema.winTries.userId, userId)));
  if (!t) throw notFound("Try");

  let moment: ReportOutcomeResponse["moment"] = null;
  if (input.text) {
    const [child] = await db.select().from(schema.children).where(eq(schema.children.id, t.childId));
    moment = await createMoment(userId, child, input.text);
  }
  const [row] = await db
    .update(schema.winTries)
    .set({ outcome: input.outcome, reportedAt: new Date(), ...(moment ? { momentId: moment.moment.id } : {}) })
    .where(eq(schema.winTries.id, t.id))
    .returning();
  return { try: (await toWinTries([row]))[0], moment };
}

/** A caregiver's "It worked / It was tough" about a specific shared win: a try that is reported at once. */
export async function recordCaregiverTry(input: {
  userId: string;
  childId: string;
  winId: string;
  goalSlug: string;
  outcome: WorkedOutcome;
  caregiverId: string;
  momentId: string | null;
}) {
  const now = new Date();
  await db.insert(schema.winTries).values({ ...input, reportedAt: now, createdAt: now });
}

const emptyCounts = () => ({ tried: 0, helped: 0, somewhat: 0, didnt: 0 });
function count(c: ReturnType<typeof emptyCounts>, outcome: WorkedOutcome) {
  c.tried++;
  c[outcome]++;
}

export async function getProgress(userId: string): Promise<ProgressResponse> {
  const goals = await db
    .select({ slug: schema.goals.slug, title: schema.goals.title })
    .from(schema.userGoals)
    .innerJoin(schema.goals, eq(schema.goals.slug, schema.userGoals.goalSlug))
    .where(eq(schema.userGoals.userId, userId))
    .orderBy(asc(schema.userGoals.createdAt));
  const slugs = goals.map((g) => g.slug);

  const reported = slugs.length
    ? await db
        .select()
        .from(schema.winTries)
        .where(and(eq(schema.winTries.userId, userId), inArray(schema.winTries.goalSlug, slugs), isNotNull(schema.winTries.outcome)))
        .orderBy(asc(schema.winTries.reportedAt))
    : [];
  const wins = slugs.length
    ? await db.select().from(schema.wins).where(inArray(schema.wins.goalSlug, slugs)).orderBy(asc(schema.wins.position))
    : [];

  const progress: GoalProgress[] = goals.map((g) => {
    const tries = reported.filter((t) => t.goalSlug === g.slug);
    const total = emptyCounts();
    const perWin = new Map<string, ReturnType<typeof emptyCounts>>();
    for (const t of tries) {
      count(total, t.outcome!);
      if (!perWin.has(t.winId)) perWin.set(t.winId, emptyCounts());
      count(perWin.get(t.winId)!, t.outcome!);
    }
    return {
      goalSlug: g.slug as GoalSlug,
      goalTitle: g.title,
      ...total,
      recent: tries.slice(-RECENT).map((t) => t.outcome!),
      wins: wins
        .filter((w) => w.goalSlug === g.slug && perWin.has(w.id))
        .map((w) => ({ winId: w.id, title: w.title, position: w.position, ...perWin.get(w.id)! })),
    };
  });

  const open = await db
    .select()
    .from(schema.winTries)
    .where(and(eq(schema.winTries.userId, userId), isNull(schema.winTries.outcome), gte(schema.winTries.createdAt, openSince())))
    .orderBy(desc(schema.winTries.createdAt));
  return { goals: progress, openTries: await toWinTries(open) };
}

/** The family's own record per win, for the goal screen. */
export async function winProgress(userId: string, winIds: string[]) {
  const out = new Map<string, { tried: number; helped: number; openTryId: string | null }>();
  if (!winIds.length) return out;
  const rows = await db
    .select()
    .from(schema.winTries)
    .where(and(eq(schema.winTries.userId, userId), inArray(schema.winTries.winId, winIds)))
    .orderBy(desc(schema.winTries.createdAt));
  const since = openSince().getTime();
  for (const id of winIds) {
    const tries = rows.filter((r) => r.winId === id);
    const open = tries.find((r) => !r.outcome && r.createdAt.getTime() >= since);
    out.set(id, {
      tried: tries.filter((r) => r.outcome).length,
      helped: tries.filter((r) => r.outcome === "helped").length,
      openTryId: open?.id ?? null,
    });
  }
  return out;
}

/** One line for the chat context: which wins have helped lately. */
export async function describeProgress(userId: string): Promise<string | null> {
  const { goals } = await getProgress(userId);
  const lines = goals.flatMap((g) => g.wins.map((w) => `${w.title} (${g.goalTitle}): helped ${w.helped} of ${w.tried} tries`));
  return lines.length ? lines.join("; ") : null;
}
