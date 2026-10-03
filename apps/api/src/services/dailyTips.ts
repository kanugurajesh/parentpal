import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { ageInMonths, formatAge } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { llm } from "../llm";

const DEFAULT_GOALS = ["tantrums", "sleep", "picky-eating"];

export const todayISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Adds days to a YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type WinRow = typeof schema.wins.$inferSelect;

/**
 * Creates at most one tip per user per day. Safe to run repeatedly (unique user+day index),
 * so a crashed or double-fired cron can simply run again.
 *
 * Tips rotate through the wins of the user's goals that have content, skipping wins they've
 * already been tipped. Tips may quote a locked win's script: a daily free sample.
 */
export async function runDailyTips(forDate = todayISO()) {
  const users = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.notificationsEnabled, true));
  const wins = await loadWins();
  let created = 0;
  let skipped = 0;
  for (const user of users) {
    const r = await ensureTip(user.id, forDate, wins);
    if (r === "created") created++;
    else skipped++;
  }
  return { forDate, created, skipped };
}

/**
 * The user's tips for `days` days starting at `from` (their local date), creating any that don't
 * exist yet. The app schedules these as on-device notifications, so tips must exist ahead of time.
 */
export async function upcomingTips(userId: string, from: string, days: number) {
  const wins = await loadWins();
  const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
  // Sequential: each new tip marks its win as seen, so the next day gets a different one.
  for (const d of dates) await ensureTip(userId, d, wins);
  return db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), inArray(schema.notifications.forDate, dates)))
    .orderBy(asc(schema.notifications.forDate));
}

const loadWins = () => db.select().from(schema.wins).orderBy(asc(schema.wins.goalSlug), asc(schema.wins.position));

async function ensureTip(userId: string, forDate: string, wins: WinRow[]): Promise<"created" | "skipped"> {
  const [existing] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), eq(schema.notifications.forDate, forDate)));
  if (existing) return "skipped";

  // Notifications off: no new tips (the inbox keeps the ones already made).
  const [user] = await db.select({ on: schema.users.notificationsEnabled }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user?.on) return "skipped";

  const mine = await db.select().from(schema.userGoals).where(eq(schema.userGoals.userId, userId)).orderBy(asc(schema.userGoals.createdAt));
  const slugs = mine.map((g) => g.goalSlug).filter((s) => wins.some((w) => w.goalSlug === s));
  const pool = wins.filter((w) => (slugs.length ? slugs : DEFAULT_GOALS).includes(w.goalSlug));
  if (!pool.length) return "skipped";

  const seen = await db
    .select({ winId: schema.notifications.winId })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, userId), isNotNull(schema.notifications.winId)));
  const seenIds = new Set(seen.map((s) => s.winId));
  // Interleave goals (win 1 of each goal, then win 2 of each…) so tips don't fixate on one goal.
  const ordered = [...pool].sort((a, b) => a.position - b.position || a.goalSlug.localeCompare(b.goalSlug));
  const win = ordered.find((w) => !seenIds.has(w.id)) ?? ordered[seenIds.size % ordered.length];

  const kids = await db.select().from(schema.children).where(eq(schema.children.userId, userId)).orderBy(asc(schema.children.createdAt));
  const child = kids[0];
  const childLabel = child ? `${child.nickname}, ${formatAge(ageInMonths(child.birthMonth, child.birthYear))}` : "their child";

  let body: string;
  try {
    body = await llm.complete(
      { purpose: "daily_tip", userId },
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
      userId,
      title: `Today's idea: ${win.title}`,
      body: body.trim(),
      goalSlug: win.goalSlug,
      winId: win.id,
      forDate,
    })
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
  return res.length ? "created" : "skipped";
}
