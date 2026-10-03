import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../src/db/client";
import { getProvider, setProvider } from "../src/llm";
import { MockProvider } from "../src/llm/mock";
import { detectRedFlag } from "../src/services/safety";
import { addDays, runDailyTips, todayISO } from "../src/services/dailyTips";
import { ask, makeApp, onboarded, type App } from "./helpers";

let app: App;
const original = getProvider();
beforeAll(async () => {
  app = await makeApp();
});
afterEach(() => setProvider(original));
afterAll(() => app.close());

describe("safety classifier", () => {
  it.each([
    ["My baby is not breathing properly and her lips look blue", "medical_emergency"],
    ["he swallowed a button battery", "medical_emergency"],
    ["She hit her head on the table and now she keeps vomiting", "medical_emergency"],
    ["my partner hits him with a belt", "abuse"],
    ["I'm scared I will shake the baby", "abuse"],
    ["My husband slaps our son when he's angry and it leaves bruises", "abuse"],
    ["someone at daycare left marks on her arm", "abuse"],
    ["Sometimes I want to die", "self_harm"],
    ["my 4 year old keeps hurting herself on purpose", "self_harm"],
    ["My 2 year old isn't talking yet", "developmental_concern"],
    ["He doesn't respond to his name", "developmental_concern"],
  ])("flags %s", (text, category) => {
    expect(detectRedFlag(text)).toBe(category);
  });

  it.each([
    "My toddler bumped his head on a pillow and laughed",
    "Are there choking hazard toys I should avoid?",
    "He's not talking to me after I took the iPad",
    "My son hits me when he's angry",
    "I'm so tired I could cry",
    "My toddler kicks the baby when he wants my attention",
    "She threw her cup at me during dinner",
  ])("does not flag %s", (text) => {
    expect(detectRedFlag(text)).toBeNull();
  });
});

describe("safety in the product", () => {
  it("skips the LLM entirely on a red flag in chat", async () => {
    let calls = 0;
    class Spy extends MockProvider {
      stream(req: Parameters<MockProvider["stream"]>[0]) {
        calls++;
        return super.stream(req);
      }
      async complete(req: Parameters<MockProvider["complete"]>[0]) {
        calls++;
        return super.complete(req);
      }
    }
    setProvider(new Spy());
    const g = await onboarded(app);
    const { events } = await ask(app, g.auth, "my daughter swallowed some pills from my bag");
    const done = events.at(-1)!;
    expect(done.type === "done" && done.message.kind).toBe("safety");
    if (done.type === "done") {
      expect(done.message.safety?.category).toBe("medical_emergency");
      expect(done.message.content).toMatch(/911|999|112/);
      expect(done.message.citations).toEqual([]);
    }
    expect(calls).toBe(0);
    const ev = await db.select().from(schema.safetyEvents).where(eq(schema.safetyEvents.userId, g.userId));
    expect(ev.map((e) => e.category)).toEqual(["medical_emergency"]);
  });

  it("saves a red-flag moment untagged and returns the notice", async () => {
    const g = await onboarded(app);
    const res = await app.inject({
      method: "POST",
      url: "/v1/moments",
      headers: g.auth,
      payload: { childId: g.childId, text: "He still has no words at 2 and I'm worried" },
    });
    expect(res.json().safety.category).toBe("developmental_concern");
    expect(res.json().moment).toMatchObject({ tagStatus: "safety", trigger: null });
  });
});

describe("cost logging", () => {
  it("logs every LLM call and summarises it for admins only", async () => {
    const g = await onboarded(app);
    await ask(app, g.auth, "What's a good bedtime routine for a toddler?");
    const rows = await db.select().from(schema.llmCalls).where(eq(schema.llmCalls.userId, g.userId));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ purpose: "chat_answer", provider: "mock", ok: true });
    expect(rows[0].inputTokens).toBeGreaterThan(0);

    expect((await app.inject({ method: "GET", url: "/v1/admin/costs" })).statusCode).toBe(403);
    const sum = await app.inject({ method: "GET", url: "/v1/admin/costs", headers: { "x-admin-key": "dev-admin-key" } });
    expect(sum.statusCode).toBe(200);
    expect(sum.json().totalCalls).toBeGreaterThan(0);
    expect(sum.json().byPurpose.some((p: { purpose: string }) => p.purpose === "chat_answer")).toBe(true);
  });
});

describe("daily tips job", () => {
  it("creates one tip per user per day and is idempotent", async () => {
    const g = await onboarded(app, ["sleep"]);
    const day = "2031-01-15";
    await runDailyTips(day);
    await runDailyTips(day);
    const mine = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, g.userId));
    expect(mine).toHaveLength(1);
    expect(mine[0].goalSlug).toBe("sleep");
    expect(mine[0].body).toContain("Mo");

    await runDailyTips("2031-01-16");
    const res = await app.inject({ method: "GET", url: "/v1/notifications", headers: g.auth });
    const list = res.json().notifications;
    expect(list).toHaveLength(2);
    expect(list[0].forDate).toBe("2031-01-16");
    expect(new Set(list.map((n: { title: string }) => n.title)).size).toBe(2); // rotates wins
    expect(res.json().unread).toBe(2);

    const read = await app.inject({ method: "POST", url: `/v1/notifications/${list[0].id}/read`, headers: g.auth });
    expect(read.json().readAt).not.toBeNull();
  });

  it("gives a new profile today's tip the first time the inbox opens, once", async () => {
    const g = await onboarded(app, ["sleep"]);
    const url = `/v1/notifications?today=${todayISO()}`;
    const first = (await app.inject({ method: "GET", url, headers: g.auth })).json();
    expect(first.notifications).toHaveLength(1);
    expect(first.notifications[0]).toMatchObject({ forDate: todayISO(), goalSlug: "sleep" });
    expect(first.unread).toBe(1);
    const again = (await app.inject({ method: "GET", url, headers: g.auth })).json();
    expect(again.notifications.map((n: { id: string }) => n.id)).toEqual([first.notifications[0].id]);
  });

  it("creates no tips while the user has notifications turned off", async () => {
    const g = await onboarded(app, ["sleep"]);
    const off = await app.inject({ method: "PATCH", url: "/v1/me", headers: g.auth, payload: { notificationsEnabled: false } });
    expect(off.json().notificationsEnabled).toBe(false);

    const today = todayISO();
    expect((await app.inject({ method: "GET", url: `/v1/notifications?today=${today}`, headers: g.auth })).json().notifications).toEqual([]);
    expect((await app.inject({ method: "GET", url: `/v1/notifications/upcoming?from=${today}`, headers: g.auth })).json().notifications).toEqual([]);
    await runDailyTips("2031-03-01");
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, g.userId))).toHaveLength(0);

    await app.inject({ method: "PATCH", url: "/v1/me", headers: g.auth, payload: { notificationsEnabled: true } });
    expect((await app.inject({ method: "GET", url: `/v1/notifications?today=${today}`, headers: g.auth })).json().notifications).toHaveLength(1);
  });

  it("creates the next days' tips on demand, once, and hides them from the inbox until their day", async () => {
    const g = await onboarded(app, ["sleep", "tantrums"]);
    const other = await onboarded(app, ["picky-eating"]);
    const today = todayISO();
    const url = `/v1/notifications/upcoming?from=${today}`;

    const first = await app.inject({ method: "GET", url, headers: g.auth });
    expect(first.statusCode).toBe(200);
    const tips = first.json().notifications as { id: string; forDate: string; title: string }[];
    expect(tips.map((t) => t.forDate)).toEqual([today, addDays(today, 1), addDays(today, 2)]);
    expect(new Set(tips.map((t) => t.title)).size).toBe(3); // a different win each day

    const again = (await app.inject({ method: "GET", url, headers: g.auth })).json().notifications;
    expect(again.map((t: { id: string }) => t.id)).toEqual(tips.map((t) => t.id));
    expect(await db.select().from(schema.notifications).where(eq(schema.notifications.userId, g.userId))).toHaveLength(3);

    const inbox = (await app.inject({ method: "GET", url: `/v1/notifications?today=${today}`, headers: g.auth })).json();
    expect(inbox.notifications.map((n: { id: string }) => n.id)).toEqual([tips[0].id]);
    expect(inbox.unread).toBe(1);

    const theirs = (await app.inject({ method: "GET", url, headers: other.auth })).json().notifications;
    expect(theirs.every((t: { id: string }) => !tips.some((m) => m.id === t.id))).toBe(true);

    const far = await app.inject({ method: "GET", url: `/v1/notifications/upcoming?from=${addDays(today, 30)}`, headers: g.auth });
    expect(far.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `${url}&days=10`, headers: g.auth })).statusCode).toBe(400);
  });
});

describe("delete account", () => {
  it("removes every row that belongs to the user", async () => {
    const g = await onboarded(app);
    await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "weekly" } });
    for (const t of ["leaving the park, screamed", "leaving the park again, cried", "had to leave the park, hit me"])
      await app.inject({ method: "POST", url: "/v1/moments", headers: g.auth, payload: { childId: g.childId, text: t } });
    const { events } = await ask(app, g.auth, "How do I stop tantrums when leaving the park?");
    const done = events.at(-1)!;
    if (done.type === "done") {
      await app.inject({ method: "POST", url: `/v1/messages/${done.message.id}/feedback`, headers: g.auth, payload: { rating: 1 } });
      await app.inject({ method: "POST", url: `/v1/messages/${done.message.id}/bookmark`, headers: g.auth });
    }
    await ask(app, g.auth, "she swallowed a battery");
    await runDailyTips("2031-02-01");

    const del = await app.inject({ method: "DELETE", url: "/v1/me", headers: g.auth });
    expect(del.statusCode).toBe(200);

    const tables = [
      "children", "user_goals", "subscriptions", "moments", "patterns", "conversations",
      "message_feedback", "bookmarks", "notifications", "safety_events",
    ];
    for (const t of tables) {
      const [{ n }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(t)} WHERE user_id = ${g.userId}`);
      expect(n, t).toBe(0);
    }
    const [{ n: users }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM users WHERE id = ${g.userId}`);
    expect(users).toBe(0);
    const [{ n: linked }] = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM llm_calls WHERE user_id = ${g.userId}`);
    expect(linked).toBe(0); // cost rows are kept but anonymised

    // The old token is now useless.
    expect((await app.inject({ method: "GET", url: "/v1/me", headers: g.auth })).statusCode).toBe(401);
  });
});
