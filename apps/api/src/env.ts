import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgres://parentpal:parentpal@localhost:5433/parentpal"),
  TEST_DATABASE_URL: z.string().default("postgres://parentpal:parentpal@localhost:5433/parentpal_test"),
  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  ADMIN_KEY: z.string().default("dev-admin-key"),
  LLM_PROVIDER: z.enum(["groq", "openai", "mock", ""]).default(""),
  GROQ_API_KEY: z.string().default(""),
  GROQ_MODEL: z.string().default("openai/gpt-oss-120b"),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().default(""),
  /** Sent as `reasoning_effort` when set. Groq's gpt-oss models accept low/medium/high (default medium). */
  LLM_REASONING_EFFORT: z.enum(["", "none", "minimal", "low", "medium", "high"]).default(""),
  /** Extra output tokens added to every call's cap, because reasoning tokens share the output budget. */
  LLM_THINKING_TOKEN_HEADROOM: z.coerce.number().int().min(0).default(0),
  LLM_PRICE_INPUT_PER_M: z.coerce.number().default(0.15),
  LLM_PRICE_OUTPUT_PER_M: z.coerce.number().default(0.6),
  DAILY_TIP_CRON: z.string().default("0 8 * * *"),
  /** Where Family Playbook links point. Falls back to the ngrok domain, then localhost. */
  PUBLIC_BASE_URL: z.string().default(""),
  NGROK_DOMAIN: z.string().default(""),
});

const parsed = EnvSchema.parse(process.env);
const isTest = parsed.NODE_ENV === "test" || process.env.VITEST === "true";

// The dev defaults are public (they're in this file), so production must set its own.
if (parsed.NODE_ENV === "production") {
  const unset = [
    parsed.JWT_SECRET === EnvSchema.shape.JWT_SECRET.parse(undefined) && "JWT_SECRET",
    parsed.ADMIN_KEY === EnvSchema.shape.ADMIN_KEY.parse(undefined) && "ADMIN_KEY",
  ].filter(Boolean);
  if (unset.length) throw new Error(`Set ${unset.join(" and ")} in production: the dev defaults are not secret.`);
}

export const env = {
  ...parsed,
  isTest,
  databaseUrl: isTest ? parsed.TEST_DATABASE_URL : parsed.DATABASE_URL,
  publicBaseUrl: (
    parsed.PUBLIC_BASE_URL ||
    (parsed.NGROK_DOMAIN ? `https://${parsed.NGROK_DOMAIN.replace(/^https?:\/\//, "")}` : `http://localhost:${parsed.PORT}`)
  ).replace(/\/$/, ""),
  /** Tests always use the deterministic mock so they never cost money or flake. */
  llmProvider: (isTest
    ? "mock"
    : parsed.LLM_PROVIDER ||
      (parsed.GROQ_API_KEY ? "groq" : parsed.OPENAI_API_KEY ? "openai" : "mock")) as "groq" | "openai" | "mock",
};
