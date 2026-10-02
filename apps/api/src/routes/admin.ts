import { sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { CostSummary } from "@parentpal/shared";
import { db } from "../db/client";
import { requireAdmin } from "../lib/auth";
import { runDailyTips } from "../services/dailyTips";

export async function costSummary(days = 30): Promise<CostSummary> {
  const since = sql`now() - make_interval(days => ${days})`;
  const [totals] = await db.execute<{
    total_calls: number;
    failed_calls: number;
    total_cost: number;
    input_tokens: number;
    output_tokens: number;
    avg_latency: number;
    p95_latency: number;
  }>(sql`
    SELECT count(*)::int AS total_calls,
           count(*) FILTER (WHERE NOT ok)::int AS failed_calls,
           coalesce(sum(cost_usd), 0)::float AS total_cost,
           coalesce(sum(input_tokens), 0)::int AS input_tokens,
           coalesce(sum(output_tokens), 0)::int AS output_tokens,
           coalesce(avg(latency_ms), 0)::float AS avg_latency,
           coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::float AS p95_latency
    FROM llm_calls WHERE created_at >= ${since}`);
  const byPurpose = await db.execute<{ purpose: string; calls: number; cost: number; avg_latency: number }>(sql`
    SELECT purpose, count(*)::int AS calls, coalesce(sum(cost_usd),0)::float AS cost, avg(latency_ms)::float AS avg_latency
    FROM llm_calls WHERE created_at >= ${since} GROUP BY purpose ORDER BY cost DESC, calls DESC`);
  const byModel = await db.execute<{ provider: string; model: string; calls: number; cost: number }>(sql`
    SELECT provider, model, count(*)::int AS calls, coalesce(sum(cost_usd),0)::float AS cost
    FROM llm_calls WHERE created_at >= ${since} GROUP BY provider, model ORDER BY cost DESC`);
  const byDay = await db.execute<{ day: string; calls: number; cost: number }>(sql`
    SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS calls, coalesce(sum(cost_usd),0)::float AS cost
    FROM llm_calls WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1`);

  const round = (n: number, d = 6) => Math.round(Number(n) * 10 ** d) / 10 ** d;
  return {
    totalCalls: totals.total_calls,
    failedCalls: totals.failed_calls,
    totalCostUsd: round(totals.total_cost),
    inputTokens: totals.input_tokens,
    outputTokens: totals.output_tokens,
    avgLatencyMs: Math.round(totals.avg_latency),
    p95LatencyMs: Math.round(totals.p95_latency),
    byPurpose: byPurpose.map((r) => ({ purpose: r.purpose, calls: r.calls, costUsd: round(r.cost), avgLatencyMs: Math.round(r.avg_latency) })),
    byModel: byModel.map((r) => ({ provider: r.provider, model: r.model, calls: r.calls, costUsd: round(r.cost) })),
    byDay: byDay.map((r) => ({ day: r.day, calls: r.calls, costUsd: round(r.cost) })),
  };
}

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook("preHandler", requireAdmin);

  app.get(
    "/admin/costs",
    { schema: { querystring: z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), response: { 200: CostSummary } } },
    (req) => costSummary(req.query.days),
  );

  app.post("/dev/run-daily-tips", async () => runDailyTips());
};
