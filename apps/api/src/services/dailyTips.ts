import { and, asc, eq, isNotNull } from "drizzle-orm";
import { ageInMonths, formatAge } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { llm } from "../llm";

const DEFAULT_GOALS = ["tantrums", "sleep", "picky-eating"];

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Creates at most one tip per user per day. Safe to run repeatedly (unique user+day index),
 * so a crashed or double-fired cron can simply run again.
 *
 * Tips rotate through the wins of the user's goals that have content, skipping wins they've
 * already been tipped. Tips may quote a locked win's script: a daily free sample.
 */
export async function runDailyTips(forDate = todayISO()) {
  const users = await db.select({ id: schema.users.id, firstName: schema.users.firstName }).from(schema.users);
  const wins = await db.select().from(schema.wins).orderBy(asc(schema.wins.goalSlug), asc(schema.wins.position));
  let created = 0;
  let skipped = 0;

  for (const user of users) {
    const [existing] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.forDate, forDate)));
    if (existing) {
      skipped++;
      continue;
    }

    const mine = await db.select().from(schema.userGoals).where(eq(schema.userGoals.userId, user.id)).orderBy(asc(schema.userGoals.createdAt));
    const slugs = mine.map((g) => g.goalSlug).filter((s) => wins.some((w) => w.goalSlug === s));
    const pool = wins.filter((w) => (slugs.length ? slugs : DEFAULT_GOALS).includes(w.goalSlug));
    if (!pool.length) continue;

    const seen = await db
      .select({ winId: schema.notifications.winId })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNotNull(schema.notifications.winId)));
    const seenIds = new Set(seen.map((s) => s.winId));
    // Interleave goals (win 1 of each goal, then win 2 of each…) so tips don't fixate on one goal.
    const ordered = [...pool].sort((a, b) => a.position - b.position || a.goalSlug.localeCompare(b.goalSlug));
    const win = ordered.find((w) => !seenIds.has(w.id)) ?? ordered[seenIds.size % ordered.length];

    const kids = await db.select().from(schema.children).where(eq(schema.children.userId, user.id)).orderBy(asc(schema.children.createdAt));
    const child = kids[0];
    const childLabel = child ? `${child.nickname}, ${formatAge(ageInMonths(child.birthMonth, child.birthYear))}` : "their child";

    let body: string;
    try {
      body = await llm.complete(
        { purpose: "daily_tip", userId: user.id },
        {
          system:
            "Write one warm, practical daily parenting tip of at most 2 sentences (max 40 words) based ONLY on the idea provided. Use the child's nickname if given. Include the short script in quotes. No medical advice, no emojis.",
          messages: [
            {
              role: "user",
              content: `Child: ${childLabel}\nIdea: ${win.title}. ${win.action}\nScript: "${win.script}"`,
            },
          ],
          maxTokens: 120,
          mock: () => `${child ? `With ${child.nickname} today: ` : "Today: "}${win.action.split(". ")[0].replace(/\.$/, "")}. Try: "${win.script}"`,
        },
      );
    } catch {
      body = `${win.action.split(". ")[0].replace(/\.$/, "")}. Try: "${win.script}"`;
    }

    const res = await db
      .insert(schema.notifications)
      .values({
        userId: user.id,
        title: `Today's idea: ${win.title}`,
        body: body.trim(),
        goalSlug: win.goalSlug,
        winId: win.id,
        forDate,
      })
      .onConflictDoNothing()
      .returning({ id: schema.notifications.id });
    if (res.length) created++;
    else skipped++;
  }
  return { forDate, created, skipped };
}

