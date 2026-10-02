import { sql } from "drizzle-orm";
import type { Citation, GoalSlug } from "@parentpal/shared";
import { db } from "../db/client";

export interface RetrievedChunk {
  id: string;
  goalSlug: GoalSlug;
  goalTitle: string;
  winId: string | null;
  winPosition: number | null;
  heading: string;
  body: string;
  sourceIds: string[];
  score: number;
}

/**
 * Parent vocabulary → words that appear in the seeded content. Small and hand-curated;
 * this is the cheap stand-in for embeddings and is the first thing to grow (or replace
 * with pgvector) if retrieval accuracy drops.
 */
const SYNONYMS: Record<string, string[]> = {
  meltdown: ["tantrum", "upset"],
  meltdowns: ["tantrum", "upset"],
  tantrum: ["angry", "upset", "feeling"],
  tantrums: ["angry", "upset", "feeling"],
  screaming: ["tantrum", "angry"],
  screams: ["tantrum", "angry"],
  crying: ["upset", "tantrum"],
  freaks: ["tantrum"],
  angry: ["feeling", "tantrum"],
  mad: ["angry", "feeling"],
  hitting: ["hit", "hurting"],
  hits: ["hit", "hurting"],
  biting: ["bite", "hurting"],
  bites: ["bite", "hurting"],
  kicking: ["kick", "hurting"],
  leaving: ["transition", "warning"],
  leave: ["transition", "warning"],
  park: ["transition", "slides"],
  bedtime: ["sleep", "routine", "bed"],
  night: ["sleep", "bed"],
  nap: ["sleep", "naps"],
  naps: ["sleep"],
  wakes: ["wake", "sleep"],
  waking: ["wake", "sleep"],
  asleep: ["sleep"],
  sleeping: ["sleep"],
  tablet: ["screen", "screens", "device"],
  ipad: ["screen", "screens", "device"],
  phone: ["screen", "device"],
  tv: ["screen", "screens"],
  cartoons: ["screen"],
  fussy: ["picky", "eat", "food"],
  picky: ["eat", "food", "new"],
  eat: ["food", "meal"],
  eating: ["eat", "food", "meal"],
  eats: ["eat", "food"],
  dinner: ["meal", "food"],
  lunch: ["meal", "food"],
  vegetables: ["food", "new", "carrot", "peppers"],
  veggies: ["vegetables", "food", "new"],
  broccoli: ["vegetables", "food", "new"],
  snacks: ["snack"],
  snacking: ["snack"],
  dessert: ["reward", "pressure"],
  bribe: ["pressure", "reward"],
  bribing: ["pressure", "reward"],
  force: ["pressure"],
  dressed: ["choices", "socks"],
  dressing: ["choices", "socks"],
  shoes: ["transition", "choices"],
  choice: ["choices"],
  hours: ["sleep", "need"],
  much: ["need"],
};

/**
 * Words every parenting question contains. Matching on them made off-topic questions
 * ("best stroller for a toddler?") look relevant, so they are dropped from the query.
 */
const GENERIC = new Set(
  "child children childs toddler toddlers kid kids son sons daughter daughters baby babies boy girl year years old month months good best help tips tip any what how should can does want get make thing things really always never every".split(" "),
);

function toQuery(text: string): string | null {
  const words = (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3 && !GENERIC.has(w));
  const expanded = new Set<string>();
  for (const w of words) {
    expanded.add(w);
    for (const s of SYNONYMS[w] ?? []) expanded.add(s);
  }
  if (!expanded.size) return null;
  // OR the terms: natural questions rarely share *every* word with a chunk.
  return [...expanded].join(" | ");
}

export async function retrieve(
  text: string,
  opts: { boostGoals?: string[]; limit?: number } = {},
): Promise<RetrievedChunk[]> {
  const q = toQuery(text);
  if (!q) return [];
  const boost = opts.boostGoals ?? [];
  const boostArr = sql`ARRAY[${sql.join(
    boost.length ? boost.map((b) => sql`${b}`) : [sql`''`],
    sql`, `,
  )}]::text[]`;
  const rows = await db.execute<{
    id: string;
    goal_slug: string;
    goal_title: string;
    win_id: string | null;
    win_position: number | null;
    heading: string;
    body: string;
    source_ids: string[];
    score: number;
  }>(sql`
    WITH q AS (SELECT to_tsquery('english', ${q}) AS query)
    SELECT c.id, c.goal_slug, g.title AS goal_title, c.win_id, w.position AS win_position,
           c.heading, c.body,
           COALESCE(w.source_ids, g.source_ids) AS source_ids,
           ts_rank_cd(c.tsv, q.query, 32)
             * CASE WHEN c.goal_slug = ANY(${boostArr}) THEN 1.25 ELSE 1 END AS score
    FROM content_chunks c
    JOIN goals g ON g.slug = c.goal_slug
    LEFT JOIN wins w ON w.id = c.win_id
    CROSS JOIN q
    WHERE c.tsv @@ q.query
    ORDER BY score DESC, c.id
    LIMIT ${opts.limit ?? 3}
  `);
  return rows.map((r) => ({
    id: r.id,
    goalSlug: r.goal_slug as GoalSlug,
    goalTitle: r.goal_title,
    winId: r.win_id,
    winPosition: r.win_position,
    heading: r.heading,
    body: r.body,
    sourceIds: r.source_ids ?? [],
    score: Number(r.score),
  }));
}

export function toCitation(c: RetrievedChunk): Citation {
  return {
    chunkId: c.id,
    goalSlug: c.goalSlug,
    goalTitle: c.goalTitle,
    winId: c.winId,
    label: c.winPosition ? `Win ${c.winPosition}: ${c.heading}` : c.heading,
    sourceIds: c.sourceIds,
  };
}
