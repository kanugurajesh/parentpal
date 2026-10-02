import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadContent } from "../src/seed/content";
import { guest, makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

describe("content", () => {
  it("parses every goal file and only cites known sources", () => {
    const { goals, sources } = loadContent();
    expect(goals).toHaveLength(7);
    const withContent = goals.filter((g) => g.wins.length);
    expect(withContent.map((g) => g.slug).sort()).toEqual(["picky-eating", "sleep", "tantrums"]);
    const ids = new Set(sources.map((s) => s.id));
    for (const g of withContent) {
      expect(g.wins.length).toBeGreaterThanOrEqual(4);
      expect(g.wins.length).toBeLessThanOrEqual(5);
      for (const w of g.wins) {
        expect(w.sourceIds.length).toBeGreaterThan(0);
        for (const s of w.sourceIds) expect(ids.has(s)).toBe(true);
        expect(w.action && w.script && w.whatToExpect).toBeTruthy();
      }
    }
  });
});

describe("goals", () => {
  it("splits personalized goals (in pick order) from the rest", async () => {
    const g = await onboarded(app, ["sleep", "tantrums"]);
    const res = await app.inject({ method: "GET", url: "/v1/goals", headers: g.auth });
    const body = res.json();
    expect(body.personalized.map((x: { slug: string }) => x.slug)).toEqual(["sleep", "tantrums"]);
    expect(body.others).toHaveLength(5);
  });

  it("filters by category chip", async () => {
    const g = await guest(app);
    const res = await app.inject({ method: "GET", url: "/v1/goals?category=focus", headers: g.auth });
    const all = [...res.json().personalized, ...res.json().others];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((x: { category: string }) => x.category === "focus")).toBe(true);
    expect((await app.inject({ method: "GET", url: "/v1/goals?category=nope", headers: g.auth })).statusCode).toBe(400);
  });

  it("locks every win except the first on the free tier", async () => {
    const g = await guest(app);
    const res = await app.inject({ method: "GET", url: "/v1/goals/tantrums", headers: g.auth });
    const wins = res.json().wins;
    expect(wins[0]).toMatchObject({ position: 1, locked: false });
    expect(wins[0].script).toBeTruthy();
    for (const w of wins.slice(1)) expect(w).toMatchObject({ locked: true, action: null, script: null, whatToExpect: null });
  });

  it("unlocks all wins after the fake checkout, and re-locks on cancel", async () => {
    const g = await guest(app);
    const sub = await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "annual" } });
    expect(sub.json().subscription).toMatchObject({ plan: "annual", status: "active_fake" });
    const unlocked = (await app.inject({ method: "GET", url: "/v1/goals/sleep", headers: g.auth })).json().wins;
    expect(unlocked.every((w: { locked: boolean }) => !w.locked)).toBe(true);

    await app.inject({ method: "DELETE", url: "/v1/subscription", headers: g.auth });
    const relocked = (await app.inject({ method: "GET", url: "/v1/goals/sleep", headers: g.auth })).json().wins;
    expect(relocked.filter((w: { locked: boolean }) => w.locked)).toHaveLength(relocked.length - 1);
  });

  it("serves clearly fictional advisors", async () => {
    const g = await guest(app);
    const res = await app.inject({ method: "GET", url: "/v1/advisors", headers: g.auth });
    for (const a of res.json()) {
      expect(a.isPlaceholder).toBe(true);
      expect(a.bio).toMatch(/placeholder/i);
    }
  });
});
