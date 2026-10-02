import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getProvider, setProvider } from "../src/llm";
import { MockProvider } from "../src/llm/mock";
import { makeApp, onboarded, type App } from "./helpers";

let app: App;
const original = getProvider();
beforeAll(async () => {
  app = await makeApp();
});
afterEach(() => setProvider(original));
afterAll(() => app.close());

const add = (auth: Record<string, string>, childId: string, text: string) =>
  app.inject({ method: "POST", url: "/v1/moments", headers: auth, payload: { childId, text } });

describe("moments", () => {
  it("tags trigger / behavior / outcome", async () => {
    const g = await onboarded(app);
    const res = await add(g.auth, g.childId, "We had to leave the park and he screamed, calmed down after a hug");
    expect(res.statusCode).toBe(200);
    expect(res.json().moment).toMatchObject({
      trigger: "Leaving somewhere fun",
      behavior: "Screamed",
      outcome: "Calmed after a hug",
      tagStatus: "ok",
    });
    expect(res.json().newPattern).toBeNull();
  });

  it("still saves the moment when tagging returns garbage", async () => {
    class Garbage extends MockProvider {
      async complete() {
        return { text: "not json at all", inputTokens: 1, outputTokens: 1 };
      }
    }
    setProvider(new Garbage());
    const g = await onboarded(app);
    const res = await add(g.auth, g.childId, "Bedtime took an hour tonight");
    expect(res.json().moment).toMatchObject({ tagStatus: "failed", trigger: null, text: "Bedtime took an hour tonight" });
  });

  it("creates a pattern on the 3rd moment that links back to real moments", async () => {
    const g = await onboarded(app);
    const ids: string[] = [];
    const texts = [
      "Leaving the playground: he threw himself on the floor and cried",
      "He refused broccoli at dinner and pushed the plate away",
      "Time to go from the park again, screamed the whole way to the car",
    ];
    let last;
    for (const t of texts) {
      last = (await add(g.auth, g.childId, t)).json();
      ids.push(last.moment.id);
    }
    const p = last.newPattern;
    expect(p).not.toBeNull();
    expect(p.title).toMatch(/leaving somewhere fun/i);
    expect(p.momentIds.sort()).toEqual([ids[0], ids[2]].sort());
    expect(p.insight).toContain("Mo");

    const list = await app.inject({ method: "GET", url: "/v1/patterns", headers: g.auth });
    expect(list.json().patterns).toHaveLength(1);
  });

  it("drops a pattern whose moment ids are hallucinated", async () => {
    class Hallucinating extends MockProvider {
      async complete(req: Parameters<MockProvider["complete"]>[0]) {
        if (req.system.includes("patterns")) {
          const text = JSON.stringify({
            title: "Made up",
            insight: "This insight cites moments that don't exist.",
            suggestion: "Nothing to suggest here really.",
            momentIds: ["00000000-0000-0000-0000-000000000000", "11111111-1111-1111-1111-111111111111"],
          });
          return { text, inputTokens: 1, outputTokens: 1 };
        }
        return super.complete(req);
      }
    }
    setProvider(new Hallucinating());
    const g = await onboarded(app);
    for (let i = 0; i < 3; i++) await add(g.auth, g.childId, `Bedtime battle number ${i + 1}, cried a lot`);
    const res = await app.inject({ method: "POST", url: "/v1/patterns/generate", headers: g.auth, payload: { childId: g.childId } });
    expect(res.statusCode).toBe(422);
  });
});
