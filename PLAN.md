# ParentPal: MVP Plan

> Status: **draft, waiting for approval**. Nothing has been coded yet.

ParentPal is an AI parenting companion. A parent logs short "moments" about their child, picks a few goals, gets small scripted "wins" to try, and can ask questions in a chat that is grounded in curated content and in what they've logged. This is a portfolio MVP. The aim is one working end-to-end slice with honest documentation. Breadth is not the goal.

---

## 1. Scope

### In scope (the end-to-end slice)
| Area | What ships |
|---|---|
| Onboarding | Guest-first flow: welcome → child (nickname, girl/boy, DOB picker, optional 2nd child) → 3 intro slides → pick 1–2 goals → parent role + first name → "plan ready" → fake paywall (weekly / semi-annual / annual, annual preselected, close → free tier) |
| Home | "Start <child>'s Story" card, filter chips (All Goals / Focus / Sleep / Emotion), Personalized Goals + Find your parenting goal, goal detail with 4–5 wins (win 1 free, rest locked unless fake-subscribed), fictional advisors strip |
| Story | Empty state + "What's a pattern?" explainer, add moment (text), LLM tagging (trigger / behavior / outcome), pattern insight after ≥3 moments that links back to its source moments, See all Moments |
| Ask | SSE streaming chat, starter questions, View Topics, context = child age + active goals + recent moments, retrieval over seeded content with visible citations, one clarifying question with 2–3 tap options for vague input, 👍/👎, copy, share, bookmarks |
| Notifications | Daily personalized tip from a scheduled job, plus a "No new notifications" empty state |
| Profile | Family profile, Settings → Delete Account (hard delete), Bookmarks, Manage Subscription (stub), Sign In / create account, Refer friends (stub), Help & Support (`mailto:`), Start New Profile |
| Safety | Red-flag detection on every chat message and moment. A hit skips normal advice and returns a fixed safety message. Every AI surface carries "AI-generated, not medical advice." |
| Engineering | Typed and validated API, migrations, seed, env config, one-command local run, API tests, eval script (~25 cases), per-call LLM logging (latency / tokens / cost) and a cost summary endpoint |
| Docs | README (setup, architecture diagram, limitations), DECISIONS.md, AI_MISTAKES.md, DEMO_SCRIPT.md |

### Deliberately cut (and why)
| Cut | Why |
|---|---|
| Real payments (RevenueCat/StoreKit) | Needs store accounts and adds nothing to show. The paywall writes a fake `subscriptions` row that really does unlock wins. |
| Social sign-in, email verification, password reset | Email + password upgrade of the guest account is enough to show the auth model |
| Voice input | Stretch goal. Only if Phases 1–6 finish clean. |
| Push notifications | In-app list only. Push needs a device build and Expo push credentials. |
| Real referral program | Stub screen with a share sheet |
| Full content for all 7 goals | **3 goals fully seeded** (tantrums, sleep, picky eating). The other 4 appear as cards marked "Coming soon". |
| Vector DB / embeddings | Postgres full-text search is enough for a ~20-chunk corpus, deterministic for evals, and needs no extra key. pgvector is the documented upgrade path. |
| Multi-conversation history UI | One running conversation per user. Older messages load on open. |
| Content CMS / admin UI | Content is markdown in the repo. Edit and re-seed. |
| Native store builds, i18n, analytics, offline mode | Out of scope for a demo. Runs in Expo Go and Expo Web. |

---

## 2. Architecture

```
┌──────────────────────────┐        HTTPS/JSON + SSE         ┌──────────────────────────────┐
│ apps/mobile (Expo, TS)   │ ──────────────────────────────▶ │ apps/api (Fastify, TS)       │
│ expo-router, bottom tabs │   Bearer JWT (guest or user)    │  zod-validated routes        │
│ react-query, expo/fetch  │ ◀────────────────────────────── │  services: retrieval, safety │
└──────────────────────────┘     text/event-stream (chat)    │  llm/ (provider-agnostic)    │
                                                             │  jobs/ daily-tip (node-cron) │
          packages/shared (zod schemas + types) ◀────────────┤  Drizzle ORM + migrations    │
                                                             └──────────────┬───────────────┘
                                                                            │
                          content/goals/*.md ──seed──▶  Postgres 16 (docker compose)
                                                         FTS (tsvector) for retrieval
```

- **Monorepo** with npm workspaces: `apps/api`, `apps/mobile`, `packages/shared`, `content/`, `evals/`.
- **Shared zod schemas** are used for request/response validation on the server and as typed client contracts on mobile.
- **LLM wrapper** (`apps/api/src/llm/`) exposes `complete()`, `stream()` and `json<T>(schema)`. Adapters:
  - `openai`: default when `OPENAI_API_KEY` is set (model via `OPENAI_MODEL`; also works with any OpenAI-compatible base URL)
  - `mock`: deterministic, template-based. Used for tests and CI, and lets the app run with no API key. The mock is labelled as such in the UI.
  
  Every call goes through one `logLlmCall()` that records provider, model, purpose, tokens, latency, cost and success.
- **Streaming**: Fastify writes SSE events (`meta` → `delta`* → `done`). Mobile reads them with `expo/fetch` (streaming body support). A non-streaming fallback is available if a platform misbehaves.
- **One command**: `npm run dev` brings up Postgres in Docker, migrates, seeds, and starts the API and Expo together.

---

## 3. Data model (Postgres, Drizzle migrations)

Child data is kept minimal on purpose. The DOB picker is shown, but **only birth month and year are stored**.

| Table | Columns (abridged) | Notes |
|---|---|---|
| `users` | id uuid, is_guest bool, email (unique, null), password_hash (null), parent_role (`mother`/`father`, null), first_name, created_at | Guest = row with no email. Register upgrades the same row. |
| `children` | id, user_id FK→users **ON DELETE CASCADE**, nickname, sex (`girl`/`boy`), birth_month, birth_year, created_at | No full DOB, no photos |
| `goals` | slug PK, title, subtitle, category (`focus`/`sleep`/`emotion`/`habits`), illustration_key, has_content bool, sort | Loaded from `content/` |
| `wins` | id, goal_slug FK, position, title, action, script, what_to_expect, source_ids text[] | position 1 = free |
| `sources` | id, title, publisher, url, accessed_on | Citations shown in UI and in Ask |
| `content_chunks` | id, goal_slug, win_id (null), heading, body, tsv tsvector (GIN index) | Retrieval unit |
| `user_goals` | user_id, goal_slug, PK(user_id, goal_slug) | Max 2, enforced in API |
| `subscriptions` | user_id PK, plan (`weekly`/`semiannual`/`annual`), status (`active_fake`/`canceled`), started_at | No row = free tier |
| `moments` | id, user_id, child_id, text, trigger, behavior, outcome, tag_status (`ok`/`failed`/`safety`), created_at | Tags filled by LLM. Raw text kept so the user can see it. |
| `patterns` | id, user_id, child_id, title, insight, suggestion, created_at | |
| `pattern_moments` | pattern_id, moment_id | Links an insight back to its evidence |
| `conversations` | id, user_id, created_at | |
| `messages` | id, conversation_id, role, kind (`answer`/`clarify`/`safety`), content, citations jsonb, clarify_options jsonb, created_at | |
| `message_feedback` | message_id, user_id, rating (+1/−1), created_at, unique(message_id, user_id) | |
| `bookmarks` | user_id, message_id, created_at | |
| `notifications` | id, user_id, title, body, for_date, read_at, unique(user_id, for_date) | Unique key makes the daily job idempotent |
| `llm_calls` | id, user_id (null), purpose, provider, model, input_tokens, output_tokens, latency_ms, cost_usd numeric, ok, error, created_at | Prompts and outputs are **not** stored, only metrics |
| `safety_events` | id, user_id, surface (`chat`/`moment`), category, created_at | Category only. No text stored. |

All user-owned tables cascade from `users`, so **Delete Account = `DELETE FROM users WHERE id=$1`**. A test asserts that no rows remain.

---

## 4. API (all under `/v1`, JSON, zod-validated, Bearer JWT unless noted)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness (no auth) |
| POST | `/auth/guest` | Create a guest user and return a JWT (no auth) |
| POST | `/auth/register` | Upgrade the current guest to email + password |
| POST | `/auth/login` | Email + password → JWT (no auth) |
| GET / PATCH / DELETE | `/me` | Profile, update role/name, **hard delete account** |
| POST / PATCH / DELETE | `/children[/:id]` | Manage children (max 2 for MVP) |
| PUT | `/me/goals` | Set 1–2 active goals |
| GET | `/goals?category=` | `{ personalized[], others[] }` |
| GET | `/goals/:slug` | Goal + wins. Locked wins return only title + `locked: true`. |
| GET | `/advisors` | Static fictional profiles |
| GET / POST / DELETE | `/subscription` | Fake checkout / status / cancel |
| GET / POST | `/moments` | List; create (safety check → LLM tag → maybe trigger pattern) |
| DELETE | `/moments/:id` | Remove a moment |
| GET | `/patterns` | Pattern cards with linked moment ids |
| POST | `/patterns/generate` | Regenerate manually (also runs automatically at 3, 6, 9… moments) |
| GET | `/chat/starters`, `/chat/topics` | Suggested questions / topic list |
| GET | `/chat` | Current conversation + messages |
| POST | `/chat/messages` | **SSE**: `meta` (kind, citations, clarify options) → `delta`* → `done` (message id) |
| POST | `/messages/:id/feedback` | 👍/👎 |
| POST / DELETE | `/messages/:id/bookmark` | Bookmark toggle |
| GET | `/bookmarks` | Saved replies |
| GET | `/notifications` | List (newest first) |
| POST | `/notifications/:id/read` | Mark read |
| POST | `/dev/run-daily-tips` | Trigger the job manually (dev only) |
| GET | `/admin/costs` | Totals and breakdown by purpose/model/day (dev only, `ADMIN_KEY` header) |

---

## 5. How the AI parts work

**Ask pipeline** (per message):
1. **Safety gate**: a rule-based classifier (curated phrase lists + regex, per category: medical emergency, abuse, self-harm, developmental concern). On a hit the model is never called for advice. The user gets a fixed message per category with the relevant hotline / "contact your pediatrician or emergency services" guidance, and a `safety_events` row is written. The rules come first because they are deterministic, testable and fast, and here a missed red flag costs more than a false alarm. An LLM second-opinion classifier is optional and off by default.
2. **Retrieve**: Postgres FTS over `content_chunks`, top-3, boosted for the user's active goals.
3. **Vagueness check**: if the message is short or generic *and* retrieval confidence is low, the API returns `kind: clarify`: one question plus 2–3 tap options generated by the LLM (JSON, zod-validated). Tapping an option sends it as the next message. At most one clarification per question.
4. **Answer**: system prompt + child context (age in months from month/year, goals, last 5 moment summaries) + retrieved chunks. The model must cite chunk ids. The server checks that cited ids exist in the retrieved set and drops any that don't. The citations shown in the UI come from the server, not from model text.
5. **Log** tokens, latency and cost.

**Moment tagging**: `llm.json()` with a zod schema `{trigger, behavior, outcome}`. If validation fails it retries once, then saves the moment with `tag_status: failed` so the user's entry is never lost.

**Patterns**: when moment count hits a multiple of 3, the last N moments go to the LLM, which returns `{title, insight, suggestion, momentIds[]}`. Ids are validated against the user's real moments. If fewer than 2 valid ids come back, no card is created.

**Daily tip job**: node-cron at 08:00 server time. For each user it picks an active goal, takes a win the user hasn't been tipped on yet, and has the LLM personalize one sentence using the child's nickname and age (template fallback in mock mode). Idempotent via `unique(user_id, for_date)`.

---

## 6. Content and sources

- `content/goals/<slug>.md`: frontmatter (title, subtitle, category, sources) plus one `## Win` section per win with **Action / Say this / What to expect** fields. The seed script parses these and fails loudly on malformed files.
- **Goals with full content**: handling tantrums (emotion), fixing sleep issues (sleep), tackling picky eating (habits). Keeping busy, screen time and improving focus map to the Focus chip. Potty training maps to habits. These 4 are "Coming soon".
- **Sources** I plan to base the content on (all public-health or professional bodies; wording will be my own):
  - AAP / HealthyChildren.org: tantrums, sleep, picky eating articles
  - CDC: *Positive Parenting Tips* and *Learn the Signs. Act Early.* (also used for developmental-concern safety copy)
  - NHS: *Temper tantrums*, *Helping your child to sleep*, *Fussy eaters*
  - AASM consensus on recommended sleep duration for children (Paruthi et al., 2016, *J Clin Sleep Med*)
  - Ellyn Satter Institute: *Division of Responsibility in Feeding*
  
  ⚠️ I'll record each URL with an access date. **You should spot-check them before sharing the project.** I'll log in AI_MISTAKES.md any claim I couldn't trace to a source.
- **Advisors**: 3 clearly fictional profiles (e.g. "Sample Advisor · Sleep", labelled *"Placeholder profile, not a real person"*), with generated initials avatars.
- **Illustrations**: simple original SVG shapes per goal (react-native-svg). No stock or copied art.

---

## 7. Quality: tests, evals, cost

- **API tests** (vitest + `fastify.inject` against a dockerized test DB): auth guest/register/login, child create with month/year only, goal locking for free vs fake-subscribed users, moment tagging with the mock LLM, pattern creation at 3 moments with valid links, a safety hit that bypasses the LLM, an SSE chat stream shape, feedback/bookmark, cascade delete leaving zero rows, and an idempotent daily job.
- **Eval script** (`npm run eval`): ~25 JSON cases `{question, expectedGoal, expectedWinId?, expectSafety, expectClarify}`. It reports:
  - *Retrieval accuracy*: expected goal/win in the top-3
  - *Grounding*: share of answers whose server-validated citations are non-empty and inside the retrieved set, plus a lexical-overlap score between the answer and the cited chunks. An optional LLM-judge runs when a real provider is configured.
  - *Safety-trigger accuracy*: precision / recall / confusion matrix over the safety-labelled cases, including tricky negatives like "my toddler hit his head on a pillow, laughing".
  
  Honest caveat: in mock mode the grounding numbers are close to meaningless. The README will show results from a real-provider run separately, if you supply a key.
- **Cost**: a price table per model in config (USD per 1M input/output tokens, editable). `GET /admin/costs` returns totals plus breakdowns by purpose, model and day. The eval prints its own run cost.

---

## 8. Phases and exit criteria

| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold, schema, migrations, seed skeleton, guest/register/login auth, LLM wrapper + mock | `npm run dev` boots; auth tests pass |
| 2 | Onboarding + paywall, Home, goal detail with locked wins, advisors | Can onboard as a guest and see wins; locking tests pass |
| 3 | Ask: retrieval, SSE streaming, clarify, citations, feedback/bookmarks | Streaming works in Expo; chat tests pass |
| 4 | Story: moments, tagging, patterns with links | 3 moments → pattern card that links back |
| 5 | Safety gate, eval script, cost logging + summary | Eval report prints; safety tests pass |
| 6 | Notifications job, Profile (delete account etc.), polish, all docs | Full test suite green; docs written |

After each phase I'll run the tests and report what works, what's broken, and what I'm unsure about.

---

## 9. Risks / open questions for you

1. **LLM provider**: OpenAI (decided). Model and per-token prices are env/config so they can be updated without code changes.
2. **Demo target**: I plan to verify on **Expo Web + Expo Go (Android/iOS)**. Native date pickers and SSE streaming behave differently across these. I'll test web myself, but I can't drive a phone from here, so on-device checks will be yours.
3. **Retrieval via Postgres FTS instead of embeddings**: OK for the MVP? (Reasoning in §5 and DECISIONS.md.)
4. **Rule-based safety first**: recall depends on phrase lists. I'll document known gaps rather than claim coverage.
5. **Content accuracy**: I'm writing parenting guidance from public sources. It needs your review before it goes in front of anyone, and the app will say so.
