import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import type { App } from "./helpers";

// The other suites run without limits; this one builds an app with them on.
let app: App;
beforeAll(async () => {
  app = await buildApp({ rateLimits: true });
  await app.ready();
});
afterAll(() => app.close());

const from = (ip: string) => ({ remoteAddress: ip });

describe("rate limits", () => {
  it("caps guest creation per IP with a readable 429", async () => {
    for (let i = 0; i < 20; i++) {
      const ok = await app.inject({ method: "POST", url: "/v1/auth/guest", ...from("10.0.0.1") });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await app.inject({ method: "POST", url: "/v1/auth/guest", ...from("10.0.0.1") });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().message).toMatch(/too many requests/i);
    expect(blocked.headers["retry-after"]).toBeDefined();
    // Another IP isn't affected.
    expect((await app.inject({ method: "POST", url: "/v1/auth/guest", ...from("10.0.0.2") })).statusCode).toBe(200);
  });

  it("counts LLM routes per user, not per IP", async () => {
    const tokens = await Promise.all(
      ["10.0.1.1", "10.0.1.2"].map(async (ip) => (await app.inject({ method: "POST", url: "/v1/auth/guest", ...from(ip) })).json().token as string),
    );
    const [a, b] = tokens.map((t) => ({ authorization: `Bearer ${t}` }));
    // Validation fails (no child) but the request still counts, which is enough to test the bucket.
    const body = { childId: "00000000-0000-0000-0000-000000000000", text: "x" };
    for (let i = 0; i < 30; i++) await app.inject({ method: "POST", url: "/v1/moments", headers: a, payload: body, ...from("10.0.2.1") });
    expect((await app.inject({ method: "POST", url: "/v1/moments", headers: a, payload: body, ...from("10.0.2.1") })).statusCode).toBe(429);
    // Same IP, different parent: own budget.
    expect((await app.inject({ method: "POST", url: "/v1/moments", headers: b, payload: body, ...from("10.0.2.1") })).statusCode).not.toBe(429);
  });

  it("limits password-reset requests per IP", async () => {
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: "POST", url: "/v1/auth/forgot", payload: { email: "x@example.com" }, ...from("10.0.3.1") });
    }
    const blocked = await app.inject({ method: "POST", url: "/v1/auth/forgot", payload: { email: "x@example.com" }, ...from("10.0.3.1") });
    expect(blocked.statusCode).toBe(429);
  });
});
