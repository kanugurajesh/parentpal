import type { z } from "zod";
import { db, schema } from "../db/client";
import { env } from "../env";
import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { CallContext, LLMProvider, LLMRequest, LLMUsage } from "./types";

export type { LLMRequest, CallContext } from "./types";

/** Groq speaks the OpenAI chat-completions API, so it reuses the OpenAI adapter. */
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

function createProvider(): LLMProvider {
  const opts = {
    reasoningEffort: env.LLM_REASONING_EFFORT || undefined,
    thinkingHeadroom: env.LLM_THINKING_TOKEN_HEADROOM,
  };
  if (env.llmProvider === "groq") {
    if (!env.GROQ_API_KEY) throw new Error("LLM_PROVIDER=groq but GROQ_API_KEY is empty");
    return new OpenAIProvider(env.GROQ_API_KEY, env.GROQ_MODEL, GROQ_BASE_URL, { ...opts, name: "groq" });
  }
  if (env.llmProvider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("LLM_PROVIDER=openai but OPENAI_API_KEY is empty");
    return new OpenAIProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL, env.OPENAI_BASE_URL, opts);
  }
  return new MockProvider(env.isTest ? 0 : 25);
}

let provider: LLMProvider = createProvider();

/** Tests and evals can swap the provider (e.g. a failing one) without touching env. */
export function setProvider(p: LLMProvider) {
  provider = p;
}
export function getProvider() {
  return provider;
}

export function costUsd(u: LLMUsage, providerName = provider.name) {
  if (providerName === "mock") return 0;
  return (u.inputTokens * env.LLM_PRICE_INPUT_PER_M + u.outputTokens * env.LLM_PRICE_OUTPUT_PER_M) / 1_000_000;
}

async function logCall(ctx: CallContext, usage: LLMUsage, latencyMs: number, error?: unknown) {
  try {
    await db.insert(schema.llmCalls).values({
      userId: ctx.userId ?? null,
      purpose: ctx.purpose,
      provider: provider.name,
      model: provider.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      latencyMs: Math.round(latencyMs),
      costUsd: costUsd(usage),
      ok: !error,
      error: error ? String((error as Error).message ?? error).slice(0, 500) : null,
    });
  } catch (e) {
    // Logging must never break the user-facing request.
    console.warn("[llm] failed to log call", e);
  }
}

const ZERO: LLMUsage = { inputTokens: 0, outputTokens: 0 };

export const llm = {
  get info() {
    return { provider: provider.name, model: provider.model };
  },

  async complete(ctx: CallContext, req: LLMRequest): Promise<string> {
    const t0 = performance.now();
    try {
      const r = await provider.complete(req);
      await logCall(ctx, r, performance.now() - t0);
      return r.text;
    } catch (err) {
      await logCall(ctx, ZERO, performance.now() - t0, err);
      throw err;
    }
  },

  /**
   * JSON call validated with zod. Retries once on invalid output, then throws, so callers
   * decide what a graceful fallback looks like (e.g. save the moment untagged).
   */
  async json<T>(ctx: CallContext, req: Omit<LLMRequest, "json">, schemaZ: z.ZodType<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const text = await llm.complete(ctx, { ...req, json: true });
      try {
        const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
        return schemaZ.parse(JSON.parse(cleaned));
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(`LLM returned invalid JSON for ${ctx.purpose}: ${(lastErr as Error)?.message}`);
  },

  /** Streams text deltas; logs latency (time to full completion), tokens and cost when done. */
  async *stream(ctx: CallContext, req: LLMRequest): AsyncGenerator<string, string> {
    const t0 = performance.now();
    const { deltas, usage } = provider.stream(req);
    let full = "";
    try {
      for await (const d of deltas) {
        full += d;
        yield d;
      }
      await logCall(ctx, await usage, performance.now() - t0);
      return full;
    } catch (err) {
      await logCall(ctx, ZERO, performance.now() - t0, err);
      throw err;
    }
  },
};
