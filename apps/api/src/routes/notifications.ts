import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Notification, type GoalSlug } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { iso } from "../lib/serialize";

const toNotification = (n: typeof schema.notifications.$inferSelect): Notification => ({
  id: n.id,
  title: n.title,
  body: n.body,
  goalSlug: (n.goalSlug as GoalSlug | null) ?? null,
  forDate: n.forDate,
  readAt: n.readAt ? iso(n.readAt) : null,
  createdAt: iso(n.createdAt),
});

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireUser);

  app.get(
    "/notifications",
    { schema: { response: { 200: z.object({ notifications: z.array(Notification), unread: z.number() }) } } },
    async (req) => {
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.userId, req.userId))
        .orderBy(desc(schema.notifications.forDate))
        .limit(30);
      return { notifications: rows.map(toNotification), unread: rows.filter((r) => !r.readAt).length };
    },
  );

  app.post(
    "/notifications/:id/read",
    { schema: { params: z.object({ id: z.string().uuid() }), response: { 200: Notification } } },
    async (req) => {
      const [n] = await db
        .update(schema.notifications)
        .set({ readAt: new Date() })
        .where(and(eq(schema.notifications.id, req.params.id), eq(schema.notifications.userId, req.userId)))
        .returning();
      if (!n) throw notFound("Notification");
      return toNotification(n);
    },
  );
};
