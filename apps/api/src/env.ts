import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgres://parentpal:parentpal@localhost:5433/parentpal"),
  TEST_DATABASE_URL: z.string().default("postgres://parentpal:parentpal@localhost:5433/parentpal_test"),
  JWT_SECRET: z.string().min(16).default("dev-only-secret-change-me-please"),
  ADMIN_KEY: z.string().default("dev-admin-key"),
  LLM_PROVIDER: z.enum(["openai", "mock", ""]).default(""),
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().default(""),
  LLM_PRICE_INPUT_PER_M: z.coerce.number().default(0.15),
  LLM_PRICE_OUTPUT_PER_M: z.coerce.number().default(0.6),
  DAILY_TIP_CRON: z.string().default("0 8 * * *"),
});

const parsed = EnvSchema.parse(process.env);
const isTest = parsed.NODE_ENV === "test" || process.env.VITEST === "true";

export const env = {
  ...parsed,
  isTest,
  databaseUrl: isTest ? parsed.TEST_DATABASE_URL : parsed.DATABASE_URL,
  /** Tests always use the deterministic mock so they never cost money or flake. */
  llmProvider: (isTest
    ? "mock"
    : parsed.LLM_PROVIDER || (parsed.OPENAI_API_KEY ? "openai" : "mock")) as "openai" | "mock",
};
