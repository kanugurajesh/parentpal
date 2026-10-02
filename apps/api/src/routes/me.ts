import { and, asc, count, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Child, CreateChild, MAX_CHILDREN, Me, SetGoals, UpdateChild, UpdateMe, User, type GoalSlug } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { HttpError, notFound } from "../lib/errors";
import { iso, toChild, toUser } from "../lib/serialize";

export async function loadMe(userId: string): Promise<Me> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  const kids = await db
    .select()
    .from(schema.children)
    .where(eq(schema.children.userId, userId))
    .orderBy(asc(schema.children.createdAt));
  const goals = await db
    .select({ slug: schema.userGoals.goalSlug })
    .from(schema.userGoals)
    .where(eq(schema.userGoals.userId, userId))
    .orderBy(asc(schema.userGoals.createdAt));
  const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.userId, userId));
  return {
    user: toUser(user),
    children: kids.map(toChild),
    goals: goals.map((g) => g.slug as GoalSlug),
    subscription: sub ? { plan: sub.plan, status: sub.status, startedAt: iso(sub.startedAt) } : null,
  };
}

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get("/me", { schema: { response: { 200: Me } } }, (req) => loadMe(req.userId));

  app.patch("/me", { schema: { body: UpdateMe, response: { 200: User } } }, async (req) => {
    const [u] = await db.update(schema.users).set(req.body).where(eq(schema.users.id, req.userId)).returning();
    return toUser(u);
  });

  /**
   * Hard delete. Every user-owned table cascades from users, so this one statement removes
   * children, moments, patterns, chat, feedback, bookmarks, notifications and safety events.
   * llm_calls keep anonymous cost rows (user_id set null).
   */
  app.delete("/me", { schema: { response: { 200: z.object({ deleted: z.literal(true) }) } } }, async (req) => {
    await db.delete(schema.users).where(eq(schema.users.id, req.userId));
    return { deleted: true as const };
  });

  app.put("/me/goals", { schema: { body: SetGoals, response: { 200: Me } } }, async (req) => {
    const slugs = [...new Set(req.body.slugs)];
    await db.transaction(async (tx) => {
      await tx.delete(schema.userGoals).where(eq(schema.userGoals.userId, req.userId));
      // Insert one by one so createdAt order reflects the user's pick order.
      for (const goalSlug of slugs) await tx.insert(schema.userGoals).values({ userId: req.userId, goalSlug });
    });
    return loadMe(req.userId);
  });

  app.post("/children", { schema: { body: CreateChild, response: { 200: Child } } }, async (req) => {
    const [{ n }] = await db.select({ n: count() }).from(schema.children).where(eq(schema.children.userId, req.userId));
    if (n >= MAX_CHILDREN) throw new HttpError(400, `You can add up to ${MAX_CHILDREN} children for now.`);
    const [c] = await db
      .insert(schema.children)
      .values({ ...req.body, userId: req.userId })
      .returning();
    return toChild(c);
  });

  const ChildParams = z.object({ id: z.string().uuid() });

  app.patch("/children/:id", { schema: { params: ChildParams, body: UpdateChild, response: { 200: Child } } }, async (req) => {
    const [c] = await db
      .update(schema.children)
      .set(req.body)
      .where(and(eq(schema.children.id, req.params.id), eq(schema.children.userId, req.userId)))
      .returning();
    if (!c) throw notFound("Child");
    return toChild(c);
  });

  app.delete("/children/:id", { schema: { params: ChildParams } }, async (req) => {
    const res = await db
      .delete(schema.children)
      .where(and(eq(schema.children.id, req.params.id), eq(schema.children.userId, req.userId)))
      .returning({ id: schema.children.id });
    if (!res.length) throw notFound("Child");
    return { deleted: true };
  });
};
