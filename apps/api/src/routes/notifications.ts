import { and, desc, eq, lte } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Notification, type GoalSlug } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { requireUser } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { iso } from "../lib/serialize";
import { addDays, todayISO, upcomingTips } from "../services/dailyTips";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Within a day of the server's date, which covers every time zone. */
function isNearServerToday(date: string) {
  const serverToday = todayISO();
  return date >= addDays(serverToday, -1) && date <= addDays(serverToday, 1);
}

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

  /**
   * `today` is the device's local date: tips already created for later days stay hidden until then.
   * Today's tip is created on first open if the morning job hasn't made one (e.g. a profile created
   * after it ran), so a new parent never opens an empty inbox.
   */
  app.get(
    "/notifications",
    {
      schema: {
        querystring: z.object({ today: IsoDate.optional() }),
        response: { 200: z.object({ notifications: z.array(Notification), unread: z.number() }) },
      },
    },
    async (req) => {
      const { today } = req.query;
      if (today && isNearServerToday(today)) await upcomingTips(req.userId, today, 1);
      const rows = await db
        .select()
        .from(schema.notifications)
        .where(and(eq(schema.notifications.userId, req.userId), today ? lte(schema.notifications.forDate, today) : undefined))
        .orderBy(desc(schema.notifications.forDate))
        .limit(30);
      return { notifications: rows.map(toNotification), unread: rows.filter((r) => !r.readAt).length };
    },
  );

  /**
   * Tips for the next few days, created on demand, so the app can schedule them as local
   * notifications. `from` is the device's local date; it must be within a day of the server's
   * (covers every time zone), and `days` is capped to bound LLM cost.
   */
  app.get(
    "/notifications/upcoming",
    {
      schema: {
        querystring: z.object({ from: IsoDate, days: z.coerce.number().int().min(1).max(3).default(3) }),
        response: { 200: z.object({ notifications: z.array(Notification) }) },
      },
    },
    async (req) => {
      const { from, days } = req.query;
      if (!isNearServerToday(from)) throw badRequest("from must be today's date");
      const rows = await upcomingTips(req.userId, from, days);
      return { notifications: rows.map(toNotification) };
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
