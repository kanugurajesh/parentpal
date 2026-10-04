import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../src/db/client";
import { LOGS_PER_DAY } from "../src/services/playbook";
import { guest, makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

type Auth = Record<string, string>;
const addCaregiver = (auth: Auth, name = "Nani", relation = "grandparent") =>
  app.inject({ method: "POST", url: "/v1/caregivers", headers: auth, payload: { name, relation } });
const tokenOf = (url: string) => url.split("/p/")[1];
const page = (token: string) => app.inject({ method: "GET", url: `/p/${token}` });
const log = (token: string, payload: Record<string, unknown>) => app.inject({ method: "POST", url: `/p/${token}/log`, payload });

describe("family playbook", () => {
  it("shares win 1 of each goal by default, and only unlocked wins can be added", async () => {
    const g = await onboarded(app, ["tantrums", "sleep"]);
    const pb = (await app.inject({ method: "GET", url: "/v1/playbook", headers: g.auth })).json();
    expect(pb.childNickname).toBe("Mo");
    expect(pb.wins.map((w: { id: string }) => w.id)).toEqual(["tantrums-1", "sleep-1"]);
    expect(pb.available.every((w: { position: number }) => w.position === 1)).toBe(true);

    const locked = await app.inject({ method: "PUT", url: "/v1/playbook/wins", headers: g.auth, payload: { winIds: ["tantrums-2"] } });
    expect(locked.statusCode).toBe(400);
    const set = await app.inject({ method: "PUT", url: "/v1/playbook/wins", headers: g.auth, payload: { winIds: ["sleep-1"] } });
    expect(set.json().wins.map((w: { id: string }) => w.id)).toEqual(["sleep-1"]);

    await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "annual" } });
    const unlocked = await app.inject({ method: "PUT", url: "/v1/playbook/wins", headers: g.auth, payload: { winIds: ["tantrums-2", "sleep-1"] } });
    expect(unlocked.statusCode).toBe(200);
  });

  it("creates an unguessable link with a ready-to-send message, up to 5 people", async () => {
    const g = await onboarded(app);
    const res = await addCaregiver(g.auth);
    expect(res.statusCode).toBe(200);
    const { caregiver, shareText } = res.json();
    expect(tokenOf(caregiver.url).length).toBeGreaterThanOrEqual(40);
    expect(shareText).toContain("Hi Nani!");
    expect(shareText).toContain("Mo");
    expect(shareText).toContain(caregiver.url);
    for (let i = 0; i < 4; i++) expect((await addCaregiver(g.auth, `Helper ${i}`, "nanny")).statusCode).toBe(200);
    expect((await addCaregiver(g.auth, "One too many", "other")).statusCode).toBe(400);
  });

  it("serves a public page with the shared scripts and nothing private", async () => {
    const g = await onboarded(app);
    await app.inject({ method: "POST", url: "/v1/auth/register", headers: g.auth, payload: { email: `pb-${Date.now()}@example.com`, password: "password123" } });
    await app.inject({ method: "POST", url: "/v1/moments", headers: g.auth, payload: { childId: g.childId, text: "A private note only the parent should see" } });
    const { caregiver } = (await addCaregiver(g.auth, `<script>alert(1)</script>`)).json();
    const [win] = await db.select().from(schema.wins).where(eq(schema.wins.id, "tantrums-1"));

    const res = await page(tokenOf(caregiver.url));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["x-robots-tag"]).toContain("noindex");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.payload).toContain("Mo");
    expect(res.payload).toContain("Sam (Mom)");
    expect(res.payload).toContain(win.title.replace(/'/g, "&#39;").replace(/"/g, "&quot;"));
    expect(res.payload).not.toContain("<script>alert(1)</script>");
    expect(res.payload).toContain("&lt;script&gt;");
    expect(res.payload).not.toContain("private note");
    expect(res.payload).not.toMatch(/pb-\d+@example\.com/);

    const listed = (await app.inject({ method: "GET", url: "/v1/playbook", headers: g.auth })).json();
    expect(listed.caregivers[0].lastOpenedAt).not.toBeNull();
  });

  it("turns caregiver notes into moments in the parent's Story", async () => {
    const g = await onboarded(app);
    const token = tokenOf((await addCaregiver(g.auth)).json().caregiver.url);
    expect((await log(token, {})).statusCode).toBe(400);
    const res = await log(token, { quick: "worked", text: "We had to leave the park, I gave a two minute warning and he calmed down after a hug" });
    expect(res.json()).toEqual({ ok: true, safety: null });

    const moments = (await app.inject({ method: "GET", url: "/v1/moments", headers: g.auth })).json().moments;
    expect(moments[0]).toMatchObject({ loggedBy: "Nani", tagStatus: "ok", trigger: "Leaving somewhere fun", outcome: "Calmed after a hug" });
    expect(moments[0].text).toMatch(/^It worked: /);

    // Notes from the family count towards the parent's patterns.
    await log(token, { text: "Leaving the playground again, he screamed and cried" });
    const third = await app.inject({ method: "POST", url: "/v1/moments", headers: g.auth, payload: { childId: g.childId, text: "Time to go from the park, threw himself on the floor" } });
    expect(third.json().newPattern).not.toBeNull();

    const pb = (await app.inject({ method: "GET", url: "/v1/playbook", headers: g.auth })).json();
    expect(pb.caregivers[0].notesCount).toBe(2);
  });

  it("handles a red flag from a caregiver with support, not the LLM", async () => {
    const g = await onboarded(app);
    const token = tokenOf((await addCaregiver(g.auth)).json().caregiver.url);
    const res = await log(token, { text: "He swallowed a battery from the remote, what do I do" });
    expect(res.json().safety.category).toBe("medical_emergency");
    const [m] = await db.select().from(schema.moments).where(eq(schema.moments.userId, g.userId));
    expect(m.tagStatus).toBe("safety");
    const events = await db.select().from(schema.safetyEvents).where(eq(schema.safetyEvents.userId, g.userId));
    expect(events[0].surface).toBe("caregiver");
  });

  it("stops working when revoked, but keeps the notes", async () => {
    const g = await onboarded(app);
    const { caregiver } = (await addCaregiver(g.auth)).json();
    const token = tokenOf(caregiver.url);
    await log(token, { quick: "tough" });
    expect((await app.inject({ method: "DELETE", url: `/v1/caregivers/${caregiver.id}`, headers: g.auth })).statusCode).toBe(200);
    expect((await page(token)).statusCode).toBe(410);
    expect((await log(token, { quick: "worked" })).statusCode).toBe(410);
    const moments = (await app.inject({ method: "GET", url: "/v1/moments", headers: g.auth })).json().moments;
    expect(moments).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/v1/playbook", headers: g.auth })).json().caregivers).toEqual([]);
  });

  it("rejects unknown links and other parents' caregivers", async () => {
    expect((await page("x".repeat(43))).statusCode).toBe(404);
    const a = await onboarded(app);
    const b = await guest(app);
    const { caregiver } = (await addCaregiver(a.auth)).json();
    expect((await app.inject({ method: "DELETE", url: `/v1/caregivers/${caregiver.id}`, headers: b.auth })).statusCode).toBe(404);
    expect((await addCaregiver(b.auth)).statusCode).toBe(400); // no child profile yet
  });

  it("rate-limits notes per link", async () => {
    const g = await onboarded(app);
    const { caregiver } = (await addCaregiver(g.auth)).json();
    // Insert directly: going through the API would tag and pattern-check 20 times.
    await db.insert(schema.moments).values(
      Array.from({ length: LOGS_PER_DAY }, () => ({ userId: g.userId, childId: g.childId, text: "note", tagStatus: "failed" as const, caregiverId: caregiver.id, loggedBy: "Nani" })),
    );
    expect((await log(tokenOf(caregiver.url), { quick: "worked" })).statusCode).toBe(429);
  });
});
