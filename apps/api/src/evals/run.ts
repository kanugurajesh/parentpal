/**
 * ParentPal eval: retrieval accuracy, grounding, clarify behaviour and safety-trigger accuracy.
 *
 *   npm run eval                 # uses whatever provider the env selects (mock without a key)
 *   npm run eval -- --judge      # also asks the LLM to judge grounding (real provider only)
 *
 * Runs the real HTTP pipeline in-process (app.inject) as a throwaway guest, then deletes it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { sql } from "drizzle-orm";
import type { ChatStreamEvent, SafetyCategory } from "@parentpal/shared";
import { buildApp } from "../app";
import { db, sqlClient } from "../db/client";
import { llm } from "../llm";
import { retrieve } from "../services/retrieval";
import { detectRedFlag } from "../services/safety";

const here = path.dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = path.resolve(here, "../../../../evals");

const Case = z.object({
  id: z.string(),
  question: z.string(),
  expectedGoal: z.string().nullable(),
  expectedChunk: z.string().nullable(),
  expectSafety: z.string().nullable(),
  expectClarify: z.boolean(),
  note: z.string().optional(),
});
type Case = z.infer<typeof Case>;

const STOP = new Set(
  "the and for that with this your you are can try about have from they them what when will just like more into then than also there their it's isn't don't doesn't won't some even very".split(" "),
);
const contentWords = (s: string) => (s.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => w.length > 3 && !STOP.has(w));

/** Share of the answer's content words that appear in the cited chunks. Crude but cheap and deterministic. */
function lexicalSupport(answer: string, cited: string[]) {
  const words = contentWords(answer.replace(/\[\d+\]/g, ""));
  if (!words.length) return 0;
  const bag = new Set(contentWords(cited.join(" ")));
  return words.filter((w) => bag.has(w)).length / words.length;
}

const JudgeSchema = z.object({ supported: z.boolean(), unsupported_claims: z.array(z.string()).default([]) });

async function judge(answer: string, excerpts: string[]) {
  return llm.json(
    { purpose: "eval_judge" },
    {
      system:
        'You check whether a parenting answer is grounded. Given EXCERPTS and an ANSWER, decide if every specific factual claim or recommendation in ANSWER is supported by EXCERPTS (generic empathy and "ask your pediatrician" are fine). Reply JSON {"supported": boolean, "unsupported_claims": string[]}.',
      messages: [{ role: "user", content: `EXCERPTS:\n${excerpts.join("\n---\n")}\n\nANSWER:\n${answer}` }],
      maxTokens: 300,
      mock: () => JSON.stringify({ supported: true, unsupported_claims: [] }),
    },
    JudgeSchema,
  );
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(0)}%` : "n/a");

async function main() {
  const useJudge = process.argv.includes("--judge");
  const cases = z.array(Case).parse(JSON.parse(fs.readFileSync(path.join(EVAL_DIR, "cases.json"), "utf8")));
  const app = await buildApp();
  await app.ready();
  const startedAt = new Date();

  // Throwaway onboarded guest so answers get realistic family context.
  const g = (await app.inject({ method: "POST", url: "/v1/auth/guest" })).json();
  const auth = { authorization: `Bearer ${g.token}` };
  await app.inject({ method: "POST", url: "/v1/children", headers: auth, payload: { nickname: "Robin", sex: "girl", birthMonth: 6, birthYear: new Date().getFullYear() - 2 } });

  const rows: Record<string, unknown>[] = [];
  const safetyConf: Record<string, Record<string, number>> = {};

  for (const c of cases) {
    // --- Safety (classifier alone) ---
    const predicted = detectRedFlag(c.question) as SafetyCategory | null;
    const exp = c.expectSafety ?? "none";
    const got = predicted ?? "none";
    safetyConf[exp] ??= {};
    safetyConf[exp][got] = (safetyConf[exp][got] ?? 0) + 1;

    // --- Retrieval (top-3) ---
    const chunks = await retrieve(c.question, { limit: 3 });
    const goalHit = c.expectedGoal ? chunks.some((x) => x.goalSlug === c.expectedGoal) : null;
    const chunkHit = c.expectedChunk ? chunks.some((x) => x.id === c.expectedChunk) : null;

    // --- Full pipeline ---
    const res = await app.inject({ method: "POST", url: "/v1/chat/messages", headers: auth, payload: { text: c.question } });
    const events = res.payload
      .split("\n\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as ChatStreamEvent);
    const done = events.find((e) => e.type === "done");
    const msg = done && done.type === "done" ? done.message : null;
    const kind = msg?.kind ?? "error";

    let grounded: boolean | null = null;
    let support: number | null = null;
    let judged: boolean | null = null;
    let unsupported: string[] = [];
    if (msg && kind === "answer") {
      const citedBodies = chunks.filter((x) => msg.citations.some((ci) => ci.chunkId === x.id)).map((x) => `${x.heading}\n${x.body}`);
      grounded = msg.citations.length > 0;
      support = lexicalSupport(msg.content, citedBodies);
      if (useJudge && llm.info.provider !== "mock") {
        const j = await judge(msg.content, citedBodies.length ? citedBodies : ["(no excerpts)"]);
        judged = j.supported;
        unsupported = j.unsupported_claims;
      }
    }

    rows.push({
      id: c.id,
      question: c.question,
      safetyExpected: c.expectSafety,
      safetyPredicted: predicted,
      safetyOk: (c.expectSafety ?? null) === predicted,
      goalHit,
      chunkHit,
      top3: chunks.map((x) => `${x.id}:${x.score.toFixed(2)}`),
      kind,
      clarifyOk: c.expectSafety ? null : (kind === "clarify") === c.expectClarify,
      citations: msg?.citations.map((x) => x.chunkId) ?? [],
      grounded,
      lexicalSupport: support,
      judgeSupported: judged,
      unsupportedClaims: unsupported,
      answer: msg?.content ?? null,
    });
  }

  // --- Aggregate ---
  const r = rows as Array<Record<string, any>>;
  const goalCases = r.filter((x) => x.goalHit !== null);
  const chunkCases = r.filter((x) => x.chunkHit !== null);
  const answers = r.filter((x) => x.kind === "answer");
  const answersWithExpected = answers.filter((x) => cases.find((c) => c.id === x.id)?.expectedGoal);
  const clarifyCases = r.filter((x) => x.clarifyOk !== null);
  const pos = r.filter((x) => x.safetyExpected);
  const neg = r.filter((x) => !x.safetyExpected);
  const tp = pos.filter((x) => x.safetyPredicted).length;
  const fp = neg.filter((x) => x.safetyPredicted).length;
  const exactCat = pos.filter((x) => x.safetyOk).length;
  const avgSupport = answers.filter((x) => x.lexicalSupport !== null).reduce((s, x) => s + x.lexicalSupport, 0) / Math.max(1, answers.length);

  const [{ cost, calls }] = await db.execute<{ cost: number; calls: number }>(
    sql`SELECT coalesce(sum(cost_usd),0)::float AS cost, count(*)::int AS calls FROM llm_calls WHERE created_at >= ${startedAt.toISOString()}`,
  );

  const summary = {
    provider: llm.info,
    ranAt: startedAt.toISOString(),
    cases: cases.length,
    retrieval: {
      goalHitAt3: `${goalCases.filter((x) => x.goalHit).length}/${goalCases.length}`,
      exactChunkHitAt3: `${chunkCases.filter((x) => x.chunkHit).length}/${chunkCases.length}`,
    },
    grounding: {
      answersWithCitations: `${answersWithExpected.filter((x) => x.grounded).length}/${answersWithExpected.length} (on-topic answers)`,
      avgLexicalSupport: Number(avgSupport.toFixed(2)),
      judge: useJudge && llm.info.provider !== "mock" ? `${answers.filter((x) => x.judgeSupported).length}/${answers.length} judged fully supported` : "skipped (needs --judge and a real provider)",
    },
    clarify: { correct: `${clarifyCases.filter((x) => x.clarifyOk).length}/${clarifyCases.length}` },
    safety: {
      recall: `${tp}/${pos.length} (${pct(tp, pos.length)})`,
      falsePositives: `${fp}/${neg.length}`,
      exactCategory: `${exactCat}/${pos.length}`,
      confusion: safetyConf,
    },
    cost: { llmCalls: calls, usd: Number(cost.toFixed(6)) },
  };

  // --- Report ---
  console.log(`\nParentPal eval: ${cases.length} cases, provider=${llm.info.provider} (${llm.info.model})\n`);
  console.log("id   safety     retr(goal/chunk)  kind      clarify  cites  support");
  for (const x of r) {
    const mark = (v: boolean | null) => (v === null ? " -" : v ? " ✓" : " ✗");
    console.log(
      `${x.id.padEnd(4)} ${mark(x.safetyOk).padEnd(10)} ${(mark(x.goalHit) + " /" + mark(x.chunkHit)).padEnd(17)} ${String(x.kind).padEnd(9)} ${mark(x.clarifyOk).padEnd(8)} ${String(x.citations.length).padEnd(6)} ${x.lexicalSupport === null ? "-" : x.lexicalSupport.toFixed(2)}`,
    );
  }
  console.log("\n" + JSON.stringify(summary, null, 2));
  const failures = r.filter((x) => x.safetyOk === false || x.goalHit === false || x.chunkHit === false || x.clarifyOk === false);
  if (failures.length) {
    console.log("\nMisses:");
    for (const f of failures) console.log(`- ${f.id}: "${f.question}" → safety=${f.safetyPredicted ?? "none"}, kind=${f.kind}, top3=${f.top3.join(", ")}`);
  }

  fs.mkdirSync(path.join(EVAL_DIR, "results"), { recursive: true });
  const out = path.join(EVAL_DIR, "results", `${startedAt.toISOString().replace(/[:.]/g, "-")}-${llm.info.provider}.json`);
  fs.writeFileSync(out, JSON.stringify({ summary, rows }, null, 2));
  console.log(`\nSaved ${path.relative(process.cwd(), out)}`);

  await app.inject({ method: "DELETE", url: "/v1/me", headers: auth });
  await app.close();
  await sqlClient.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
  await sqlClient.end();
});
