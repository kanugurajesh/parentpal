import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { describeFamily, loadFamilyContext } from "../src/services/context";
import { makeApp, onboarded, type App } from "./helpers";

let app: App;
beforeAll(async () => {
  app = await makeApp();
});
afterAll(() => app.close());

type Auth = Record<string, string>;

/** Mo (2, from onboarded) plus a baby sister, Ada (under 1). */
async function twoKids() {
  const g = await onboarded(app);
  const now = new Date();
  const ada = await app.inject({
    method: "POST",
    url: "/v1/children",
    headers: g.auth,
    payload: { nickname: "Ada", sex: "girl", birthMonth: now.getMonth() + 1, birthYear: now.getFullYear() },
  });
  return { ...g, moId: g.childId, adaId: ada.json().id as string };
}

const get = async (auth: Auth, url: string) => (await app.inject({ method: "GET", url, headers: auth })).json();
const tryWin = async (auth: Auth, childId: string, outcome: string) => {
  const t = (await app.inject({ method: "POST", url: "/v1/tries", headers: auth, payload: { winId: "tantrums-1", childId } })).json();
  await app.inject({ method: "POST", url: `/v1/tries/${t.id}/outcome`, headers: auth, payload: { outcome } });
  return t;
};

describe("two children", () => {
  it("keeps each child's tries and progress separate", async () => {
    const f = await twoKids();
    await tryWin(f.auth, f.moId, "helped");
    await tryWin(f.auth, f.moId, "helped");
    const adaTry = await tryWin(f.auth, f.adaId, "didnt");
    expect(adaTry.childId).toBe(f.adaId);

    const mo = await get(f.auth, `/v1/progress?childId=${f.moId}`);
    const ada = await get(f.auth, `/v1/progress?childId=${f.adaId}`);
    const all = await get(f.auth, "/v1/progress");
    expect(mo.goals[0]).toMatchObject({ tried: 2, helped: 2 });
    expect(ada.goals[0]).toMatchObject({ tried: 1, didnt: 1 });
    expect(all.goals[0].tried).toBe(3);

    // The goal screen's "You tried this" is per child too.
    const goalMo = await get(f.auth, `/v1/goals/tantrums?childId=${f.moId}`);
    const goalAda = await get(f.auth, `/v1/goals/tantrums?childId=${f.adaId}`);
    expect(goalMo.wins[0].mine).toMatchObject({ tried: 2, helped: 2 });
    expect(goalAda.wins[0].mine).toMatchObject({ tried: 1, helped: 0 });
  });

  it("keeps an open try per child, so trying a win with one doesn't reuse the other's", async () => {
    const f = await twoKids();
    const start = (childId: string) => app.inject({ method: "POST", url: "/v1/tries", headers: f.auth, payload: { winId: "tantrums-1", childId } });
    const a = (await start(f.moId)).json();
    const b = (await start(f.adaId)).json();
    expect(a.id).not.toBe(b.id);
    expect((await get(f.auth, `/v1/progress?childId=${f.adaId}`)).openTries.map((t: { id: string }) => t.id)).toEqual([b.id]);
  });

  it("filters moments and patterns by child", async () => {
    const f = await twoKids();
    for (const text of ["Screamed at bedtime when the tablet went off", "Hit his sister when tired", "Meltdown leaving the park"]) {
      await app.inject({ method: "POST", url: "/v1/moments", headers: f.auth, payload: { childId: f.moId, text } });
    }
    await app.inject({ method: "POST", url: "/v1/moments", headers: f.auth, payload: { childId: f.adaId, text: "Cried during the bath again" } });

    expect((await get(f.auth, `/v1/moments?childId=${f.adaId}`)).moments).toHaveLength(1);
    expect((await get(f.auth, `/v1/moments?childId=${f.moId}`)).moments).toHaveLength(3);
    const moPatterns = (await get(f.auth, `/v1/patterns?childId=${f.moId}`)).patterns;
    expect(moPatterns.length).toBeGreaterThan(0);
    expect((await get(f.auth, `/v1/patterns?childId=${f.adaId}`)).patterns).toEqual([]);
  });

  it("rejects another family's child everywhere", async () => {
    const f = await twoKids();
    const other = await onboarded(app);
    for (const url of [`/v1/progress?childId=${other.childId}`, `/v1/goals/tantrums?childId=${other.childId}`, `/v1/circles?childId=${other.childId}`]) {
      expect((await app.inject({ method: "GET", url, headers: f.auth })).statusCode).toBe(404);
    }
    const t = await app.inject({ method: "POST", url: "/v1/tries", headers: f.auth, payload: { winId: "tantrums-1", childId: other.childId } });
    expect(t.statusCode).toBe(404);
    const cg = await app.inject({ method: "POST", url: "/v1/caregivers", headers: f.auth, payload: { name: "Nani", relation: "grandparent", childId: other.childId } });
    expect(cg.statusCode).toBe(404);
  });

  it("ties a caregiver link to the chosen child", async () => {
    const f = await twoKids();
    const res = await app.inject({ method: "POST", url: "/v1/caregivers", headers: f.auth, payload: { name: "Nani", relation: "grandparent", childId: f.adaId } });
    expect(res.statusCode).toBe(200);
    expect(res.json().caregiver).toMatchObject({ childId: f.adaId, childNickname: "Ada" });
    expect(res.json().shareText).toContain("Ada");
    // Without a childId it's the first child, as before.
    const dflt = await app.inject({ method: "POST", url: "/v1/caregivers", headers: f.auth, payload: { name: "Dad", relation: "parent" } });
    expect(dflt.json().caregiver.childNickname).toBe("Mo");
  });

  it("uses the chosen child's age band in Circles", async () => {
    const f = await twoKids();
    expect((await get(f.auth, "/v1/circles")).myAgeBand).toBe("2-3y");
    expect((await get(f.auth, `/v1/circles?childId=${f.adaId}`)).myAgeBand).toBe("0-1y");
  });

  it("focuses the chat context on the chosen child", async () => {
    const f = await twoKids();
    await app.inject({ method: "POST", url: "/v1/moments", headers: f.auth, payload: { childId: f.moId, text: "Threw toys at dinner" } });
    await app.inject({ method: "POST", url: "/v1/moments", headers: f.auth, payload: { childId: f.adaId, text: "Woke up three times last night" } });

    const ctx = await loadFamilyContext(f.userId, f.adaId);
    expect(ctx.children[0].nickname).toBe("Ada");
    expect(ctx.focus).toBe("Ada");
    expect(ctx.recentMoments.every((m) => m.childNickname === "Ada")).toBe(true);
    expect(describeFamily(ctx)).toMatch(/This question is about: Ada/);

    // No focus: both children, no "about" line.
    const plain = await loadFamilyContext(f.userId);
    expect(plain.focus).toBeNull();
    expect(plain.recentMoments.map((m) => m.childNickname).sort()).toEqual(["Ada", "Mo"]);
    expect(describeFamily(plain)).not.toMatch(/This question is about/);

    // The chat route accepts the child too.
    const chat = await app.inject({ method: "POST", url: "/v1/chat/messages", headers: f.auth, payload: { text: "How do I help her sleep through the night?", childId: f.adaId } });
    expect(chat.statusCode).toBe(200);
    expect(chat.payload).toContain('"type":"done"');
  });
});
