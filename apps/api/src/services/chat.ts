import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import {
  formatAge,
  type ChatMessage,
  type ChatStreamEvent,
  type Citation,
  type SafetyNotice,
  type Topic,
} from "@parentpal/shared";
import { db, schema } from "../db/client";
import { llm } from "../llm";
import { iso } from "../lib/serialize";
import { describeFamily, loadFamilyContext, type FamilyContext } from "./context";
import { retrieve, toCitation, type RetrievedChunk } from "./retrieval";
import { checkSafety } from "./safety";

/** Below this ts_rank_cd score (0..1) retrieval is treated as "not confident". */
export const CONFIDENT_SCORE = 0.5;
const VAGUE_MAX_WORDS = 8;
/** A chunk below this is not shown to the model or cited: off-topic questions get an honest "not covered". */
export const MIN_CITABLE_SCORE = 0.4;

/* ------------------------------------------------------------------ */
/* Conversation storage                                                */
/* ------------------------------------------------------------------ */

export async function getOrCreateConversation(userId: string) {
  const [c] = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, userId))
    .orderBy(desc(schema.conversations.createdAt))
    .limit(1);
  if (c) return c;
  const [created] = await db.insert(schema.conversations).values({ userId }).returning();
  return created;
}

/**
 * Starts a fresh conversation. Earlier messages are deleted, except bookmarked ones (deleting
 * those would silently empty the user's bookmarks); old conversations left empty are removed.
 */
export async function clearChat(userId: string) {
  await db.transaction(async (tx) => {
    const convIds = tx.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.userId, userId));
    const bookmarked = tx.select({ id: schema.bookmarks.messageId }).from(schema.bookmarks).where(eq(schema.bookmarks.userId, userId));
    await tx.delete(schema.messages).where(and(inArray(schema.messages.conversationId, convIds), notInArray(schema.messages.id, bookmarked)));
    const stillUsed = tx.selectDistinct({ id: schema.messages.conversationId }).from(schema.messages);
    await tx.delete(schema.conversations).where(and(eq(schema.conversations.userId, userId), notInArray(schema.conversations.id, stillUsed)));
    await tx.insert(schema.conversations).values({ userId });
  });
}

type MessageRow = typeof schema.messages.$inferSelect;

export async function toChatMessages(userId: string, rows: MessageRow[]): Promise<ChatMessage[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ratings = await db
    .select()
    .from(schema.messageFeedback)
    .where(and(eq(schema.messageFeedback.userId, userId), inArray(schema.messageFeedback.messageId, ids)));
  const marks = await db
    .select()
    .from(schema.bookmarks)
    .where(and(eq(schema.bookmarks.userId, userId), inArray(schema.bookmarks.messageId, ids)));
  const ratingBy = new Map(ratings.map((r) => [r.messageId, r.rating]));
  const marked = new Set(marks.map((m) => m.messageId));
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    kind: r.kind,
    content: r.content,
    citations: (r.citations as Citation[]) ?? [],
    clarifyOptions: (r.clarifyOptions as string[]) ?? [],
    safety: (r.safety as SafetyNotice | null) ?? null,
    rating: ratingBy.get(r.id) ?? null,
    bookmarked: marked.has(r.id),
    createdAt: iso(r.createdAt),
  }));
}

export async function listMessages(userId: string) {
  const conv = await getOrCreateConversation(userId);
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(asc(schema.messages.createdAt));
  return toChatMessages(userId, rows);
}

async function insertMessage(values: typeof schema.messages.$inferInsert) {
  const [row] = await db.insert(schema.messages).values(values).returning();
  return row;
}

/* ------------------------------------------------------------------ */
/* Prompts                                                             */
/* ------------------------------------------------------------------ */

const ANSWER_SYSTEM = `You are ParentPal, a warm, practical parenting companion for parents of young children.

Rules:
- Base specific advice ONLY on the numbered guide excerpts provided. Cite each excerpt you use with its number in square brackets, e.g. [1]. Never invent citation numbers.
- If the excerpts don't cover the question, say so briefly, give only general, low-risk encouragement, and suggest asking their pediatrician or health visitor. Do not fill gaps with made-up facts or statistics.
- Never diagnose, never name conditions the child "might have", never give medication or dosage advice.
- Use the child's nickname and age naturally. Refer to their logged moments only if relevant.
- Be concise: at most about 150 words. Lead with one concrete thing to try, include a short script the parent can say, and what to expect.
- Plain, kind, non-judgemental language. No headings. Short paragraphs or a 2–3 item list at most.`;

function excerpts(chunks: RetrievedChunk[]) {
  return chunks.map((c, i) => `[${i + 1}] (${c.goalTitle}: ${c.heading})\n${c.body}`).join("\n\n");
}

function primaryChild(ctx: FamilyContext) {
  return ctx.children[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Deterministic mock outputs (used when no API key / in tests)        */
/* ------------------------------------------------------------------ */

function mockAnswer(ctx: FamilyContext, chunks: RetrievedChunk[]) {
  const child = primaryChild(ctx);
  const who = child ? `${child.nickname} (${formatAge(child.ageMonths)})` : "your child";
  const top = chunks[0];
  if (!top) {
    return `I don't have a guide on that yet, so I don't want to guess. For anything about health or development, your pediatrician or health visitor is the best person to ask. You can also try rephrasing with what's happening, when it happens, and what you've tried.`;
  }
  const parts = top.body.split("\n");
  const action = parts[0];
  const say = parts.find((p) => p.startsWith("Say:"))?.replace(/^Say:\s*/, "");
  const expect = parts.find((p) => p.startsWith("What to expect:"))?.replace(/^What to expect:\s*/, "");
  let out = `Here's something to try with ${who}, from "${top.heading}": ${action} [1]`;
  if (say) out += `\n\nYou could say: ${say} [1]`;
  if (expect) out += `\n\nWhat to expect: ${expect.split(". ").slice(0, 2).join(". ").replace(/\.?$/, ".")} [1]`;
  const second = chunks.find((c) => c.id !== top.id && c.winId);
  if (second) out += `\n\nIf that doesn't fit, "${second.heading}" is another option [${chunks.indexOf(second) + 1}].`;
  return out;
}

const CLARIFY_OPTIONS_BY_GOAL: Record<string, string> = {
  tantrums: "Tantrums and big feelings",
  sleep: "Bedtime and sleep",
  "picky-eating": "Mealtimes and picky eating",
};

function clarifyOptionsFor(ctx: FamilyContext): string[] {
  const preferred = ctx.goals.map((g) => CLARIFY_OPTIONS_BY_GOAL[g.slug]).filter(Boolean);
  return [...new Set([...preferred, ...Object.values(CLARIFY_OPTIONS_BY_GOAL)])].slice(0, 3);
}

const ClarifySchema = z.object({
  question: z.string().min(5).max(200),
  options: z.array(z.string().min(2).max(60)).min(2).max(3),
});

/* ------------------------------------------------------------------ */
/* Starters & topics                                                   */
/* ------------------------------------------------------------------ */

export const TOPICS: Topic[] = [
  {
    goalSlug: "tantrums",
    title: "Handling tantrums",
    questions: [
      "How do I handle a tantrum when we have to leave the park?",
      "What should I say when my toddler hits me?",
      "How can I stop power struggles about getting dressed?",
    ],
  },
  {
    goalSlug: "sleep",
    title: "Fixing sleep issues",
    questions: [
      "What's a good bedtime routine for a toddler?",
      "How much sleep does a 3 year old need?",
      "Is it okay to use the tablet before bed?",
    ],
  },
  {
    goalSlug: "picky-eating",
    title: "Tackling picky eating",
    questions: [
      "My child refuses vegetables. What can I do?",
      "Should I make a separate meal for my picky eater?",
      "Is it okay to use dessert as a reward for eating?",
    ],
  },
];

export function startersFor(goalSlugs: string[], childName?: string): string[] {
  const ordered = [...TOPICS].sort((a, b) => Number(goalSlugs.includes(b.goalSlug)) - Number(goalSlugs.includes(a.goalSlug)));
  const qs = ordered.flatMap((t) => t.questions.slice(0, 2)).slice(0, 4);
  if (childName) qs[0] = qs[0].replace(/my (toddler|child)/, childName);
  return qs;
}

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

export interface PipelineResult {
  kind: "answer" | "clarify" | "safety";
  retrieved: RetrievedChunk[];
  citations: Citation[];
}

/** Validates [n] markers against what was actually retrieved; anything else is dropped. */
export function extractCitations(text: string, chunks: RetrievedChunk[]): Citation[] {
  const used = new Set<number>();
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= chunks.length) used.add(n);
  }
  return [...used].sort((a, b) => a - b).map((n) => toCitation(chunks[n - 1]));
}

/** Removes citation markers that don't point at a retrieved chunk, so the UI never shows a dangling [7]. */
export function stripInvalidMarkers(text: string, n: number) {
  return text.replace(/\s?\[(\d+)\]/g, (whole, d) => (Number(d) >= 1 && Number(d) <= n ? whole : ""));
}

export async function* runChat(
  userId: string,
  input: { text: string; clarifies?: string },
): AsyncGenerator<ChatStreamEvent> {
  const conv = await getOrCreateConversation(userId);
  const userRow = await insertMessage({ conversationId: conv.id, role: "user", kind: "answer", content: input.text });
  const [userMsg] = await toChatMessages(userId, [userRow]);
  yield { type: "user", message: userMsg };

  const finish = async (values: Omit<typeof schema.messages.$inferInsert, "conversationId" | "role">) => {
    const row = await insertMessage({ conversationId: conv.id, role: "assistant", ...values });
    const [msg] = await toChatMessages(userId, [row]);
    return { type: "done" as const, message: msg };
  };

  // 1) Safety gate: no LLM call at all on a red flag.
  const safety = checkSafety(input.text);
  if (safety) {
    await db.insert(schema.safetyEvents).values({ userId, surface: "chat", category: safety.category });
    yield { type: "meta", kind: "safety", citations: [], clarifyOptions: [], safety };
    const text = `${safety.title}. ${safety.body}`;
    yield { type: "delta", text };
    yield await finish({ kind: "safety", content: text, safety });
    return;
  }

  // 2) If this is an answer to a clarifying question, retrieve on original question + chosen option.
  let query = input.text;
  let originalQuestion: string | null = null;
  if (input.clarifies) {
    const [clar] = await db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.id, input.clarifies), eq(schema.messages.conversationId, conv.id)));
    if (clar) {
      const [prevUser] = await db
        .select()
        .from(schema.messages)
        .where(and(eq(schema.messages.conversationId, conv.id), eq(schema.messages.role, "user")))
        .orderBy(desc(schema.messages.createdAt))
        .limit(2)
        .then((rows) => rows.slice(1));
      originalQuestion = prevUser?.content ?? null;
      query = `${originalQuestion ?? ""} ${input.text}`.trim();
    }
  }

  const ctx = await loadFamilyContext(userId);
  const chunks = await retrieve(query, { boostGoals: ctx.goals.map((g) => g.slug), limit: 3 });
  const topScore = chunks[0]?.score ?? 0;
  const wordCount = input.text.split(/\s+/).filter(Boolean).length;

  // 3) Vague → one clarifying question with tap options (never twice in a row).
  if (!input.clarifies && wordCount <= VAGUE_MAX_WORDS && topScore < CONFIDENT_SCORE) {
    const fallbackOptions = clarifyOptionsFor(ctx);
    const child = primaryChild(ctx)?.nickname ?? "your little one";
    let clar: z.infer<typeof ClarifySchema>;
    try {
      clar = await llm.json(
        { purpose: "chat_clarify", userId },
        {
          system:
            'The parent\'s question is too vague to answer well. Ask ONE short, friendly clarifying question and offer 2-3 short tap-to-answer options (max 6 words each). Prefer options from this list when they fit: ' +
            JSON.stringify(fallbackOptions) +
            '. Reply as JSON: {"question": string, "options": string[]}',
          messages: [{ role: "user", content: `${describeFamily(ctx)}\n\nParent asked: "${input.text}"` }],
          maxTokens: 200,
          mock: () => JSON.stringify({ question: `Happy to help. What's going on with ${child} right now?`, options: fallbackOptions }),
        },
        ClarifySchema,
      );
    } catch {
      clar = { question: `Happy to help. What's going on with ${child} right now?`, options: fallbackOptions };
    }
    yield { type: "meta", kind: "clarify", citations: [], clarifyOptions: clar.options, safety: null };
    yield { type: "delta", text: clar.question };
    yield await finish({ kind: "clarify", content: clar.question, clarifyOptions: clar.options });
    return;
  }

  // 4) Grounded, streamed answer.
  const usable = chunks.filter((c) => c.score >= MIN_CITABLE_SCORE);
  yield { type: "meta", kind: "answer", citations: usable.map(toCitation), clarifyOptions: [], safety: null };

  const history = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conv.id))
    .orderBy(desc(schema.messages.createdAt))
    .limit(7);
  const prior = history
    .reverse()
    .filter((m) => m.id !== userRow.id && m.kind === "answer")
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));

  const question = originalQuestion ? `${originalQuestion}\n(They clarified: ${input.text})` : input.text;
  const userPrompt = `${describeFamily(ctx)}\n\nGuide excerpts:\n${usable.length ? excerpts(usable) : "(none matched)"}\n\nParent's question: ${question}`;

  let text = "";
  try {
    for await (const d of llm.stream(
      { purpose: "chat_answer", userId },
      {
        system: ANSWER_SYSTEM,
        messages: [...prior, { role: "user", content: userPrompt }],
        maxTokens: 450,
        mock: () => mockAnswer(ctx, usable),
      },
    )) {
      text += d;
      yield { type: "delta", text: d };
    }
  } catch (err) {
    yield { type: "error", message: "The assistant couldn't finish that answer. Try sending it again." };
    if (!text) return;
  }

  const clean = stripInvalidMarkers(text, usable.length).trim();
  // Output check: if the model's own reply trips a red flag rule, show it but attach the safety notice.
  const outSafety = checkSafety(clean);
  yield await finish({
    kind: "answer",
    content: clean,
    citations: extractCitations(clean, usable),
    safety: outSafety && outSafety.category === "medical_emergency" ? outSafety : null,
  });
}
