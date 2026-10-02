import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { formatAge, MOMENTS_PER_PATTERN, ageInMonths, type Pattern } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { llm } from "../llm";
import { toPattern } from "../lib/serialize";

/* ------------------------------------------------------------------ */
/* Moment tagging                                                      */
/* ------------------------------------------------------------------ */

const TagSchema = z.object({
  trigger: z.string().max(80).nullable(),
  behavior: z.string().max(80).nullable(),
  outcome: z.string().max(80).nullable(),
});
export type Tags = z.infer<typeof TagSchema>;

const TAG_SYSTEM = `You label short parent journal entries about a young child.
Return JSON {"trigger": string|null, "behavior": string|null, "outcome": string|null}.
- trigger: what happened just before (e.g. "Leaving the park", "Tired before nap", "Told no to tablet").
- behavior: what the child did (e.g. "Screamed and lay on floor", "Refused vegetables").
- outcome: how it ended (e.g. "Calmed after a hug", "Ate the rice only").
Each value is a short phrase of 2-6 words in sentence case, no trailing period. Use null if the entry doesn't say.
Describe, don't judge or diagnose.`;

/** Keyword heuristics for mock mode: good enough to make the demo and tests meaningful. */
const TRIGGER_RULES: [RegExp, string][] = [
  [/\b(leav\w*|park|playground|time to go|had to go)\b/i, "Leaving somewhere fun"],
  [/\b(tablet|ipad|screen|tv|phone|show|cartoon)\b/i, "Screen time ending"],
  [/\b(tired|nap|sleepy|overtired|late)\b/i, "Tired"],
  [/\b(hungry|snack|before (?:lunch|dinner))\b/i, "Hungry"],
  [/\b(bed|bedtime|night)\b/i, "Bedtime"],
  [/\b(dinner|lunch|breakfast|meal|vegetables|veggies|broccoli|food|plate)\b/i, "Mealtime"],
  [/\b(dress\w*|clothes|socks|shoes|coat)\b/i, "Getting dressed"],
  [/\b(sister|brother|sibling|baby)\b/i, "Sibling conflict"],
  [/\b(said no|told (?:him|her|them) no|wouldn't let|not allowed)\b/i, "Being told no"],
];
const BEHAVIOR_RULES: [RegExp, string][] = [
  [/\b(hit|hitting|kicked|kick\w*|bit|biting|threw|throw\w*)\b/i, "Hit or threw things"],
  [/\b(scream\w*|yell\w*|shout\w*)\b/i, "Screamed"],
  [/\b(cr(?:y|ied|ying)|sobb\w*|tears)\b/i, "Cried"],
  [/\b(refus\w*|wouldn't eat|won't eat|pushed (?:the |her |his )?plate|spat)\b/i, "Refused"],
  [/\b(ran away|ran off|bolted)\b/i, "Ran off"],
  [/\b(tantrum|meltdown|lay on the floor|lying on the floor)\b/i, "Had a meltdown"],
  [/\b(woke|waking|kept getting up|came out of (?:his|her|their) room)\b/i, "Kept waking or getting up"],
];
const OUTCOME_RULES: [RegExp, string][] = [
  [/\b(hug\w*|cuddl\w*)\b/i, "Calmed after a hug"],
  [/\b(calm\w*|settled|stopped)\b/i, "Calmed down"],
  [/\b(fell asleep|went to sleep|slept)\b/i, "Fell asleep"],
  [/\b(gave in|let (?:him|her|them) have|gave (?:him|her|them) the)\b/i, "I gave in"],
  [/\b(ate|tried|tasted|finished)\b/i, "Ate some"],
  [/\b(time[- ]?in|sat with)\b/i, "Time-in helped"],
  [/\b(warning|timer|two more)\b/i, "Warning helped"],
];

const firstMatch = (rules: [RegExp, string][], text: string) => rules.find(([re]) => re.test(text))?.[1] ?? null;

export function mockTags(text: string): Tags {
  return { trigger: firstMatch(TRIGGER_RULES, text), behavior: firstMatch(BEHAVIOR_RULES, text), outcome: firstMatch(OUTCOME_RULES, text) };
}

export async function tagMoment(userId: string, text: string, childLabel: string): Promise<Tags | null> {
  try {
    return await llm.json(
      { purpose: "moment_tag", userId },
      {
        system: TAG_SYSTEM,
        messages: [{ role: "user", content: `Child: ${childLabel}\nEntry: ${text}` }],
        maxTokens: 150,
        mock: () => JSON.stringify(mockTags(text)),
      },
      TagSchema,
    );
  } catch {
    return null; // caller saves the moment as tag_status=failed: the parent's words are never lost
  }
}

/* ------------------------------------------------------------------ */
/* Pattern insights                                                    */
/* ------------------------------------------------------------------ */

const PatternSchema = z.object({
  title: z.string().min(3).max(80),
  insight: z.string().min(10).max(400),
  suggestion: z.string().min(10).max(300),
  momentIds: z.array(z.string()).min(1).max(10),
});

const PATTERN_SYSTEM = `You help a parent notice patterns in short journal entries ("moments") about their young child.
Find ONE pattern that is supported by at least two of the moments: a shared trigger, time, or what helped.
Return JSON {"title": string, "insight": string, "suggestion": string, "momentIds": string[]}.
- title: 3-7 words, plain language, e.g. "Transitions are the tough part".
- insight: 1-2 sentences describing what the moments have in common. Refer to the child by nickname.
- suggestion: 1-2 sentences with one small thing to try next time, drawn from the suggestion ideas if provided.
- momentIds: the ids of the moments that support the pattern (only ids from the list).
Be tentative ("seems", "often"), never diagnose, never blame the parent.`;

const SUGGESTION_BY_TRIGGER: Record<string, string> = {
  "Leaving somewhere fun": 'Try a heads-up a few minutes before leaving: "Two more slides, then shoes."',
  "Screen time ending": "Give a warning before the screen goes off and offer an appealing next activity.",
  Tired: "Look at whether these moments land close to nap or bedtime. An earlier wind-down may help.",
  Hungry: "A small snack before known flashpoints (shops, pickups) can take the edge off.",
  Bedtime: "Keep the same short routine in the same order each night: bath, pajamas, book, bed.",
  Mealtime: "Serve one family meal with one familiar food on the plate, and keep pressure off.",
  "Getting dressed": 'Offer two choices you\'re fine with: "Red socks or striped socks?"',
  "Sibling conflict": "Name both children's feelings first, then set the limit on hurting.",
  "Being told no": "Name the feeling before holding the limit: \"You really wanted it. You're so disappointed.\"",
};

type MomentRow = typeof schema.moments.$inferSelect;

export function mockPattern(nickname: string, rows: MomentRow[]) {
  const counts = new Map<string, MomentRow[]>();
  for (const r of rows) if (r.trigger) counts.set(r.trigger, [...(counts.get(r.trigger) ?? []), r]);
  const [trigger, matching] = [...counts.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
  if (trigger && matching.length >= 2) {
    return {
      title: `${trigger} seems to be a tough spot`,
      insight: `${matching.length} of ${nickname}'s last ${rows.length} moments started with "${trigger.toLowerCase()}". Big reactions there are common at this age, and spotting the pattern is the first step.`,
      suggestion: SUGGESTION_BY_TRIGGER[trigger] ?? "Next time, try naming the feeling out loud before setting the limit.",
      momentIds: matching.map((m) => m.id),
    };
  }
  return {
    title: "Different triggers, similar feelings",
    insight: `${nickname}'s recent moments had different starting points, but each one involved a big feeling that needed help to settle.`,
    suggestion: 'Try naming the feeling first: "You\'re really frustrated. I\'m here." Then keep logging to see what repeats.',
    momentIds: rows.map((m) => m.id),
  };
}

/**
 * Generates one insight from the child's most recent moments. Returns null (no card) unless
 * at least 2 returned ids are real moments of this child: we never show an insight that
 * can't link back to evidence.
 */
export async function generatePattern(userId: string, childId: string): Promise<Pattern | null> {
  const [child] = await db
    .select()
    .from(schema.children)
    .where(and(eq(schema.children.id, childId), eq(schema.children.userId, userId)));
  if (!child) return null;
  const rows = await db
    .select()
    .from(schema.moments)
    .where(and(eq(schema.moments.childId, childId), inArray(schema.moments.tagStatus, ["ok", "failed"])))
    .orderBy(desc(schema.moments.createdAt))
    .limit(6);
  if (rows.length < MOMENTS_PER_PATTERN) return null;

  const listing = rows
    .map((r) => `id=${r.id}\ntext: ${r.text}\ntrigger: ${r.trigger ?? "?"}; behavior: ${r.behavior ?? "?"}; outcome: ${r.outcome ?? "?"}`)
    .join("\n\n");
  const ideas = Object.entries(SUGGESTION_BY_TRIGGER)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");

  let out: z.infer<typeof PatternSchema>;
  try {
    out = await llm.json(
      { purpose: "pattern", userId },
      {
        system: PATTERN_SYSTEM,
        messages: [
          {
            role: "user",
            content: `Child: ${child.nickname}, ${formatAge(ageInMonths(child.birthMonth, child.birthYear))}\n\nSuggestion ideas:\n${ideas}\n\nMoments:\n${listing}`,
          },
        ],
        maxTokens: 400,
        mock: () => JSON.stringify(mockPattern(child.nickname, rows)),
      },
      PatternSchema,
    );
  } catch {
    return null;
  }

  const valid = new Set(rows.map((r) => r.id));
  const ids = [...new Set(out.momentIds.filter((id) => valid.has(id)))];
  if (ids.length < 2) return null;

  const [p] = await db
    .insert(schema.patterns)
    .values({ userId, childId, title: out.title, insight: out.insight, suggestion: out.suggestion })
    .returning();
  await db.insert(schema.patternMoments).values(ids.map((momentId) => ({ patternId: p.id, momentId })));
  return toPattern(p, ids);
}

/** Auto-trigger: every MOMENTS_PER_PATTERN-th taggable moment for a child. */
export async function maybeGeneratePattern(userId: string, childId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.moments)
    .where(and(eq(schema.moments.childId, childId), inArray(schema.moments.tagStatus, ["ok", "failed"])));
  if (n === 0 || n % MOMENTS_PER_PATTERN !== 0) return null;
  return generatePattern(userId, childId);
}
