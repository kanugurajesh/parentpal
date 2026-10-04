import { eq, sql } from "drizzle-orm";
import { ageBandOf } from "@parentpal/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../src/db/client";
import { getProvider, setProvider } from "../src/llm";
import { MockProvider } from "../src/llm/mock";
import { pseudonymFor, settleBackground } from "../src/services/community";
import { findPII, scrubNicknames } from "../src/services/moderation";
import { guest, makeApp, onboarded, type App } from "./helpers";

let app: App;
const original = getProvider();
beforeAll(async () => {
  app = await makeApp();
});
afterEach(() => setProvider(original));
afterAll(async () => {
  await settleBackground();
  await app.close();
});

let n = 0;
/** An onboarded parent who created an account (guests can read Circles but not post). */
async function member(goals = ["tantrums"]) {
  const g = await onboarded(app, goals);
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    headers: g.auth,
    payload: { email: `circles-${Date.now()}-${n++}@example.com`, password: "password123" },
  });
  const token = res.json().token as string;
  return { ...g, auth: { authorization: `Bearer ${token}` } };
}

type Auth = Record<string, string>;
const post = (auth: Auth, body: string, extra: Record<string, unknown> = {}, goal = "tantrums") =>
  app.inject({ method: "POST", url: `/v1/circles/${goal}/posts`, headers: auth, payload: { kind: "share", body, ...extra } });
const reply = (auth: Auth, postId: string, body: string) =>
  app.inject({ method: "POST", url: `/v1/posts/${postId}/replies`, headers: auth, payload: { body } });
const getPost = (auth: Auth, id: string) => app.inject({ method: "GET", url: `/v1/posts/${id}`, headers: auth });
const feed = (auth: Auth, query = "", goal = "tantrums") => app.inject({ method: "GET", url: `/v1/circles/${goal}/posts${query}`, headers: auth });
const admin = { "x-admin-key": "dev-admin-key" };

class Failing extends MockProvider {
  async complete(): Promise<never> {
    throw new Error("provider down");
  }
}

describe("moderation helpers", () => {
  it("finds personal info", () => {
    expect(findPII("call me on +91 98765 43210")).toEqual(["phone numbers"]);
    expect(findPII("mail a.b@example.com")).toEqual(["email addresses"]);
    expect(findPII("see www.example.com or follow @tinyhelper")).toEqual(["links", "social handles"]);
    expect(findPII("She is 2 and naps at 1pm, 2019-2020 was hard")).toEqual([]);
  });

  it("replaces the author's children's nicknames", () => {
    expect(scrubNicknames("Mo hit me, then Mo's sister cried. Mohan was fine. Mo slept.", ["Mo"])).toBe(
      "My child hit me, then my child's sister cried. Mohan was fine. My child slept.",
    );
  });

  it("buckets ages into bands", () => {
    expect([0, 11, 12, 23, 24, 35, 36, 59, 60, 100].map(ageBandOf)).toEqual(["0-1y", "0-1y", "1-2y", "1-2y", "2-3y", "2-3y", "3-5y", "3-5y", "5y+", "5y+"]);
  });

  it("gives a stable pseudonym per circle that differs across circles", () => {
    const id = "6f1c2c6e-0000-4000-8000-000000000001";
    expect(pseudonymFor(id, "tantrums")).toBe(pseudonymFor(id, "tantrums"));
    const names = new Set(["tantrums", "sleep", "picky-eating", "screen-time", "focus"].map((g) => pseudonymFor(id, g)));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("circles", () => {
  it("lets guests read but not post", async () => {
    const g = await onboarded(app);
    const circles = await app.inject({ method: "GET", url: "/v1/circles", headers: g.auth });
    expect(circles.statusCode).toBe(200);
    expect(circles.json()).toMatchObject({ canPost: false, myAgeBand: "2-3y" });
    expect(circles.json().circles[0]).toMatchObject({ goalSlug: "tantrums", mine: true });
    expect((await feed(g.auth)).statusCode).toBe(200);
    const res = await post(g.auth, "Anyone else find mornings really hard?");
    expect(res.statusCode).toBe(403);
  });

  it("publishes a question anonymously and the guide answers with real citations", async () => {
    const a = await member();
    const b = await member();
    const res = await post(a.auth, "How do I handle a tantrum when Mo has to leave the park?", { kind: "question" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ outcome: "live", safety: null });
    const created = res.json().post;
    expect(created.body).toBe("How do I handle a tantrum when my child has to leave the park?");
    expect(created.author).toMatchObject({ isMe: true, label: "Mom of a 2-year-old" });
    expect(created.ageBand).toBe("2-3y");

    await settleBackground();
    const detail = await getPost(b.auth, created.id);
    const raw = detail.payload;
    expect(raw).not.toContain(a.userId);
    expect(raw).not.toMatch(/circles-\d+/);
    expect(raw).not.toMatch(/\bMo\b/);
    const [guide] = detail.json().replies;
    expect(guide).toMatchObject({ isGuide: true, author: null, status: "live" });
    expect(guide.citations.length).toBeGreaterThan(0);
    const chunkIds = (await db.select({ id: schema.contentChunks.id }).from(schema.contentChunks)).map((c) => c.id);
    for (const c of guide.citations) expect(chunkIds).toContain(c.chunkId);
    expect(detail.json().post.author.isMe).toBe(false);

    // The author hears about it in the inbox.
    await reply(b.auth, created.id, "Same here! A heads-up before leaving helped us a lot.");
    const inbox = (await app.inject({ method: "GET", url: "/v1/notifications", headers: a.auth })).json();
    const notice = inbox.notifications.find((x: { postId?: string }) => x.postId === created.id);
    expect(notice.title).toBe("1 new reply to your post, plus a guide answer");
    const read = await app.inject({ method: "POST", url: `/v1/notifications/${notice.id}/read`, headers: a.auth });
    expect(read.json().readAt).not.toBeNull();
  });

  it("gives no guide answer when the library doesn't cover the question", async () => {
    const a = await member();
    const res = await post(a.auth, "Which phone plan has the cheapest data for travel abroad?", { kind: "question" });
    await settleBackground();
    expect((await getPost(a.auth, res.json().post.id)).json().replies).toEqual([]);
  });

  it("does not publish a crisis post and shows support instead", async () => {
    const a = await member();
    const res = await post(a.auth, "Some days I want to end it all, I can't go on like this");
    expect(res.json()).toMatchObject({ outcome: "safety", post: null });
    expect(res.json().safety.category).toBe("self_harm");
    const events = await db.select().from(schema.safetyEvents).where(eq(schema.safetyEvents.userId, a.userId));
    expect(events.map((e) => e.surface)).toContain("community");
    expect((await feed(a.auth)).payload).not.toContain("end it all");
  });

  it("publishes a developmental worry with support pinned and no guide answer", async () => {
    const a = await member();
    const res = await post(a.auth, "My son isn't talking yet at 2, is anyone else waiting on this?", { kind: "question" });
    expect(res.json().outcome).toBe("live");
    expect(res.json().post.safety.category).toBe("developmental_concern");
    await settleBackground();
    expect((await getPost(a.auth, res.json().post.id)).json().replies).toEqual([]);
  });

  it("allows self-criticism but blocks attacks and personal info", async () => {
    const a = await member();
    const b = await member();
    const p = await post(a.auth, "I felt like a bad mom today after yelling at bedtime.");
    expect(p.json().outcome).toBe("live");
    const id = p.json().post.id;
    expect((await reply(b.auth, id, "You're a lazy parent, honestly.")).statusCode).toBe(422);
    const phone = await reply(b.auth, id, "Call me on 98765 43210 and we can talk");
    expect(phone.statusCode).toBe(422);
    expect(phone.json().message).toMatch(/phone numbers/);
    expect((await reply(b.auth, id, "This helped me: https://example.com/tips")).statusCode).toBe(422);
  });

  it("holds medication advice for review, visible only to its author", async () => {
    const a = await member();
    const b = await member();
    const id = (await post(a.auth, "Bedtime takes two hours every night lately.")).json().post.id;
    const r = await reply(b.auth, id, "Just give 1mg melatonin, works every time");
    expect(r.json().outcome).toBe("review");
    expect((await getPost(b.auth, id)).json().replies.map((x: { status: string }) => x.status)).toEqual(["review"]);
    expect((await getPost(a.auth, id)).json().replies).toEqual([]);
    const queue = (await app.inject({ method: "GET", url: "/v1/admin/community/queue", headers: admin })).json();
    const item = queue.items.find((i: { id: string }) => i.id === r.json().reply.id);
    expect(item.modReasons).toContain("medical_advice");
  });

  it("fails closed when the moderation model is down", async () => {
    const a = await member();
    setProvider(new Failing());
    const res = await post(a.auth, "Our evenings feel so chaotic, how do you all cope?");
    expect(res.json().outcome).toBe("review");
    setProvider(original);
    const other = await member();
    expect((await feed(other.auth)).payload).not.toContain("evenings feel so chaotic");
  });

  it("hides an item after 3 reports until a moderator approves it", async () => {
    const a = await member();
    const id = (await post(a.auth, "Sharing a small win: no meltdown at the shop today!")).json().post.id;
    const reporters = [await member(), await member(), await member()];
    expect((await app.inject({ method: "POST", url: "/v1/reports", headers: a.auth, payload: { targetType: "post", targetId: id, reason: "spam" } })).statusCode).toBe(400);
    let last;
    for (const r of reporters) {
      last = await app.inject({ method: "POST", url: "/v1/reports", headers: r.auth, payload: { targetType: "post", targetId: id, reason: "spam" } });
    }
    expect(last!.json()).toEqual({ reported: true, hidden: true });
    expect((await getPost(reporters[0].auth, id)).statusCode).toBe(404);

    const ok = await app.inject({ method: "POST", url: `/v1/admin/community/post/${id}`, headers: admin, payload: { action: "approve" } });
    expect(ok.json().status).toBe("live");
    const fourth = await member();
    const again = await app.inject({ method: "POST", url: "/v1/reports", headers: fourth.auth, payload: { targetType: "post", targetId: id, reason: "spam" } });
    expect(again.json().hidden).toBe(false);
  });

  it("hides a blocked parent's posts from the blocker only", async () => {
    const a = await member();
    const b = await member();
    const c = await member();
    const id = (await post(a.auth, "Unique block test post about bedtime struggles")).json().post.id;
    expect((await app.inject({ method: "POST", url: "/v1/blocks", headers: b.auth, payload: { targetType: "post", targetId: id } })).statusCode).toBe(200);
    expect((await feed(b.auth)).payload).not.toContain("Unique block test post");
    expect((await feed(c.auth)).payload).toContain("Unique block test post");
  });

  it("toggles reactions", async () => {
    const a = await member();
    const b = await member();
    const id = (await post(a.auth, "Potty training day three and we are still going!")).json().post.id;
    const react = () => app.inject({ method: "POST", url: "/v1/reactions", headers: b.auth, payload: { targetType: "post", targetId: id, kind: "same" } });
    expect((await react()).json()).toEqual({ reactions: { same: 1, helpful: 0 }, myReactions: ["same"] });
    expect((await react()).json()).toEqual({ reactions: { same: 0, helpful: 0 }, myReactions: [] });
  });

  it("rate-limits posting", async () => {
    const a = await member();
    for (let i = 0; i < 5; i++) expect((await post(a.auth, `Rate limit check number ${i} for today`)).statusCode).toBe(200);
    expect((await post(a.auth, "Rate limit check number 6 for today")).statusCode).toBe(429);
  });

  it("pages through the feed without skipping posts that share a timestamp", async () => {
    // 25 posts (more than one page) from 5 authors, to stay under the daily post limit.
    const authors = await Promise.all(Array.from({ length: 5 }, () => member(["focus"])));
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await post(authors[i % 5].auth, `Paging check ${i}: we tried a visual timer today`, {}, "focus");
      ids.push(res.json().post.id);
    }
    // Same millisecond, different microseconds: the old cursor skipped posts inside this gap.
    const t = schema.communityPosts;
    for (const [i, id] of ids.entries()) await db.update(t).set({ createdAt: sql`'2026-01-01T00:00:00.123Z'::timestamptz + ${`${i} microseconds`}::interval` }).where(eq(t.id, id));

    const reader = await member(["focus"]);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { posts: { id: string }[]; nextCursor: string | null } = (await feed(reader.auth, `?band=all${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, "focus")).json();
      seen.push(...page.posts.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    for (const id of ids) expect(seen).toContain(id);
  });

  it("notifies the post's author when a held reply is approved", async () => {
    const a = await member();
    const b = await member();
    const id = (await post(a.auth, "Approval notice test: how do you handle bedtime stalling?")).json().post.id;
    const r = await reply(b.auth, id, "We held this one back for review");
    const replyId = r.json().reply.id;
    // Put it back in review regardless of what moderation decided, then approve it.
    await db.update(schema.communityReplies).set({ status: "review" }).where(eq(schema.communityReplies.id, replyId));
    await db.delete(schema.communityNotices).where(eq(schema.communityNotices.postId, id));
    await app.inject({ method: "POST", url: `/v1/admin/community/reply/${replyId}`, headers: admin, payload: { action: "approve" } });
    const notices = await db.select().from(schema.communityNotices).where(eq(schema.communityNotices.postId, id));
    expect(notices.some((n) => n.count >= 1 && !n.guideReplied)).toBe(true);
  });

  it("filters by age band and borrows from neighbouring bands when quiet", async () => {
    const a = await member(["sleep"]);
    const res = await post(a.auth, "Bedtime band test: lights out at seven works for us", {}, "sleep");
    expect(res.json().post.ageBand).toBe("2-3y");
    const b = await member(["sleep"]);
    const exact = (await feed(b.auth, "?band=2-3y", "sleep")).json();
    expect(exact.posts.some((p: { id: string }) => p.id === res.json().post.id)).toBe(true);
    // "5y+" must be URL-encoded: a raw "+" decodes to a space.
    expect((await feed(b.auth, `?band=${encodeURIComponent("5y+")}`, "sleep")).statusCode).toBe(200);
    const neighbour = (await feed(b.auth, "?band=1-2y", "sleep")).json();
    expect(neighbour.nearby.some((p: { id: string }) => p.id === res.json().post.id)).toBe(true);
  });

  it("rolls 'what worked' reports up into win stats once enough parents report", async () => {
    const g = await guest(app);
    const winId = (await app.inject({ method: "GET", url: "/v1/goals/picky-eating", headers: g.auth })).json().wins[0].id;
    const statsNow = async () => (await app.inject({ method: "GET", url: "/v1/goals/picky-eating", headers: g.auth })).json().wins[0].community;
    expect((await post(g.auth, "This should fail, no win chosen here", { kind: "worked" }, "picky-eating")).statusCode).toBe(400);

    const outcomes = ["helped", "helped", "didnt"];
    for (const [i, outcome] of outcomes.entries()) {
      const m = await member(["picky-eating"]);
      const r = await post(m.auth, `Tried this one at dinner, report number ${i}`, { kind: "worked", winId, outcome }, "picky-eating");
      expect(r.json().post.win).toMatchObject({ id: winId });
      if (i === 1) expect(await statsNow()).toBeNull();
    }
    expect(await statsNow()).toEqual({ tried: 3, helped: 2 });
  });
});
