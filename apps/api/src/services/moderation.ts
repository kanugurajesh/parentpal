import { z } from "zod";
import type { SafetyNotice } from "@parentpal/shared";
import { db, schema } from "../db/client";
import { HttpError } from "../lib/errors";
import { llm } from "../llm";
import { checkSafety } from "./safety";

/**
 * Moderation for Circles. Every post and reply passes through here before anyone else sees it.
 *
 * Order matters:
 *  1. Personal info (rules): rejected with a message so the author can fix it. Circles are anonymous.
 *  2. The author's own children's nicknames are replaced, so a post can't identify a family.
 *  3. Safety red flags (the same rules as chat): crises are not published; the author gets support.
 *  4. Medication/dosage (rules) and an LLM review for harassment, spam, diagnosis, off-topic.
 *
 * Fail-closed: if the LLM is unavailable, the item waits for review instead of going live.
 */

export type ModSurface = "post" | "reply";

export interface ModerationResult {
  status: "live" | "review" | "safety";
  /** The text to store (nicknames replaced). */
  text: string;
  reasons: string[];
  /** Crisis notice for the author; the item is not published. */
  safety: SafetyNotice | null;
  /** Support notice pinned above a published post (developmental concern). */
  pinned: SafetyNotice | null;
}

/* ------------------------------------------------------------------ */
/* Personal info                                                       */
/* ------------------------------------------------------------------ */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
const PII_RULES: [RegExp, string][] = [
  [/(?:\+?\d[\s-]?){9,}/, "phone numbers"],
  [/\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(?:com|in|net|org|io|co|me|ly|app|link)\b/i, "links"],
  [/(?:^|\s)@[A-Za-z0-9_.]{3,}/, "social handles"],
];

/** What kinds of personal info the text contains (empty when clean). */
export function findPII(text: string): string[] {
  // Emails first, then look for the rest without them (an email's domain isn't also a "link").
  const found = new RegExp(EMAIL.source).test(text) ? ["email addresses"] : [];
  const rest = text.replace(EMAIL, " ");
  return [...found, ...PII_RULES.filter(([re]) => re.test(rest)).map(([, what]) => what)];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces the author's own children's nicknames with "my child". */
export function scrubNicknames(text: string, nicknames: string[]) {
  return nicknames
    .filter((n) => n.trim().length >= 2)
    .reduce(
      (t, n) =>
        t.replace(new RegExp(String.raw`\b${escapeRe(n.trim())}\b('s)?`, "gi"), (_m, poss: string | undefined, at: number, all: string) => {
          const phrase = poss ? "my child's" : "my child";
          // Capitalise at the start of a sentence: "Mo screamed" becomes "My child screamed".
          return /(^|[.!?]\s+)$/.test(all.slice(0, at)) ? phrase[0].toUpperCase() + phrase.slice(1) : phrase;
        }),
      text,
    );
}

/* ------------------------------------------------------------------ */
/* Content rules + LLM review                                          */
/* ------------------------------------------------------------------ */

const ModReason = z.enum(["medical_advice", "diagnosis", "harassment", "spam", "pii", "off_topic"]);
const VerdictSchema = z.object({
  verdict: z.enum(["allow", "review", "block"]),
  reasons: z.array(ModReason).max(6),
});
type Verdict = z.infer<typeof VerdictSchema>;

/** Always applied, whatever the LLM says: a parent forum must not hand out doses. */
const MEDICATION =
  /\b(?:\d+(?:\.\d+)?\s?(?:mg|ml|mcg|drops?)\b|dos(?:e|age|ing)\b|melatonin|benadryl|antihistamines?|ibuprofen|paracetamol|acetaminophen|calpol|tylenol|motrin|sleeping pills?|gripe water|antibiotics?|cough syrup)/i;
const DIAGNOSIS =
  /\b(?:sounds like|probably has|definitely has|might have|must have|could have|is clearly|obviously has)\b[^.?!]{0,30}\b(?:autis\w*|adhd|asd|add|delay\w*|disorder|spd|odd|disabilit\w*|on the spectrum)\b/i;
/** Second person only: parents are often hard on themselves ("I felt like a bad mom"), and that's welcome. */
const HARASSMENT =
  /\b(?:shut up|you(?:'re| are)? (?:so |such an? |an? )?(?:stupid|idiot|moron|pathetic|disgusting|lazy|selfish)|you(?:'re| are) an? (?:lazy|bad|terrible|awful|useless|horrible) (?:mom|mum|mother|dad|father|parent))\b/i;
const SPAM = /\b(?:buy now|discount|promo code|use (?:my )?code|dm me|message me|whatsapp me|follow me|join my|earn money|click here|limited offer)\b/i;

/** Deterministic stand-in for the LLM (mock mode and tests). */
export function mockVerdict(text: string): Verdict {
  if (HARASSMENT.test(text)) return { verdict: "block", reasons: ["harassment"] };
  if (SPAM.test(text)) return { verdict: "block", reasons: ["spam"] };
  if (DIAGNOSIS.test(text)) return { verdict: "review", reasons: ["diagnosis"] };
  return { verdict: "allow", reasons: [] };
}

const MOD_SYSTEM = `You moderate "Circles", an anonymous peer-support community for parents of young children.
Decide whether a {surface} can be published. Reply as JSON: {"verdict": "allow" | "review" | "block", "reasons": string[]}.
reasons use only: "medical_advice", "diagnosis", "harassment", "spam", "pii", "off_topic".

block:
- harassment: insulting, shaming or mocking another parent or child.
- spam: advertising, selling, self-promotion, asking people to contact them off the app.
review (a human moderator checks it before it is shown):
- medical_advice: recommends a specific medicine, supplement or dose.
- diagnosis: tells another parent their child has, or might have, a condition.
- pii: details that could identify a real person (full names, schools, addresses).
- off_topic: not about parenting or family life.
allow: everything else. Venting, frustration, self-criticism ("I felt like a bad mom"), sharing what worked,
asking questions, a parent mentioning their OWN child's diagnosis, and suggesting someone see a doctor are all fine.
If unsure between allow and review, choose review. Use "reasons": [] for allow.`;

const BLOCK_MESSAGES: Record<string, string> = {
  harassment: "Circles are kind spaces. Please rephrase this without criticising other parents.",
  spam: "Circles don't allow promotions or requests to contact people outside ParentPal.",
};

async function llmVerdict(userId: string, text: string, surface: ModSurface): Promise<Verdict | null> {
  try {
    return await llm.json(
      { purpose: "community_moderation", userId },
      {
        system: MOD_SYSTEM.replace("{surface}", surface === "post" ? "post" : "reply to another parent's post"),
        messages: [{ role: "user", content: text }],
        maxTokens: 120,
        mock: () => JSON.stringify(mockVerdict(text)),
      },
      VerdictSchema,
    );
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Pipeline                                                            */
/* ------------------------------------------------------------------ */

/** Crises are never published. A developmental concern is published with support pinned (posts only). */
const URGENT = new Set(["medical_emergency", "self_harm", "abuse"]);

export async function moderate(
  userId: string,
  raw: string,
  opts: { surface: ModSurface; childNicknames: string[] },
): Promise<ModerationResult> {
  const pii = findPII(raw);
  if (pii.length) {
    throw new HttpError(422, `Circles are anonymous. Please remove ${pii.join(" and ")} before posting.`);
  }
  const text = scrubNicknames(raw, opts.childNicknames);

  const safety = checkSafety(text);
  if (safety && URGENT.has(safety.category)) {
    await db.insert(schema.safetyEvents).values({ userId, surface: "community", category: safety.category });
    return { status: "safety", text, reasons: [safety.category], safety, pinned: null };
  }
  const pinned = safety && opts.surface === "post" ? safety : null;

  const reasons = new Set<string>();
  if (MEDICATION.test(text)) reasons.add("medical_advice");

  const verdict = await llmVerdict(userId, text, opts.surface);
  if (!verdict) {
    reasons.add("unchecked");
    return { status: "review", text, reasons: [...reasons], safety: null, pinned };
  }
  if (verdict.verdict === "block") {
    const why = verdict.reasons.find((r) => BLOCK_MESSAGES[r]);
    throw new HttpError(422, why ? BLOCK_MESSAGES[why] : "This doesn't fit the Circles guidelines. Please rephrase it.");
  }
  for (const r of verdict.reasons) reasons.add(r);
  if (verdict.verdict === "review" && !reasons.size) reasons.add("flagged");

  const status = reasons.size ? "review" : "live";
  return { status, text, reasons: [...reasons], safety: null, pinned };
}
