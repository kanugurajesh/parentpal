import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getProvider, setProvider } from "../src/llm";
import type { LLMProvider } from "../src/llm/types";
import { extractCitations, stripInvalidMarkers } from "../src/services/chat";
import type { RetrievedChunk } from "../src/services/retrieval";
import { ask, makeApp, onboarded, type App } from "./helpers";

let app: App;
const original = getProvider();
beforeAll(async () => {
  app = await makeApp();
});
afterEach(() => setProvider(original));
afterAll(() => app.close());

describe("chat streaming", () => {
  it("streams user → meta → deltas → done with grounded citations", async () => {
    const g = await onboarded(app);
    const { res, events } = await ask(app, g.auth, "My son screams every time we have to leave the park");
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(events[0].type).toBe("user");
    expect(events[1]).toMatchObject({ type: "meta", kind: "answer" });
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(3);
    const done = events.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type !== "done") return;
    expect(done.message.kind).toBe("answer");
    expect(done.message.citations[0]).toMatchObject({ goalSlug: "tantrums" });
    // The streamed text and the stored text match.
    const streamed = events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");
    expect(streamed.trim()).toBe(done.message.content);
    // Uses the child's nickname from context.
    expect(done.message.content).toContain("Mo");
  });

  it("never quotes locked wins to a free user, but does once they subscribe", async () => {
    const q = "My son screams every time we have to leave the park";
    const g = await onboarded(app);
    const free = (await ask(app, g.auth, q)).events.at(-1)!;
    if (free.type !== "done") throw new Error("expected done");
    const winIds = free.message.citations.map((c) => c.winId).filter((id): id is string => !!id);
    expect(winIds.every((id) => id.endsWith("-1"))).toBe(true);

    await app.inject({ method: "POST", url: "/v1/subscription", headers: g.auth, payload: { plan: "annual" } });
    const paid = (await ask(app, g.auth, q)).events.at(-1)!;
    if (paid.type !== "done") throw new Error("expected done");
    expect(paid.message.citations[0]).toMatchObject({ goalSlug: "tantrums", winId: "tantrums-3" });
  });

  it("asks one clarifying question with tap options for vague input, then answers the follow-up", async () => {
    const g = await onboarded(app, ["sleep"]);
    const first = await ask(app, g.auth, "help, I'm struggling");
    const clar = first.events.at(-1)!;
    expect(clar.type === "done" && clar.message.kind).toBe("clarify");
    if (clar.type !== "done") return;
    expect(clar.message.clarifyOptions.length).toBeGreaterThanOrEqual(2);
    expect(clar.message.clarifyOptions.length).toBeLessThanOrEqual(3);
    expect(clar.message.clarifyOptions[0]).toBe("Bedtime and sleep"); // active goal first

    const second = await ask(app, g.auth, clar.message.clarifyOptions[0], clar.message.id);
    const ans = second.events.at(-1)!;
    expect(ans.type === "done" && ans.message.kind).toBe("answer");
    if (ans.type === "done") expect(ans.message.citations[0]?.goalSlug).toBe("sleep");
  });

  it("returns the full history with ratings and bookmarks", async () => {
    const g = await onboarded(app);
    const { events } = await ask(app, g.auth, "How do I get my picky eater to try vegetables?");
    const done = events.at(-1)!;
    if (done.type !== "done") throw new Error("no done");
    const id = done.message.id;

    const fb = await app.inject({ method: "POST", url: `/v1/messages/${id}/feedback`, headers: g.auth, payload: { rating: -1 } });
    expect(fb.json().rating).toBe(-1);
    const fb2 = await app.inject({ method: "POST", url: `/v1/messages/${id}/feedback`, headers: g.auth, payload: { rating: 1 } });
    expect(fb2.json().rating).toBe(1);
    expect((await app.inject({ method: "POST", url: `/v1/messages/${id}/feedback`, headers: g.auth, payload: { rating: 5 } })).statusCode).toBe(400);

    await app.inject({ method: "POST", url: `/v1/messages/${id}/bookmark`, headers: g.auth });
    const marks = await app.inject({ method: "GET", url: "/v1/bookmarks", headers: g.auth });
    expect(marks.json().messages.map((m: { id: string }) => m.id)).toEqual([id]);

    const hist = (await app.inject({ method: "GET", url: "/v1/chat", headers: g.auth })).json().messages;
    expect(hist).toHaveLength(2);
    expect(hist[1]).toMatchObject({ id, rating: 1, bookmarked: true });

    await app.inject({ method: "DELETE", url: `/v1/messages/${id}/bookmark`, headers: g.auth });
    expect((await app.inject({ method: "GET", url: "/v1/bookmarks", headers: g.auth })).json().messages).toHaveLength(0);
  });

  it("clears the chat but keeps bookmarked replies usable", async () => {
    const g = await onboarded(app);
    const kept = (await ask(app, g.auth, "How do I get my picky eater to try vegetables?")).events.at(-1)!;
    if (kept.type !== "done") throw new Error("no done");
    await ask(app, g.auth, "bedtime routine ideas for a toddler");
    await app.inject({ method: "POST", url: `/v1/messages/${kept.message.id}/bookmark`, headers: g.auth });

    const cleared = await app.inject({ method: "DELETE", url: "/v1/chat", headers: g.auth });
    expect(cleared.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/chat", headers: g.auth })).json().messages).toEqual([]);

    const marks = (await app.inject({ method: "GET", url: "/v1/bookmarks", headers: g.auth })).json().messages;
    expect(marks.map((m: { id: string }) => m.id)).toEqual([kept.message.id]);
    const fb = await app.inject({ method: "POST", url: `/v1/messages/${kept.message.id}/feedback`, headers: g.auth, payload: { rating: 1 } });
    expect(fb.statusCode).toBe(200);

    // A new question starts from an empty history.
    await ask(app, g.auth, "How do I get my picky eater to try vegetables?");
    expect((await app.inject({ method: "GET", url: "/v1/chat", headers: g.auth })).json().messages).toHaveLength(2);

    await app.inject({ method: "DELETE", url: `/v1/messages/${kept.message.id}/bookmark`, headers: g.auth });
    expect((await app.inject({ method: "GET", url: "/v1/bookmarks", headers: g.auth })).json().messages).toHaveLength(0);
  });

  it("can't rate someone else's message", async () => {
    const a = await onboarded(app);
    const b = await onboarded(app);
    const done = (await ask(app, a.auth, "bedtime routine ideas for a toddler")).events.at(-1)!;
    if (done.type !== "done") throw new Error();
    const res = await app.inject({ method: "POST", url: `/v1/messages/${done.message.id}/feedback`, headers: b.auth, payload: { rating: 1 } });
    expect(res.statusCode).toBe(404);
  });

  it("drops citation numbers the model invented", async () => {
    const chunks = [{ id: "sleep-1", goalSlug: "sleep", goalTitle: "Fixing sleep issues", winId: "sleep-1", winPosition: 1, heading: "Routine", body: "", sourceIds: [], score: 1 }] as RetrievedChunk[];
    const text = "Try a routine [1]. Also melatonin helps [4].";
    expect(extractCitations(text, chunks).map((c) => c.chunkId)).toEqual(["sleep-1"]);
    expect(stripInvalidMarkers(text, 1)).toBe("Try a routine [1]. Also melatonin helps.");
  });

  it("emits an error event (not a hung stream) when the provider fails", async () => {
    const failing: LLMProvider = {
      name: "failing",
      model: "x",
      complete: async () => {
        throw new Error("boom");
      },
      stream: () => ({
        deltas: (async function* () {
          throw new Error("boom");
        })(),
        usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
      }),
    };
    setProvider(failing);
    const g = await onboarded(app);
    const { events } = await ask(app, g.auth, "How do I handle tantrums when leaving the park?");
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
