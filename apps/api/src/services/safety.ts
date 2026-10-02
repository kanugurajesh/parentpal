import type { SafetyCategory, SafetyNotice } from "@parentpal/shared";

/**
 * Rule-based red-flag detector. Runs BEFORE any LLM call on chat messages and moments.
 *
 * Why rules first: deterministic, testable, zero latency, and a miss here is worse than a
 * false alarm. The trade-off is recall: phrasing we didn't anticipate slips through, so the
 * LLM system prompt also forbids diagnosis/medication advice as a second layer.
 * Known gaps are listed in README "Limitations" and measured by `npm run eval`.
 */

type Rule = { category: SafetyCategory; re: RegExp };

const kid = String.raw`(?:him|her|them|(?:my|our|the|his|her|their) (?:son|daughter|child|children|kids?|baby|toddler|boy|girl|little one))`;

const RULES: Rule[] = [
  // ---- Medical emergency ----
  { category: "medical_emergency", re: /\b(?:not|isn'?t|stopped|can'?t|cannot|struggling to|trouble|hard to) breath(?:e|ing)\b/i },
  { category: "medical_emergency", re: /\b(?:turn(?:ed|ing)? blue|blue (?:lips|face))\b/i },
  { category: "medical_emergency", re: /\b(?:unconscious|unresponsive|won'?t wake (?:up)?|can'?t wake (?:him|her|them)|passed out|fainted|limp and)\b/i },
  { category: "medical_emergency", re: /\b(?:seizure|convuls\w*|having a fit)\b/i },
  { category: "medical_emergency", re: /\bchok(?:ed|ing)\b(?! hazard)/i },
  {
    category: "medical_emergency",
    re: /\b(?:swallow(?:ed)?|ate|drank|ingested)\b[^.?!]{0,30}\b(?:batter(?:y|ies)|magnets?|bleach|detergent|pod|pills?|tablets? of|medicine|medication|poison|chemicals?|cleaning)\b/i,
  },
  { category: "medical_emergency", re: /\b(?:overdose|poison(?:ed|ing))\b/i },
  {
    category: "medical_emergency",
    re: /\b(?:hit|bang(?:ed)?|bumped|fell (?:on|and hit))\b[^.?!]{0,40}\bhead\b[^.?!]{0,60}\b(?:vomit\w*|threw up|throwing up|unconscious|drowsy|confused|won'?t stop crying|bleeding)\b/i,
  },
  { category: "medical_emergency", re: /\b(?:bleeding (?:heavily|a lot|won'?t stop|that won'?t stop)|won'?t stop bleeding)\b/i },
  { category: "medical_emergency", re: /\b(?:anaphyla\w*|severe allergic|(?:face|lips?|tongue|throat) (?:is |are )?swell\w*|swelling (?:of|in) (?:the |her |his |their )?(?:face|lips|tongue|throat))\b/i },
  { category: "medical_emergency", re: /\bfever\b[^.?!]{0,60}\b(?:stiff neck|rash that doesn'?t fade|seizure|floppy|under 3 months|newborn)\b/i },
  { category: "medical_emergency", re: /\b(?:newborn|\d+[- ]week[- ]old)\b[^.?!]{0,40}\bfever\b/i },
  { category: "medical_emergency", re: /\b(?:drown\w*|fell (?:out of|from) (?:a |the )?(?:window|balcony))\b/i },

  // ---- Abuse / risk of harm from an adult ----
  { category: "abuse", re: /\babus(?:e|ed|ing|ive)\b/i },
  { category: "abuse", re: /\bdomestic violence\b/i },
  { category: "abuse", re: new RegExp(String.raw`\btouch(?:ed|es|ing)?\s+${kid}\s+(?:inappropriately|in (?:his|her|their) private)`, "i") },
  { category: "abuse", re: /\b(?:private parts|sexual(?:ly)?)\b/i },
  { category: "abuse", re: new RegExp(String.raw`\b(?:beats?|beating|beat up|punch(?:es|ed)?|chok(?:es|ed) )\s*${kid}`, "i") },
  {
    category: "abuse",
    re: new RegExp(String.raw`\b(?:slap(?:s|ped|ping)?|smack(?:s|ed|ing)?|whip(?:s|ped)?|burn(?:s|ed|t))\s+${kid}`, "i"),
  },
  // Injuries that an adult left on a child.
  { category: "abuse", re: /\b(?:leaves?|left|leaving|gave|giving|causing|caused) (?:\w+ ){0,2}(?:bruises|bruising|marks|welts|burns)\b/i },
  { category: "abuse", re: new RegExp(String.raw`\bhit(?:s|ting)?\s+${kid}\s+with\s+(?:a |the )?(?:belt|stick|hanger|shoe|object|wooden spoon)`, "i") },
  {
    category: "abuse",
    re: /\b(?:afraid|scared|worried) (?:that )?I(?:'ll| will| might| am going to|'m going to) (?:hurt|shake|hit|harm) (?:him|her|them|my|the)\b/i,
  },
  { category: "abuse", re: /\bshak(?:e|ing|en|ed) (?:the|my) (?:baby|newborn|infant)\b/i },
  {
    category: "abuse",
    re: /\b(?:afraid|scared|terrified) of (?:my |her |his |their )?(?:partner|husband|wife|boyfriend|girlfriend|ex)\b/i,
  },

  // ---- Self-harm (parent or child) ----
  { category: "self_harm", re: /\b(?:suicid\w*|self[- ]?harm\w*)\b/i },
  { category: "self_harm", re: /\bkill(?:ing)? (?:myself|himself|herself|themselves)\b/i },
  { category: "self_harm", re: /\b(?:hurt(?:s|ing)?|cut(?:s|ting)?|harm(?:s|ing)?) (?:myself|himself|herself|themselves)\b/i },
  { category: "self_harm", re: /\b(?:want(?:s)? to die|wish(?:es)? (?:I|he|she|they) (?:was|were) dead|don'?t want to (?:live|be alive|be here anymore))\b/i },
  { category: "self_harm", re: /\b(?:end it all|better off without me|can'?t go on)\b/i },

  // ---- Possible developmental concern ----
  { category: "developmental_concern", re: /\b(?:isn'?t|is not|not|doesn'?t|does not|hasn'?t|has not|never)\s+(?:yet\s+)?(?:talking|speaking|walking|babbling|crawling|pointing|talk|speak|walk|babble|crawl|point|said (?:a|any) words?)\b(?! to me)(?! with me)/i },
  { category: "developmental_concern", re: /\b(?:no words|any words yet|lost (?:his|her|their)? ?(?:words|speech|skills)|stopped (?:talking|speaking|walking)|regress\w*)\b/i },
  { category: "developmental_concern", re: /\b(?:doesn'?t|does not|won'?t|never|isn'?t) (?:respond(?:ing)? to (?:his|her|their) name|make (?:eye contact)|making eye contact|smil(?:e|ing))\b/i },
  { category: "developmental_concern", re: /\b(?:autis\w*|adhd|speech delay|developmental(?:ly)? delay\w*|delayed (?:speech|walking|development)|missing milestones|not meeting milestones|behind on milestones)\b/i },
];

const EMERGENCY = "your local emergency number (911 in the US, 999 in the UK, 112 in the EU)";

export const SAFETY_COPY: Record<SafetyCategory, Omit<SafetyNotice, "category">> = {
  medical_emergency: {
    title: "This sounds like it could be urgent",
    body: `If your child is having trouble breathing, is unresponsive, has swallowed something harmful, or you think it might be an emergency, call ${EMERGENCY} now. ParentPal can't assess medical situations. When in doubt, contact a medical professional straight away.`,
    actions: [
      { label: "Call 911 (US)", href: "tel:911" },
      { label: "Call 999 (UK)", href: "tel:999" },
      { label: "US Poison Control 1-800-222-1222", href: "tel:18002221222" },
    ],
  },
  abuse: {
    title: "You and your child deserve to be safe",
    body: `If a child is in immediate danger, call ${EMERGENCY}. If you're worried a child is being hurt, or worried you might hurt your child, trained people can help confidentially and without judgement. Reaching out is a strong, protective step.`,
    actions: [
      { label: "Childhelp (US) 1-800-422-4453", href: "tel:18004224453" },
      { label: "NSPCC (UK) 0808 800 5000", href: "tel:08088005000" },
    ],
  },
  self_harm: {
    title: "Please reach out for support now",
    body: `If you or your child might be in danger, call ${EMERGENCY}. If you're having thoughts of harming yourself, you can talk to someone right now. If your child is hurting themselves, please speak to your pediatrician or GP as soon as you can.`,
    actions: [
      { label: "Call or text 988 (US)", href: "tel:988" },
      { label: "Samaritans (UK) 116 123", href: "tel:116123" },
    ],
  },
  developmental_concern: {
    title: "Worth checking with your pediatrician",
    body: "Every child develops at their own pace, but you know your child best, and you don't need to wait to ask. ParentPal can't assess development or give a diagnosis. Your pediatrician, GP or health visitor can check milestones and, if needed, connect you with early support.",
    actions: [{ label: "CDC: Learn the Signs. Act Early.", href: "https://www.cdc.gov/act-early/index.html" }],
  },
};

export function detectRedFlag(text: string): SafetyCategory | null {
  // Priority order: emergencies first, then harm, then development.
  const order: SafetyCategory[] = ["medical_emergency", "self_harm", "abuse", "developmental_concern"];
  const hits = new Set(RULES.filter((r) => r.re.test(text)).map((r) => r.category));
  return order.find((c) => hits.has(c)) ?? null;
}

export function safetyNotice(category: SafetyCategory): SafetyNotice {
  return { category, ...SAFETY_COPY[category] };
}

export function checkSafety(text: string): SafetyNotice | null {
  const c = detectRedFlag(text);
  return c ? safetyNotice(c) : null;
}
