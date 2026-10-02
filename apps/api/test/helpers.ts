import type { ChatStreamEvent } from "@parentpal/shared";
import { buildApp } from "../src/app";

export type App = Awaited<ReturnType<typeof buildApp>>;

export async function makeApp() {
  const app = await buildApp();
  await app.ready();
  return app;
}

export async function guest(app: App) {
  const res = await app.inject({ method: "POST", url: "/v1/auth/guest" });
  const body = res.json();
  return { token: body.token as string, userId: body.user.id as string, auth: { authorization: `Bearer ${body.token}` } };
}

/** A guest with one child and goals, i.e. someone who finished onboarding. */
export async function onboarded(app: App, goals = ["tantrums"]) {
  const g = await guest(app);
  const child = await app.inject({
    method: "POST",
    url: "/v1/children",
    headers: g.auth,
    payload: { nickname: "Mo", sex: "boy", birthMonth: 3, birthYear: new Date().getFullYear() - 2 },
  });
  await app.inject({ method: "PUT", url: "/v1/me/goals", headers: g.auth, payload: { slugs: goals } });
  await app.inject({ method: "PATCH", url: "/v1/me", headers: g.auth, payload: { parentRole: "mother", firstName: "Sam" } });
  return { ...g, childId: child.json().id as string };
}

export function parseSSE(payload: string): ChatStreamEvent[] {
  return payload
    .split("\n\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)));
}

export async function ask(app: App, auth: Record<string, string>, text: string, clarifies?: string) {
  const res = await app.inject({ method: "POST", url: "/v1/chat/messages", headers: auth, payload: { text, clarifies } });
  return { res, events: parseSSE(res.payload) };
}
