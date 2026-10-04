import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateMoment, CreateMomentResponse, Moment, Pattern } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { HttpError, notFound } from "../lib/errors";
import { toMoment, toPattern } from "../lib/serialize";
import { createMoment, generatePattern } from "../services/story";
import { llmLimit } from "../lib/rateLimit";

async function ownedChild(userId: string, childId: string) {
  const [c] = await db
    .select()
    .from(schema.children)
    .where(and(eq(schema.children.id, childId), eq(schema.children.userId, userId)));
  if (!c) throw notFound("Child");
  return c;
}

export async function listPatterns(userId: string, childId?: string) {
  const rows = await db
    .select()
    .from(schema.patterns)
    .where(and(eq(schema.patterns.userId, userId), childId ? eq(schema.patterns.childId, childId) : undefined))
    .orderBy(desc(schema.patterns.createdAt));
  if (!rows.length) return [];
  const links = await db
    .select()
    .from(schema.patternMoments)
    .where(inArray(schema.patternMoments.patternId, rows.map((r) => r.id)));
  return rows.map((p) => toPattern(p, links.filter((l) => l.patternId === p.id).map((l) => l.momentId)));
}

export const storyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get(
    "/moments",
    { schema: { querystring: z.object({ childId: z.string().uuid().optional() }), response: { 200: z.object({ moments: z.array(Moment) }) } } },
    async (req) => {
      const where = req.query.childId
        ? and(eq(schema.moments.userId, req.userId), eq(schema.moments.childId, req.query.childId))
        : eq(schema.moments.userId, req.userId);
      const rows = await db.select().from(schema.moments).where(where).orderBy(desc(schema.moments.createdAt));
      return { moments: rows.map(toMoment) };
    },
  );

  app.post("/moments", { config: llmLimit.moment, schema: { body: CreateMoment, response: { 200: CreateMomentResponse } } }, async (req) => {
    const child = await ownedChild(req.userId, req.body.childId);
    return createMoment(req.userId, child, req.body.text);
  });

  app.delete("/moments/:id", { schema: { params: z.object({ id: z.string().uuid() }) } }, async (req) => {
    const res = await db
      .delete(schema.moments)
      .where(and(eq(schema.moments.id, req.params.id), eq(schema.moments.userId, req.userId)))
      .returning({ id: schema.moments.id });
    if (!res.length) throw notFound("Moment");
    return { deleted: true };
  });

  app.get(
    "/patterns",
    { schema: { querystring: z.object({ childId: z.string().uuid().optional() }), response: { 200: z.object({ patterns: z.array(Pattern) }) } } },
    async (req) => ({ patterns: await listPatterns(req.userId, req.query.childId) }),
  );

  app.post(
    "/patterns/generate",
    { config: llmLimit.pattern, schema: { body: z.object({ childId: z.string().uuid() }), response: { 200: Pattern } } },
    async (req) => {
      await ownedChild(req.userId, req.body.childId);
      const p = await generatePattern(req.userId, req.body.childId);
      if (!p) throw new HttpError(422, "Log at least 3 moments, with something in common, to see a pattern.");
      return p;
    },
  );
};
