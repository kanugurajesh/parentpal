import { eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AuthResponse, Credentials } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { hashPassword, requireUser, verifyPassword } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { toUser } from "../lib/serialize";

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const sign = (userId: string) => app.jwt.sign({ sub: userId }, { expiresIn: "180d" });

  /** Guest-first: every install gets a real user row immediately, no email needed. */
  app.post("/auth/guest", { schema: { response: { 200: AuthResponse } } }, async () => {
    const [user] = await db.insert(schema.users).values({ isGuest: true }).returning();
    return { token: sign(user.id), user: toUser(user) };
  });

  /** Upgrades the *current* guest in place, so children/moments/chat carry over. */
  app.post(
    "/auth/register",
    { preHandler: requireUser, schema: { body: Credentials, response: { 200: AuthResponse } } },
    async (req) => {
      const [me] = await db.select().from(schema.users).where(eq(schema.users.id, req.userId));
      if (!me.isGuest) throw new HttpError(409, "This profile already has an account.");
      const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, req.body.email));
      if (taken) throw new HttpError(409, "That email already has an account. Sign in instead.");
      const [user] = await db
        .update(schema.users)
        .set({ isGuest: false, email: req.body.email, passwordHash: await hashPassword(req.body.password) })
        .where(eq(schema.users.id, req.userId))
        .returning();
      return { token: sign(user.id), user: toUser(user) };
    },
  );

  app.post("/auth/login", { schema: { body: Credentials, response: { 200: AuthResponse } } }, async (req) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, req.body.email));
    const ok = user?.passwordHash ? await verifyPassword(req.body.password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
    return { token: sign(user.id), user: toUser(user) };
  });
};
