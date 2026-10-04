import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "../src/db/client";
import { testOutbox } from "../src/lib/mailer";
import { issueResetCode } from "../src/routes/auth";
import { makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** An onboarded parent with an account. */
async function account() {
  const g = await onboarded(app);
  const email = `reset+${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
  const reg = await app.inject({ method: "POST", url: "/v1/auth/register", headers: g.auth, payload: { email, password: "old password" } });
  return { ...g, email, token: reg.json().token as string };
}

/** The route sends mail after replying; tests issue the code directly so they can wait for it. */
async function codeFor(email: string) {
  await issueResetCode(email, app.log);
  const mail = testOutbox.findLast((m) => m.to === email);
  return mail?.text.match(/\b(\d{6})\b/)?.[1];
}

describe("forgot password", () => {
  it("answers the same for unknown emails, so it can't reveal who has an account", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/forgot", payload: { email: "nobody-here@example.com" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const a = await account();
    const known = await app.inject({ method: "POST", url: "/v1/auth/forgot", payload: { email: a.email } });
    expect(known.json()).toEqual({ ok: true });
  });

  it("resets the password with the emailed code, signs in, and signs out other devices", async () => {
    const a = await account();
    const code = await codeFor(a.email);
    expect(code).toMatch(/^\d{6}$/);
    // The code is stored hashed, never as-is.
    const [row] = await db.select().from(schema.passwordResets).where(eq(schema.passwordResets.userId, a.userId));
    expect(row.codeHash).not.toContain(code);

    const reset = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: a.email, code, password: "new password" } });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().user).toMatchObject({ id: a.userId, isGuest: false });

    // The new token works; the one from before the reset doesn't.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: bearer(reset.json().token) })).statusCode).toBe(200);
    const old = await app.inject({ method: "GET", url: "/v1/me", headers: bearer(a.token) });
    expect(old.statusCode).toBe(401);
    expect(old.json().message).toMatch(/password was changed/i);

    const oldLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: a.email, password: "old password" } });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: a.email, password: "new password" } });
    expect(newLogin.statusCode).toBe(200);

    // A code works once.
    const again = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: a.email, code, password: "third password" } });
    expect(again.statusCode).toBe(400);
  });

  it("locks the code after 5 wrong guesses, even if the 6th is right", async () => {
    const a = await account();
    const code = (await codeFor(a.email))!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: a.email, code: wrong, password: "new password" } });
      expect(res.statusCode).toBe(400);
    }
    const right = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: a.email, code, password: "new password" } });
    expect(right.statusCode).toBe(400);
  });

  it("rejects an expired code", async () => {
    const a = await account();
    const code = await codeFor(a.email);
    await db.update(schema.passwordResets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.passwordResets.userId, a.userId));
    const res = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: a.email, code, password: "new password" } });
    expect(res.statusCode).toBe(400);
  });

  it("doesn't send a second code within a minute", async () => {
    const a = await account();
    await codeFor(a.email);
    await codeFor(a.email);
    expect(testOutbox.filter((m) => m.to === a.email)).toHaveLength(1);
  });

  it("validates the code format", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/reset", payload: { email: "a@example.com", code: "12ab", password: "new password" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/6-digit/);
  });
});
