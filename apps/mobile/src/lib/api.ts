import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import { Platform } from "react-native";
import type {
  Advisor,
  AuthResponse,
  ChatMessage,
  ChatStreamEvent,
  Child,
  CreateChild,
  CreateMomentResponse,
  GoalDetail,
  GoalFilter,
  GoalSlug,
  GoalsResponse,
  Me,
  Moment,
  Notification,
  Pattern,
  Plan,
  Topic,
  UpdateMe,
  User,
} from "@parentpal/shared";

/**
 * Where's the API? EXPO_PUBLIC_API_URL wins. Otherwise, in development, reuse the host the
 * Expo dev server is on, so a physical phone on the same Wi-Fi just works.
 */
function resolveBaseUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (Platform.OS === "web") return "http://localhost:4000";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:4000`;
  return Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000";
}
export const API_URL = resolveBaseUrl();
/** ngrok's free tier serves a browser warning page unless this header is present. */
const TUNNEL_HEADERS: Record<string, string> = API_URL.includes("ngrok") ? { "ngrok-skip-browser-warning": "1" } : {};

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1${path}`, {
      method,
      headers: {
        ...TUNNEL_HEADERS,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, `Can't reach ParentPal's server at ${API_URL}. Check that the API is running.`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.message ?? `Request failed (${res.status}).`);
  return data as T;
}

export const api = {
  guest: () => request<AuthResponse>("POST", "/auth/guest"),
  register: (email: string, password: string) => request<AuthResponse>("POST", "/auth/register", { email, password }),
  login: (email: string, password: string) => request<AuthResponse>("POST", "/auth/login", { email, password }),

  me: () => request<Me>("GET", "/me"),
  updateMe: (body: UpdateMe) => request<User>("PATCH", "/me", body),
  deleteMe: () => request<{ deleted: true }>("DELETE", "/me"),
  setGoals: (slugs: GoalSlug[]) => request<Me>("PUT", "/me/goals", { slugs }),
  addChild: (body: CreateChild) => request<Child>("POST", "/children", body),
  updateChild: (id: string, body: Partial<CreateChild>) => request<Child>("PATCH", `/children/${id}`, body),
  deleteChild: (id: string) => request<{ deleted: true }>("DELETE", `/children/${id}`),

  goals: (category: GoalFilter) => request<GoalsResponse>("GET", `/goals?category=${category}`),
  goal: (slug: string) => request<GoalDetail>("GET", `/goals/${slug}`),
  advisors: () => request<Advisor[]>("GET", "/advisors"),
  subscribe: (plan: Plan) => request<Me>("POST", "/subscription", { plan }),
  cancelSubscription: () => request<Me>("DELETE", "/subscription"),

  moments: () => request<{ moments: Moment[] }>("GET", "/moments"),
  addMoment: (childId: string, text: string) => request<CreateMomentResponse>("POST", "/moments", { childId, text }),
  deleteMoment: (id: string) => request<{ deleted: true }>("DELETE", `/moments/${id}`),
  patterns: () => request<{ patterns: Pattern[] }>("GET", "/patterns"),

  chat: () => request<{ messages: ChatMessage[] }>("GET", "/chat"),
  starters: () => request<{ starters: string[] }>("GET", "/chat/starters"),
  topics: () => request<{ topics: Topic[] }>("GET", "/chat/topics"),
  feedback: (id: string, rating: 1 | -1) => request<ChatMessage>("POST", `/messages/${id}/feedback`, { rating }),
  bookmark: (id: string, on: boolean) => request<ChatMessage>(on ? "POST" : "DELETE", `/messages/${id}/bookmark`),
  bookmarks: () => request<{ messages: ChatMessage[] }>("GET", "/bookmarks"),

  notifications: () => request<{ notifications: Notification[]; unread: number }>("GET", "/notifications"),
  readNotification: (id: string) => request<Notification>("POST", `/notifications/${id}/read`),
};

/**
 * POST /chat/messages and parse the SSE stream as it arrives.
 * Uses expo/fetch, whose response.body is a real ReadableStream on web, iOS and Android.
 */
export async function streamChat(
  input: { text: string; clarifies?: string },
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
) {
  const res = await expoFetch(`${API_URL}/v1/chat/messages`, {
    method: "POST",
    headers: { ...TUNNEL_HEADERS, "Content-Type": "application/json", Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(input),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    let message = `Request failed (${res.status}).`;
    try {
      message = JSON.parse(text).message ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (frame.startsWith("data: ")) onEvent(JSON.parse(frame.slice(6)) as ChatStreamEvent);
    }
  }
}
