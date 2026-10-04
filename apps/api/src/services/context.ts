import { and, asc, desc, eq } from "drizzle-orm";
import { ageInMonths, formatAge } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { describeProgress } from "./progress";

export interface FamilyContext {
  parentName: string | null;
  children: { id: string; nickname: string; sex: "girl" | "boy"; ageMonths: number }[];
  goals: { slug: string; title: string }[];
  recentMoments: { childNickname: string; text: string; trigger: string | null; behavior: string | null; outcome: string | null }[];
  /** How the wins they tried went, e.g. "Name the feeling (Tantrums): helped 3 of 4 tries". */
  progress?: string | null;
  /** With more than one child: the one this conversation turn is about (also children[0]). */
  focus?: string | null;
}

/**
 * Everything personal the LLM may see. Kept small on purpose: nickname, age in months, goals, recent moments.
 * focusChildId (the app's active child) goes first, and moments and progress are that child's. An id that
 * isn't one of the user's children is ignored rather than failing a chat that has already started streaming.
 */
export async function loadFamilyContext(userId: string, focusChildId?: string): Promise<FamilyContext> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const all = await db.select().from(schema.children).where(eq(schema.children.userId, userId)).orderBy(asc(schema.children.createdAt));
  const focus = all.find((k) => k.id === focusChildId) ?? null;
  const kids = focus ? [focus, ...all.filter((k) => k.id !== focus.id)] : all;
  const goals = await db
    .select({ slug: schema.goals.slug, title: schema.goals.title })
    .from(schema.userGoals)
    .innerJoin(schema.goals, eq(schema.goals.slug, schema.userGoals.goalSlug))
    .where(eq(schema.userGoals.userId, userId))
    .orderBy(asc(schema.userGoals.createdAt));
  const moments = await db
    .select()
    .from(schema.moments)
    .where(and(eq(schema.moments.userId, userId), focus ? eq(schema.moments.childId, focus.id) : undefined))
    .orderBy(desc(schema.moments.createdAt))
    .limit(5);
  const nick = new Map(kids.map((k) => [k.id, k.nickname]));
  return {
    parentName: user?.firstName ?? null,
    children: kids.map((k) => ({ id: k.id, nickname: k.nickname, sex: k.sex, ageMonths: ageInMonths(k.birthMonth, k.birthYear) })),
    goals,
    recentMoments: moments
      .filter((m) => m.tagStatus !== "safety")
      .map((m) => ({ childNickname: nick.get(m.childId) ?? "child", text: m.text, trigger: m.trigger, behavior: m.behavior, outcome: m.outcome })),
    progress: await describeProgress(userId, focus?.id),
    focus: focus && all.length > 1 ? focus.nickname : null,
  };
}

export function describeFamily(ctx: FamilyContext): string {
  const kids = ctx.children.length
    ? ctx.children.map((c) => `${c.nickname} (${c.sex}, ${formatAge(c.ageMonths)})`).join("; ")
    : "not provided";
  const goals = ctx.goals.length ? ctx.goals.map((g) => g.title).join(", ") : "none chosen";
  const moments = ctx.recentMoments.length
    ? ctx.recentMoments
        .map((m) => `- ${m.childNickname}: trigger=${m.trigger ?? "?"}; behavior=${m.behavior ?? "?"}; outcome=${m.outcome ?? "?"}`)
        .join("\n")
    : "- none logged yet";
  const tried = ctx.progress ? `\nWins they tried and how it went: ${ctx.progress}` : "";
  const about = ctx.focus ? `\nThis question is about: ${ctx.focus}. Answer for ${ctx.focus}'s age; the moments and wins below are ${ctx.focus}'s.` : "";
  return `Parent: ${ctx.parentName ?? "unknown"}\nChildren: ${kids}${about}\nActive goals: ${goals}\nRecent logged moments:\n${moments}${tried}`;
}
