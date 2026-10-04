import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AuthResponse, Credentials, ForgotPassword, RESET_CODE_MAX_ATTEMPTS, RESET_CODE_MINUTES, ResetPassword } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { hashPassword, newResetCode, requireUser, verifyPassword } from "../lib/auth";
import { HttpError, isUniqueViolation } from "../lib/errors";
import { sendMail } from "../lib/mailer";
import { authLimit } from "../lib/rateLimit";
import { toUser } from "../lib/serialize";

/** A new code can't be requested more often than this, so the endpoint can't be used to spam an inbox. */
const RESEND_COOLDOWN_MS = 60_000;
const BAD_CODE = "That code is wrong or has expired. Ask for a new one.";

/** Exported so tests can await it; the route fires it without waiting. */
export async function issueResetCode(email: string, log: FastifyBaseLogger) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  // Guests have no email; an account always has a password.
  if (!user?.email || !user.passwordHash) return;

  const [recent] = await db
    .select({ userId: schema.passwordResets.userId })
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.userId, user.id), gt(schema.passwordResets.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS))));
  if (recent) return;

  const code = newResetCode();
  const row = { codeHash: await hashPassword(code), expiresAt: new Date(Date.now() + RESET_CODE_MINUTES * 60_000), attempts: 0, createdAt: new Date() };
  await db
    .insert(schema.passwordResets)
    .values({ userId: user.id, ...row })
    .onConflictDoUpdate({ target: schema.passwordResets.userId, set: row });

  await sendMail(
    {
      to: user.email,
      subject: `${code} is your ParentPal code`,
      text: [
        `Your code to reset your ParentPal password is ${code}.`,
        ``,
        `It works for ${RESET_CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email: your password stays the same.`,
      ].join("\n"),
    },
    log,
  );
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const sign = (u: { id: string; sessionVersion: number }) => app.jwt.sign({ sub: u.id, sv: u.sessionVersion }, { expiresIn: "180d" });

  /** Guest-first: every install gets a real user row immediately, no email needed. */
  app.post("/auth/guest", { config: authLimit.guest, schema: { response: { 200: AuthResponse } } }, async () => {
    const [user] = await db.insert(schema.users).values({ isGuest: true }).returning();
    return { token: sign(user), user: toUser(user) };
  });

  /** Upgrades the *current* guest in place, so children/moments/chat carry over. */
  app.post(
    "/auth/register",
    { config: authLimit.register, preHandler: requireUser, schema: { body: Credentials, response: { 200: AuthResponse } } },
    async (req) => {
      const [me] = await db.select().from(schema.users).where(eq(schema.users.id, req.userId));
      if (!me.isGuest) throw new HttpError(409, "This profile already has an account.");
      const [taken] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, req.body.email));
      if (taken) throw new HttpError(409, "That email already has an account. Sign in instead.");
      const passwordHash = await hashPassword(req.body.password);
      const [user] = await db
        .update(schema.users)
        .set({ isGuest: false, email: req.body.email, passwordHash })
        .where(eq(schema.users.id, req.userId))
        .returning()
        .catch((err: unknown) => {
          // Two registrations racing for the same email: the unique index settles it.
          if (isUniqueViolation(err)) throw new HttpError(409, "That email already has an account. Sign in instead.");
          throw err;
        });
      return { token: sign(user), user: toUser(user) };
    },
  );

  app.post("/auth/login", { config: authLimit.login, schema: { body: Credentials, response: { 200: AuthResponse } } }, async (req) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, req.body.email));
    const ok = user?.passwordHash ? await verifyPassword(req.body.password, user.passwordHash) : false;
    if (!user || !ok) throw new HttpError(401, "Email or password is incorrect.");
    return { token: sign(user), user: toUser(user) };
  });

  /**
   * Emails a 6-digit code. The answer is the same whether or not the email has an account, and all
   * the work happens after replying, so neither the body nor the timing tells a stranger who's signed up.
   */
  app.post(
    "/auth/forgot",
    { config: authLimit.forgot, schema: { body: ForgotPassword, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      void issueResetCode(req.body.email, req.log).catch((err: unknown) => req.log.error(err, "password reset email failed"));
      return { ok: true as const };
    },
  );

  /** Checks the code, sets the new password and signs in. Every other device is signed out. */
  app.post("/auth/reset", { config: authLimit.reset, schema: { body: ResetPassword, response: { 200: AuthResponse } } }, async (req) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, req.body.email));
    if (!user) throw new HttpError(400, BAD_CODE);

    // Spend a guess before checking it, atomically, so parallel requests can't get extra tries.
    const [reset] = await db
      .update(schema.passwordResets)
      .set({ attempts: sql`${schema.passwordResets.attempts} + 1` })
      .where(
        and(
          eq(schema.passwordResets.userId, user.id),
          lt(schema.passwordResets.attempts, RESET_CODE_MAX_ATTEMPTS),
          gt(schema.passwordResets.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!reset || !(await verifyPassword(req.body.code, reset.codeHash))) throw new HttpError(400, BAD_CODE);

    const passwordHash = await hashPassword(req.body.password);
    const updated = await db.transaction(async (tx) => {
      await tx.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id));
      const [u] = await tx
        .update(schema.users)
        .set({ passwordHash, sessionVersion: sql`${schema.users.sessionVersion} + 1` })
        .where(eq(schema.users.id, user.id))
        .returning();
      return u;
    });
    return { token: sign(updated), user: toUser(updated) };
  });
};
