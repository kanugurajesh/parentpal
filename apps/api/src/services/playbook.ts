import { randomBytes } from "node:crypto";
import { and, asc, count, eq, gte, inArray, isNull } from "drizzle-orm";
import {
  MAX_CAREGIVERS,
  type Caregiver,
  type CreateCaregiver,
  type GoalSlug,
  type PlaybookResponse,
  type PlaybookWin,
  type SafetyNotice,
} from "@parentpal/shared";
import { db, schema } from "../db/client";
import { env } from "../env";
import { badRequest, HttpError, notFound } from "../lib/errors";
import { iso } from "../lib/serialize";
import { isSubscribed } from "./entitlement";
import { recordCaregiverTry } from "./progress";
import { createMoment } from "./story";

/**
 * Family Playbook: the parent shares the wins they're working on with grandparents, the other
 * parent, a nanny or a teacher, through a secret link that needs no app and no login. Caregivers
 * see the exact words to use and can send back a note, which lands in the parent's Story.
 *
 * The page shows the win's own expert-sourced text, unchanged: no LLM sits between the content
 * and the caregiver, so nothing can drift from the source.
 */

export const LOGS_PER_DAY = 20;

const publicUrl = (token: string) => `${env.publicBaseUrl}/p/${token}`;

type WinRow = typeof schema.wins.$inferSelect;

async function goalTitles() {
  return new Map((await db.select({ slug: schema.goals.slug, title: schema.goals.title }).from(schema.goals)).map((g) => [g.slug, g.title]));
}

const toPlaybookWin = (w: WinRow, titles: Map<string, string>): PlaybookWin => ({
  id: w.id,
  goalSlug: w.goalSlug as GoalSlug,
  goalTitle: titles.get(w.goalSlug) ?? w.goalSlug,
  position: w.position,
  title: w.title,
  action: w.action,
  script: w.script,
  whatToExpect: w.whatToExpect,
});

/** Wins this parent may share: the same entitlement as the goal screen (win 1 free, the rest with a subscription). */
async function shareableWins(userId: string) {
  // Catalogue order: goals picked together share a timestamp, so that can't order them.
  const goals = await db
    .select({ slug: schema.userGoals.goalSlug })
    .from(schema.userGoals)
    .innerJoin(schema.goals, eq(schema.goals.slug, schema.userGoals.goalSlug))
    .where(eq(schema.userGoals.userId, userId))
    .orderBy(asc(schema.goals.sort));
  if (!goals.length) return [];
  const order = goals.map((g) => g.slug);
  const subscribed = await isSubscribed(userId);
  const rows = await db.select().from(schema.wins).where(inArray(schema.wins.goalSlug, order));
  return rows
    .filter((w) => subscribed || w.position === 1)
    .sort((a, b) => order.indexOf(a.goalSlug) - order.indexOf(b.goalSlug) || a.position - b.position);
}

/** The shared wins: the parent's choice, or win 1 of each goal until they choose. Wins they lost access to drop out. */
async function sharedWins(userId: string) {
  const allowed = await shareableWins(userId);
  const [user] = await db.select({ chosenAt: schema.users.playbookChosenAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.chosenAt) return allowed.filter((w) => w.position === 1);
  // Once the parent has chosen, an empty choice means share nothing.
  const chosen = new Set(
    (await db.select({ id: schema.playbookWins.winId }).from(schema.playbookWins).where(eq(schema.playbookWins.userId, userId))).map((r) => r.id),
  );
  return allowed.filter((w) => chosen.has(w.id));
}

async function primaryChild(userId: string) {
  const [child] = await db.select().from(schema.children).where(eq(schema.children.userId, userId)).orderBy(asc(schema.children.createdAt)).limit(1);
  return child ?? null;
}

async function listCaregivers(userId: string): Promise<Caregiver[]> {
  const rows = await db
    .select()
    .from(schema.caregivers)
    .where(and(eq(schema.caregivers.userId, userId), isNull(schema.caregivers.revokedAt)))
    .orderBy(asc(schema.caregivers.createdAt));
  if (!rows.length) return [];
  const notes = new Map(
    (
      await db
        .select({ id: schema.moments.caregiverId, n: count() })
        .from(schema.moments)
        .where(inArray(schema.moments.caregiverId, rows.map((r) => r.id)))
        .groupBy(schema.moments.caregiverId)
    ).map((r) => [r.id, r.n]),
  );
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    relation: c.relation,
    url: publicUrl(c.token),
    lastOpenedAt: c.lastOpenedAt ? iso(c.lastOpenedAt) : null,
    notesCount: notes.get(c.id) ?? 0,
    createdAt: iso(c.createdAt),
  }));
}

/* ------------------------------------------------------------------ */
/* Parent side                                                         */
/* ------------------------------------------------------------------ */

export async function getPlaybook(userId: string): Promise<PlaybookResponse> {
  const titles = await goalTitles();
  const child = await primaryChild(userId);
  return {
    childNickname: child?.nickname ?? null,
    wins: (await sharedWins(userId)).map((w) => toPlaybookWin(w, titles)),
    available: (await shareableWins(userId)).map((w) => {
      const { id, goalSlug, goalTitle, position, title } = toPlaybookWin(w, titles);
      return { id, goalSlug, goalTitle, position, title };
    }),
    caregivers: await listCaregivers(userId),
  };
}

export async function setPlaybookWins(userId: string, winIds: string[]) {
  const allowed = new Set((await shareableWins(userId)).map((w) => w.id));
  const bad = winIds.find((id) => !allowed.has(id));
  if (bad) throw badRequest("You can only share wins from your goals that you've unlocked.");
  await db.transaction(async (tx) => {
    await tx.delete(schema.playbookWins).where(eq(schema.playbookWins.userId, userId));
    if (winIds.length) await tx.insert(schema.playbookWins).values([...new Set(winIds)].map((winId) => ({ userId, winId })));
    await tx.update(schema.users).set({ playbookChosenAt: new Date() }).where(eq(schema.users.id, userId));
  });
  return getPlaybook(userId);
}

function shareText(caregiverName: string, childName: string, url: string, from: string | null) {
  return (
    `Hi ${caregiverName}! Here's what we're trying with ${childName} at the moment, with the exact words we're using. ` +
    `It really helps when we all respond the same way. You can tell me how it went right on the page, no app needed:\n${url}` +
    (from ? `\n- ${from}` : "")
  );
}

export async function addCaregiver(userId: string, input: CreateCaregiver) {
  const child = await primaryChild(userId);
  if (!child) throw badRequest("Add your child's profile first.");
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.caregivers)
    .where(and(eq(schema.caregivers.userId, userId), isNull(schema.caregivers.revokedAt)));
  if (n >= MAX_CAREGIVERS) throw badRequest(`You can share with up to ${MAX_CAREGIVERS} people. Remove someone to add another.`);

  // 32 random bytes: the link is the only key, so it must not be guessable.
  const token = randomBytes(32).toString("base64url");
  const [row] = await db.insert(schema.caregivers).values({ userId, childId: child.id, name: input.name, relation: input.relation, token }).returning();
  const [user] = await db.select({ firstName: schema.users.firstName }).from(schema.users).where(eq(schema.users.id, userId));
  const caregiver = (await listCaregivers(userId)).find((c) => c.id === row.id)!;
  return { caregiver, shareText: shareText(input.name, child.nickname, caregiver.url, user?.firstName ?? null) };
}

/** Revoking keeps the notes already sent (they're the family's journal) but the link stops working. */
export async function revokeCaregiver(userId: string, id: string) {
  const res = await db
    .update(schema.caregivers)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.caregivers.id, id), eq(schema.caregivers.userId, userId), isNull(schema.caregivers.revokedAt)))
    .returning({ id: schema.caregivers.id });
  if (!res.length) throw notFound("Caregiver");
  return { revoked: true as const };
}

/* ------------------------------------------------------------------ */
/* Caregiver side (public, by token)                                   */
/* ------------------------------------------------------------------ */

async function byToken(token: string) {
  const [row] = await db
    .select({ caregiver: schema.caregivers, child: schema.children, user: schema.users })
    .from(schema.caregivers)
    .innerJoin(schema.children, eq(schema.children.id, schema.caregivers.childId))
    .innerJoin(schema.users, eq(schema.users.id, schema.caregivers.userId))
    .where(eq(schema.caregivers.token, token));
  if (!row) throw notFound("Playbook");
  if (row.caregiver.revokedAt) throw new HttpError(410, "This playbook link has been turned off. Ask for a new one.");
  return row;
}

export interface PublicPlaybook {
  caregiverName: string;
  childNickname: string;
  /** "Priya (Mom)", "Dad", or "the parent". Never an email. */
  from: string;
  wins: PlaybookWin[];
}

export async function openPublicPlaybook(token: string): Promise<PublicPlaybook> {
  const { caregiver, child, user } = await byToken(token);
  await db.update(schema.caregivers).set({ lastOpenedAt: new Date() }).where(eq(schema.caregivers.id, caregiver.id));
  const role = user.parentRole === "mother" ? "Mom" : user.parentRole === "father" ? "Dad" : null;
  const from = user.firstName && role ? `${user.firstName} (${role})` : (user.firstName ?? role ?? "the parent");
  const titles = await goalTitles();
  return {
    caregiverName: caregiver.name,
    childNickname: child.nickname,
    from,
    wins: (await sharedWins(user.id)).map((w) => toPlaybookWin(w, titles)),
  };
}

export const QUICK_PREFIX = { worked: "It worked", tough: "It was a tough one" } as const;

/** "It worked" and "It was tough" about a named win also count toward the parent's progress. */
const QUICK_OUTCOME = { worked: "helped", tough: "didnt" } as const;

export async function caregiverLog(
  token: string,
  input: { quick?: keyof typeof QUICK_PREFIX; text?: string; winId?: string },
): Promise<{ ok: true; safety: SafetyNotice | null }> {
  const { caregiver, child, user } = await byToken(token);
  const win = input.winId ? (await sharedWins(user.id)).find((w) => w.id === input.winId) : undefined;
  if (input.winId && !win) throw badRequest("That idea isn't shared any more.");
  const note = input.text?.trim() ?? "";
  const text = input.quick ? (note ? `${QUICK_PREFIX[input.quick]}: ${note}` : `${QUICK_PREFIX[input.quick]}.`) : note;
  if (text.length < 3) throw badRequest("Tap how it went, or write a few words.");

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.moments)
    .where(and(eq(schema.moments.caregiverId, caregiver.id), gte(schema.moments.createdAt, since)));
  if (n >= LOGS_PER_DAY) throw new HttpError(429, "That's a lot of notes for one day. Thank you! Try again tomorrow.");

  const res = await createMoment(user.id, child, text, { surface: "caregiver", caregiverId: caregiver.id, loggedBy: caregiver.name });
  if (win && input.quick) {
    await recordCaregiverTry({
      userId: user.id,
      childId: child.id,
      winId: win.id,
      goalSlug: win.goalSlug,
      outcome: QUICK_OUTCOME[input.quick],
      caregiverId: caregiver.id,
      momentId: res.moment.id,
    });
  }
  return { ok: true, safety: res.safety };
}
