import { and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  Advisor,
  GoalDetail,
  GoalFilter,
  GoalSlug,
  GoalsResponse,
  Me,
  StartSubscription,
  type GoalSummary,
  type Source,
} from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { winCommunityStats } from "../services/community";
import { isSubscribed } from "../services/entitlement";
import { loadMe } from "./me";

async function sourceMap(ids: string[]) {
  if (!ids.length) return new Map<string, Source>();
  const rows = await db.select().from(schema.sources).where(inArray(schema.sources.id, ids));
  return new Map(rows.map((s) => [s.id, { id: s.id, title: s.title, publisher: s.publisher, url: s.url }]));
}

/** Clearly fictional. Never real people, never real credentials. */
const ADVISORS: Advisor[] = [
  {
    id: "adv-sleep",
    name: "Sample Advisor: Sleep",
    focus: "Bedtime routines",
    bio: "Placeholder profile. In a real product this would be a credentialed sleep specialist who reviews the sleep content.",
    initials: "SA",
    isPlaceholder: true,
  },
  {
    id: "adv-feelings",
    name: "Sample Advisor: Feelings",
    focus: "Toddler emotions",
    bio: "Placeholder profile. In a real product this would be a child-development expert who reviews the tantrum content.",
    initials: "FA",
    isPlaceholder: true,
  },
  {
    id: "adv-food",
    name: "Sample Advisor: Mealtimes",
    focus: "Feeding & picky eating",
    bio: "Placeholder profile. In a real product this would be a pediatric dietitian who reviews the feeding content.",
    initials: "MA",
    isPlaceholder: true,
  },
];

export const goalRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get(
    "/goals",
    { schema: { querystring: z.object({ category: GoalFilter.default("all") }), response: { 200: GoalsResponse } } },
    async (req) => {
      const all = await db.select().from(schema.goals).orderBy(asc(schema.goals.sort));
      const winCounts = await db.select({ goalSlug: schema.wins.goalSlug }).from(schema.wins);
      const mine = await db
        .select({ slug: schema.userGoals.goalSlug })
        .from(schema.userGoals)
        .where(eq(schema.userGoals.userId, req.userId))
        .orderBy(asc(schema.userGoals.createdAt));
      const mineSet = new Set(mine.map((m) => m.slug));
      const cat = req.query.category;

      const summaries = all
        .filter((g) => cat === "all" || g.category === cat)
        .map(
          (g): GoalSummary => ({
            slug: g.slug as GoalSummary["slug"],
            title: g.title,
            subtitle: g.subtitle,
            category: g.category,
            illustration: g.illustration,
            hasContent: g.hasContent,
            winCount: winCounts.filter((w) => w.goalSlug === g.slug).length,
          }),
        );
      const order = mine.map((m) => m.slug);
      return {
        personalized: summaries.filter((g) => mineSet.has(g.slug)).sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)),
        others: summaries.filter((g) => !mineSet.has(g.slug)),
      };
    },
  );

  app.get(
    "/goals/:slug",
    { schema: { params: z.object({ slug: GoalSlug }), response: { 200: GoalDetail } } },
    async (req) => {
      const [g] = await db.select().from(schema.goals).where(eq(schema.goals.slug, req.params.slug));
      if (!g) throw notFound("Goal");
      const wins = await db.select().from(schema.wins).where(eq(schema.wins.goalSlug, g.slug)).orderBy(asc(schema.wins.position));
      const subscribed = await isSubscribed(req.userId);
      const sources = await sourceMap([...new Set([...g.sourceIds, ...wins.flatMap((w) => w.sourceIds)])]);
      const pick = (ids: string[]) => ids.map((id) => sources.get(id)).filter((s): s is Source => !!s);
      const community = await winCommunityStats(wins.map((w) => w.id));

      return {
        slug: g.slug as GoalSlug,
        title: g.title,
        subtitle: g.subtitle,
        category: g.category,
        illustration: g.illustration,
        hasContent: g.hasContent,
        winCount: wins.length,
        intro: g.intro,
        sources: pick(g.sourceIds),
        wins: wins.map((w) => {
          // Only the first win is free. Locked wins still show the title so users see what's inside.
          const locked = w.position > 1 && !subscribed;
          return {
            id: w.id,
            position: w.position,
            title: w.title,
            locked,
            action: locked ? null : w.action,
            script: locked ? null : w.script,
            whatToExpect: locked ? null : w.whatToExpect,
            sources: pick(w.sourceIds),
            community: community.get(w.id) ?? null,
          };
        }),
      };
    },
  );

  app.get("/advisors", { schema: { response: { 200: z.array(Advisor) } } }, async () => ADVISORS);

  /* ---------- Fake subscription: no money moves, but entitlement is real. ---------- */

  app.post("/subscription", { schema: { body: StartSubscription, response: { 200: Me } } }, async (req) => {
    await db
      .insert(schema.subscriptions)
      .values({ userId: req.userId, plan: req.body.plan, status: "active_fake" })
      .onConflictDoUpdate({
        target: schema.subscriptions.userId,
        set: { plan: req.body.plan, status: "active_fake", startedAt: new Date() },
      });
    return loadMe(req.userId);
  });

  app.delete("/subscription", { schema: { response: { 200: Me } } }, async (req) => {
    await db
      .update(schema.subscriptions)
      .set({ status: "canceled" })
      .where(and(eq(schema.subscriptions.userId, req.userId)));
    return loadMe(req.userId);
  });
};
