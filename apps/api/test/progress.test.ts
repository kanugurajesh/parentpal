import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../src/db/client";
import { adviceFor, trendOf } from "../src/services/progress";
import { guest, makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

type Auth = Record<string, string>;
const start = (auth: Auth, winId: string) => app.inject({ method: "POST", url: "/v1/tries", headers: auth, payload: { winId } });
const report = (auth: Auth, id: string, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: `/v1/tries/${id}/outcome`, headers: auth, payload });
const progress = async (auth: Auth) => (await app.inject({ method: "GET", url: "/v1/progress", headers: auth })).json();

describe("progress", () => {
  it("reuses the open try, and locked wins can't be tracked", async () => {
    const g = await onboarded(app);
    const first = await start(g.auth, "tantrums-1");
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ winId: "tantrums-1", goalSlug: "tantrums", childId: g.childId, outcome: null });
    expect((await start(g.auth, "tantrums-1")).json().id).toBe(first.json().id);
    expect((await start(g.auth, "tantrums-2")).statusCode).toBe(403);
    expect((await progress(g.auth)).openTries.map((t: { id: string }) => t.id)).toEqual([first.json().id]);
  });

  it("needs a child, and only the owner can report", async () => {
    const lonely = await guest(app);
    expect((await start(lonely.auth, "tantrums-1")).statusCode).toBe(400);
    const a = await onboarded(app);
    const b = await onboarded(app);
    const t = (await start(a.auth, "tantrums-1")).json();
    expect((await report(b.auth, t.id, { outcome: "helped" })).statusCode).toBe(404);
  });

  it("counts reported outcomes per goal and per win", async () => {
    const g = await onboarded(app, ["tantrums", "sleep"]);
    await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "annual" } });
    for (const [win, outcome] of [
      ["tantrums-1", "helped"],
      ["tantrums-1", "helped"],
      ["tantrums-2", "didnt"],
      ["sleep-1", "somewhat"],
    ]) {
      const t = (await start(g.auth, win)).json();
      expect((await report(g.auth, t.id, { outcome })).json().try.outcome).toBe(outcome);
    }
    await start(g.auth, "tantrums-3"); // open, not counted

    const p = await progress(g.auth);
    const tantrums = p.goals.find((x: { goalSlug: string }) => x.goalSlug === "tantrums");
    expect(tantrums).toMatchObject({ tried: 3, helped: 2, somewhat: 0, didnt: 1, recent: ["helped", "helped", "didnt"] });
    expect(tantrums.wins.map((w: { winId: string; tried: number }) => [w.winId, w.tried])).toEqual([
      ["tantrums-1", 2],
      ["tantrums-2", 1],
    ]);
    expect(p.goals.find((x: { goalSlug: string }) => x.goalSlug === "sleep")).toMatchObject({ tried: 1, somewhat: 1 });
    expect(p.openTries.map((t: { winId: string }) => t.winId)).toEqual(["tantrums-3"]);

    const goal = (await app.inject({ method: "GET", url: "/v1/goals/tantrums", headers: g.auth })).json();
    expect(goal.wins[0].mine).toMatchObject({ tried: 2, helped: 2, openTryId: null, advice: { kind: "keep" } });
    expect(goal.wins[2].mine.openTryId).toBe(p.openTries[0].id);
  });

  it("drops open tries after a week", async () => {
    const g = await onboarded(app);
    const t = (await start(g.auth, "tantrums-1")).json();
    await db
      .update(schema.winTries)
      .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
      .where(eq(schema.winTries.id, t.id));
    expect((await progress(g.auth)).openTries).toEqual([]);
    expect((await start(g.auth, "tantrums-1")).json().id).not.toBe(t.id);
  });

  it("turns a note into a linked moment, with the usual safety check", async () => {
    const g = await onboarded(app);
    const t = (await start(g.auth, "tantrums-1")).json();
    const res = (await report(g.auth, t.id, { outcome: "helped", text: "Left the park, gave a warning, calmed down after a hug" })).json();
    expect(res.moment.moment.tagStatus).toBe("ok");
    const [row] = await db.select().from(schema.winTries).where(eq(schema.winTries.id, t.id));
    expect(row.momentId).toBe(res.moment.moment.id);

    const t2 = (await start(g.auth, "tantrums-1")).json();
    const unsafe = (await report(g.auth, t2.id, { outcome: "didnt", text: "He swallowed a battery from the remote, what do I do" })).json();
    expect(unsafe.moment.safety.category).toBe("medical_emergency");
    expect(unsafe.try.outcome).toBe("didnt");
  });

  it("counts a caregiver's quick note about a shared win", async () => {
    const g = await onboarded(app, ["tantrums", "sleep"]);
    const { caregiver } = (await app.inject({ method: "POST", url: "/v1/caregivers", headers: g.auth, payload: { name: "Nani", relation: "grandparent" } })).json();
    const token = caregiver.url.split("/p/")[1];
    const log = (payload: Record<string, unknown>) => app.inject({ method: "POST", url: `/p/${token}/log`, payload });

    expect((await app.inject({ method: "GET", url: `/p/${token}` })).payload).toContain('<option value="sleep-1">');
    expect((await log({ quick: "worked", winId: "sleep-1" })).statusCode).toBe(200);
    expect((await log({ quick: "tough", winId: "tantrums-2" })).statusCode).toBe(400); // not shared
    expect((await log({ text: "Bedtime was fine", winId: "sleep-1" })).statusCode).toBe(200); // no quick: just a note

    const p = await progress(g.auth);
    expect(p.goals.find((x: { goalSlug: string }) => x.goalSlug === "sleep")).toMatchObject({ tried: 1, helped: 1 });
    const [row] = await db.select().from(schema.winTries).where(eq(schema.winTries.userId, g.userId));
    expect(row).toMatchObject({ caregiverId: caregiver.id, winId: "sleep-1", outcome: "helped" });
    expect(row.momentId).not.toBeNull();
  });

  it("is deleted with the account", async () => {
    const g = await onboarded(app);
    const t = (await start(g.auth, "tantrums-1")).json();
    await report(g.auth, t.id, { outcome: "helped" });
    expect((await app.inject({ method: "DELETE", url: "/v1/me", headers: g.auth })).statusCode).toBe(200);
    expect(await db.select().from(schema.winTries).where(eq(schema.winTries.userId, g.userId))).toEqual([]);
  });

  it("tells the chat which wins have helped", async () => {
    const g = await onboarded(app);
    const t = (await start(g.auth, "tantrums-1")).json();
    await report(g.auth, t.id, { outcome: "helped" });
    const { loadFamilyContext, describeFamily } = await import("../src/services/context");
    expect(describeFamily(await loadFamilyContext(g.userId))).toMatch(/Wins they tried and how it went: .+helped 1 of 1 tries/);
  });

  it("suggests the next step for each win", async () => {
    const g = await onboarded(app);
    const tryAs = async (win: string, outcome: string) => report(g.auth, (await start(g.auth, win)).json().id, { outcome });
    const advice = async (pos: number) => (await app.inject({ method: "GET", url: "/v1/goals/tantrums", headers: g.auth })).json().wins[pos - 1].mine?.advice;

    await tryAs("tantrums-1", "didnt");
    expect(await advice(1)).toBeNull();
    await tryAs("tantrums-1", "didnt");
    await tryAs("tantrums-1", "didnt");
    // Free plan: win 2 is locked, so no sales pitch, just "ask".
    expect(await advice(1)).toMatchObject({ kind: "ask", winId: null });

    await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "annual" } });
    expect(await advice(1)).toMatchObject({ kind: "switch", winId: "tantrums-2" });
    expect((await advice(1)).text).toContain("win 2");

    // Win 2 stuck too: suggest win 3, and from win 2 wrap around past stuck win 1.
    for (let i = 0; i < 3; i++) await tryAs("tantrums-2", "didnt");
    expect(await advice(1)).toMatchObject({ kind: "switch", winId: "tantrums-3" });
    expect(await advice(2)).toMatchObject({ kind: "switch", winId: "tantrums-3" });

    await tryAs("tantrums-3", "somewhat");
    await tryAs("tantrums-3", "helped");
    expect(await advice(3)).toMatchObject({ kind: "patience" });
    await tryAs("tantrums-3", "helped");
    expect(await advice(3)).toMatchObject({ kind: "keep" });
  });

  it("advice rules", () => {
    const next = { id: "w-2", position: 2, title: "Name it", locked: false };
    expect(adviceFor([], next)).toBeNull();
    expect(adviceFor(["helped"], next)).toBeNull();
    expect(adviceFor(["didnt", "helped", "helped"], next)?.kind).toBe("keep");
    expect(adviceFor(["helped", "didnt", "didnt", "didnt"], next)?.kind).toBe("switch");
    expect(adviceFor(["didnt", "didnt", "didnt"], null)?.kind).toBe("ask");
    expect(adviceFor(["didnt", "didnt", "didnt"], { ...next, locked: true })?.kind).toBe("ask");
    expect(adviceFor(["somewhat", "somewhat"], next)?.kind).toBe("patience");
    expect(adviceFor(["didnt", "somewhat"], next)).toBeNull();
  });

  it("compares the first week with the last 7 days", async () => {
    const now = Date.now();
    const at = (daysAgo: number, outcome: "helped" | "somewhat" | "didnt") => ({ outcome, reportedAt: new Date(now - daysAgo * 86_400_000) });
    const tries = [at(20, "didnt"), at(19, "helped"), at(18, "didnt"), at(16, "didnt"), at(10, "didnt"), at(5, "helped"), at(3, "helped"), at(1, "somewhat")];
    expect(trendOf(tries, now)).toEqual({ start: { tried: 4, helped: 1 }, now: { tried: 3, helped: 2 } });
    // Too new: the first week is still this week.
    expect(trendOf([at(3, "didnt"), at(2, "helped"), at(1, "helped")], now)).toBeNull();
    // Too few tries lately.
    expect(trendOf([at(20, "didnt"), at(19, "didnt"), at(2, "helped")], now)).toBeNull();

    const g = await onboarded(app);
    for (const t of tries) {
      const id = (await start(g.auth, "tantrums-1")).json().id;
      await report(g.auth, id, { outcome: t.outcome });
      await db.update(schema.winTries).set({ reportedAt: t.reportedAt }).where(eq(schema.winTries.id, id));
    }
    const p = await progress(g.auth);
    expect(p.goals[0].trend).toEqual({ start: { tried: 4, helped: 1 }, now: { tried: 3, helped: 2 } });
  });
});
