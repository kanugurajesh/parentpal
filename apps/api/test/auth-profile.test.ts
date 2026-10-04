import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { guest, makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

describe("auth", () => {
  it("creates a guest with no email", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/auth/guest" });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ isGuest: true, email: null });
  });

  it("rejects requests without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/me" });
    expect(res.statusCode).toBe(401);
  });

  it("upgrades a guest in place, keeping their data, then logs in", async () => {
    const g = await onboarded(app);
    const reg = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: g.auth,
      payload: { email: `Sam+${Date.now()}@Example.com`, password: "correct horse" },
    });
    expect(reg.statusCode).toBe(200);
    const user = reg.json().user;
    expect(user).toMatchObject({ id: g.userId, isGuest: false });
    expect(user.email).toBe(user.email.toLowerCase());

    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: user.email, password: "correct horse" } });
    expect(login.statusCode).toBe(200);
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${login.json().token}` } });
    expect(me.json().children).toHaveLength(1);

    const bad = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: user.email, password: "wrong password" } });
    expect(bad.statusCode).toBe(401);
  });

  it("validates input with a readable message", async () => {
    const g = await guest(app);
    const res = await app.inject({ method: "POST", url: "/v1/auth/register", headers: g.auth, payload: { email: "nope", password: "short" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/email/i);
  });
});

describe("family profile", () => {
  it("stores only birth month + year and computes age", async () => {
    const g = await guest(app);
    const year = new Date().getFullYear() - 3;
    const res = await app.inject({
      method: "POST",
      url: "/v1/children",
      headers: g.auth,
      payload: { nickname: "Bee", sex: "girl", birthMonth: 1, birthYear: year },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ nickname: "Bee", birthMonth: 1, birthYear: year });
    expect(res.json().ageMonths).toBeGreaterThanOrEqual(36);
    const cols = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'children'`,
    );
    expect(cols.map((c) => c.column_name)).not.toContain("date_of_birth");
  });

  it("allows at most two children", async () => {
    const g = await guest(app);
    const add = () =>
      app.inject({ method: "POST", url: "/v1/children", headers: g.auth, payload: { nickname: "K", sex: "boy", birthMonth: 5, birthYear: 2023 } });
    expect((await add()).statusCode).toBe(200);
    expect((await add()).statusCode).toBe(200);
    expect((await add()).statusCode).toBe(400);
  });

  it("accepts 1-2 goals only", async () => {
    const g = await guest(app);
    const put = (slugs: string[]) => app.inject({ method: "PUT", url: "/v1/me/goals", headers: g.auth, payload: { slugs } });
    expect((await put(["sleep", "tantrums"])).json().goals).toEqual(["sleep", "tantrums"]);
    expect((await put(["sleep", "tantrums", "focus"])).statusCode).toBe(400);
    expect((await put([])).statusCode).toBe(400);
  });

  it("treats an empty patch as a no-op instead of failing", async () => {
    const g = await onboarded(app);
    const me = await app.inject({ method: "PATCH", url: "/v1/me", headers: g.auth, payload: {} });
    expect(me.statusCode).toBe(200);
    expect(me.json().firstName).toBe("Sam");
    const child = await app.inject({ method: "PATCH", url: `/v1/children/${g.childId}`, headers: g.auth, payload: {} });
    expect(child.statusCode).toBe(200);
    expect(child.json().nickname).toBe("Mo");
    const other = await guest(app);
    expect((await app.inject({ method: "PATCH", url: `/v1/children/${g.childId}`, headers: other.auth, payload: {} })).statusCode).toBe(404);
  });

  it("rejects a birth month in the future", async () => {
    const g = await guest(app);
    const now = new Date();
    if (now.getMonth() === 11) return; // December: no future month left this year
    const res = await app.inject({
      method: "POST",
      url: "/v1/children",
      headers: g.auth,
      payload: { nickname: "Bo", sex: "girl", birthMonth: now.getMonth() + 2, birthYear: now.getFullYear() },
    });
    expect(res.statusCode).toBe(400);
  });

  it("can't touch another user's child", async () => {
    const a = await onboarded(app);
    const b = await guest(app);
    const res = await app.inject({ method: "PATCH", url: `/v1/children/${a.childId}`, headers: b.auth, payload: { nickname: "X" } });
    expect(res.statusCode).toBe(404);
  });
});
