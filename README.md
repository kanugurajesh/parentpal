# ParentPal

An AI parenting companion. Parents log short "moments" about their child, pick a goal or two, get small scripted "wins" to try, and ask questions in a chat. The chat answers from curated, sourced content and from what the parent has logged.

This is a portfolio MVP. It covers one working path through the app from start to finish, and the docs try to be honest about its limits.

> **Not medical advice.** All guidance is general, written from public sources, and has not been checked by a clinician. Every AI-generated surface in the app says so.

---

## Features

| Area | What it does |
|---|---|
| **Onboarding** | Guest-first: child (nickname, sex, birth date picker, optional second child) → intro slides → pick 1–2 goals → parent details → fake paywall. Closing the paywall drops you into the free tier. |
| **Home** | Personalized goals, category filter chips, goal detail pages with 4–5 wins. Win 1 is free and the rest unlock with a (fake) subscription. |
| **Story** | Log moments in free text. An LLM tags each one as trigger / behavior / outcome. After every 3 moments it writes a pattern insight that links back to the moments it came from. |
| **Ask** | Streaming chat (SSE). Answers draw on the child's age, active goals and recent moments, plus retrieved content shown as citations. Vague questions get one clarifying question with tap-to-answer options. Replies can be rated 👍/👎, copied, shared and bookmarked. |
| **Notifications** | On-device reminders that serve the try → log → pattern loop: a daily idea sent when it's usable (sleep ideas before bedtime), a "How did it go?" check-in the morning after tapping **I'll try this** on a win (opens the moment log, filled in), and one nudge after 3 days without a moment. At most one a day, never at night, each type switchable in Settings. Tips also collect in an in-app inbox. See [How notifications work](#how-notifications-work). |
| **Circles** | Anonymous groups by goal, with posts tagged by the child's age band. Each parent gets a different nickname in each circle. Three post types: question, **what worked** (tied to a win, with an outcome) and sharing. Questions get a cited "ParentPal guide" reply straight away. "What worked" reports add up to a "Parents like you: 5 of 7 said it helped" line on the win. Every post and reply is moderated before anyone sees it. See [How Circles work](#how-circles-work). |
| **Profile** | Family profile, sign in / create account (upgrades the guest account), bookmarks, manage subscription (stub), refer friends (stub), hard account deletion. |
| **Safety** | A rule-based red-flag check runs on every chat message and moment *before* any LLM call. Covered: medical emergencies, abuse, self-harm, developmental concerns. On a match the app skips the advice and shows fixed safety guidance instead. |

## Feature brief: Circles

> **In one line:** anonymous groups of parents working on the same goal with children the same age, where every question gets an expert-grounded answer straight away and every "what worked" report makes the core plan more credible.

### The problem

ParentPal gives expert-backed plans (goals → wins) and an AI that answers questions. Two needs are still unmet:

1. **"Is it just me?"** Much of what parents of young children feel is isolation and self-doubt. An AI can give the right advice but can't tell you that other parents are going through the same thing.
2. **"Will this actually work for my kid?"** A win from a guide is credible. A win that 5 of 7 parents with 2-year-olds say helped is persuasive.

Today parents take both needs to WhatsApp groups and Instagram comments. Those are noisy, not anonymous, not organised by age or problem, and full of unchecked medical advice. ParentPal can offer the safer version.

### Why not just add a forum?

Parent forums fail in four predictable ways. Each became a design constraint:

| Risk | What would happen | How Circles handle it |
|---|---|---|
| **Cold start** | Few users split across many rooms means empty feeds, so people leave | One circle per goal (not goal × age). Quiet age bands borrow from **nearby ages**. Every question gets an **instant guide answer**, so nothing goes unanswered. |
| **Bad advice** | "Give 3mg melatonin", "sounds like ADHD" | AI and rule moderation before anything is published. Medicine doses and diagnoses go to review; insults and spam are rejected. |
| **Crises posted in public** | A parent in distress gets silence or judgement | The same safety rules as chat. Crisis posts are **never published**; the parent sees helplines immediately. |
| **Privacy** | Children's names, photos and phone numbers in public | Text only. Numbers, emails and links are rejected. Children's names become "my child". A different nickname in every circle. |

The guiding principle: **the community adds warmth and real-world evidence; the AI and the expert content keep it safe and useful.**

### How a parent uses it

1. **Open the Circles tab.** Your circles (from the goals you picked) come first, e.g. *Handling tantrums*, with how active each one is this week.
2. **Browse your child's age.** The feed opens on your child's age band ("2 to 3"). You can switch to any age or "All ages".
3. **Ask a question.** For example, *"My child screams every time we leave the park. How do you handle it?"* You post as "Gentle Robin · Mom of a 2-year-old", never your name. Within seconds a **ParentPal guide** reply appears, built from the expert content and citing the win it came from. Other parents reply below it.
4. **React.** "Same here" (solidarity) and "Helpful" (useful). No downvotes, no follower counts, no profiles.
5. **Share what worked.** After trying a win, tap **Share how it went** on the win card. Pick "It helped", "Helped a bit" or "Didn't help" and add a tip. Once 3 parents have reported, the win shows **"Parents like you: 5 of 7 said it helped"**.
6. **Get pulled back in.** Replies to your post show up in the Notifications inbox, at most one notice per post per day.
7. **Stay in control.** Delete your own posts. Report or block anyone. Blocking hides a parent everywhere, and they're never told.

Other entry points: **"Ask other parents"** under any chat answer (it prefills your question, especially useful after a 👎), and **"Share how it went"** on every win.

### What makes it different

- **AI is the first responder, not the only one.** Every question is answered within seconds from vetted content, with sources. Parents add experience on top. If the content doesn't cover the question, the guide stays silent instead of guessing.
- **The community feeds the product.** "What worked" reports turn into social proof on the wins, which supports the core loop: try a win, see results, stick with the plan, convert to paid.
- **Safety is built in from the start.** Moderation runs before publishing, fails closed (if the AI is down, posts wait for review) and is covered by automated tests.
- **Anonymous by design.** Parents share the embarrassing stuff (yelling, "I felt like a bad mom") because nobody knows who they are.

### Safety and moderation at a glance

| What a parent writes | What happens |
|---|---|
| Support, venting, self-criticism, a parent's own child's diagnosis, "see your pediatrician" | Published immediately |
| A medicine or dose, a diagnosis of someone else's child, off-topic content | Held for review; only the author sees it |
| Insults, shaming, selling or "DM me" | Rejected, with a kind explanation |
| Phone number, email, link, @handle | Rejected: "Circles are anonymous, please remove…" |
| Emergency, self-harm, abuse | Not published; helplines shown immediately |
| A developmental worry ("not talking yet at 2") | Published, with a "talk to your pediatrician" card pinned and no AI answer |
| Reported by 3 different parents | Hidden until a moderator decides |

Checked against the live model (Groq `gpt-oss-120b`) with 10 hand-written replies covering each row above: all 10 were handled as intended.

### Metrics to watch

Proposed, not yet instrumented:

- **Activation:** % of weekly active parents who open Circles, and % who post or reply.
- **Answer speed:** % of questions with a guide reply (target: most on-topic questions), and time to first parent reply.
- **Product link:** number of "what worked" reports per win, and whether parents who see "Parents like you" stats try more wins or convert to paid more often.
- **Health:** % of posts held for review, reports per 100 posts, and how long items wait in the review queue.
- **Retention:** D7/D30 retention of parents who posted vs. those who didn't.

### Rollout suggestion

1. **Seed honestly.** Before launch, the team posts real questions it has heard from parents, labelled as from the ParentPal team, never fake parents.
2. **Start with the 2–3 most-picked goals**, and widen once feeds are active.
3. **Daily moderation owner.** Someone checks the review queue every day. It's an API endpoint today; a simple admin screen is the first follow-up.
4. **Watch the review rate.** If too many good posts get held, tune the moderation prompt with real examples.

### Effort and status

Built end to end: API, database migration, moderation, mobile screens, and 18 automated tests covering anonymity, moderation, crisis handling, reports, blocks, rate limits, the guide reply and win stats. Engineering details are in [How Circles work](#how-circles-work).

**Next steps, in priority order:**
1. Admin screen for the review queue.
2. Push notifications for replies.
3. A weekly AI digest per circle ("This week, parents of 2-year-olds found…").
4. Semantic search (pgvector) so the guide answers more questions.

## Architecture

An npm-workspaces monorepo: one Expo app, one Fastify API, one shared schema package, Postgres, and an LLM behind a small provider interface.

```
 ┌───────────────────────────────┐                         ┌──────────────────────────────────────────┐
 │ apps/mobile  (Expo / RN, TS)  │   HTTPS JSON  /v1/*     │ apps/api  (Fastify 5, TS)                │
 │                               │ ──────────────────────▶ │                                          │
 │ app/        expo-router       │   Bearer JWT            │ routes/    auth · me · goals · story ·   │
 │             screens + tabs    │   (guest or user)       │            chat · notifications · admin  │
 │ lib/api.ts  fetch + SSE       │                         │            (zod-validated in and out)    │
 │ lib/session token storage     │ ◀────────────────────── │ services/  safety → retrieval → chat     │
 │ react-query cache             │   text/event-stream     │            story · context · dailyTips   │
 │ ChatBubble  Markdown + [n]    │   (chat answers)        │ llm/       complete · stream · json<T>   │
 │             citation render   │                         │            + per-call cost/latency log   │
 └───────────────┬───────────────┘                         │ jobs/      daily tip (node-cron)         │
                 │                                         │ db/        Drizzle ORM + migrations      │
                 │      packages/shared                    └─────┬───────────────────────┬────────────┘
                 └────▶ zod schemas + TS types ◀─────────────────┘                       │
                                                                 │ SQL                   │ OpenAI SDK
                                                                 ▼                       ▼
                         content/goals/*.md ──seed──▶  ┌──────────────────┐   ┌──────────────────────────┐
                         content/sources.json          │ Postgres 16      │   │ LLM provider             │
                                                       │ (docker compose) │   │  groq   → api.groq.com   │
                                                       │ tsvector FTS     │   │  openai → any compatible │
                                                       └──────────────────┘   │  mock   → offline/tests  │
                                                                              └──────────────────────────┘
```

| Path | Contents |
|---|---|
| `apps/api` | Fastify API: routes, services (chat, retrieval, safety, story, daily tips), LLM adapters, Drizzle schema and migrations, seed script, tests, eval runner |
| `apps/mobile` | Expo / React Native app (iOS, Android, web) using expo-router |
| `packages/shared` | zod schemas and TypeScript types shared by the API and the app, so request/response shapes can't drift |
| `content/` | Goals and wins as Markdown, plus `sources.json`. See [`content/README.md`](content/README.md). |
| `evals/` | Eval cases (`cases.json`) and run results |
| `scripts/tunnel-api.mjs` | Exposes the local API on an ngrok static domain for testing on a real phone |

### API layers

Requests flow **route → service → db / llm**:

- **Routes** (`apps/api/src/routes`) handle HTTP only: auth (`requireUser`), zod validation and response shaping. Everything is mounted under `/v1`.
- **Services** (`apps/api/src/services`) hold the product logic: `safety` (red-flag rules), `retrieval` (Postgres FTS over content chunks), `context` (child age, goals and recent moments the LLM may see), `chat` (clarify / answer / citation validation), `story` (moment tagging, pattern insights) and `dailyTips`.
- **LLM** (`apps/api/src/llm`) is the only code that talks to a model. Every call states a `purpose` and a deterministic `mock()` output, and is logged to `llm_calls`.
- **DB** (`apps/api/src/db`) is the Drizzle schema plus SQL migrations. Every user-owned table cascades from `users`.

### Data model

| Group | Tables |
|---|---|
| Accounts | `users`, `children`, `subscriptions` |
| Content | `goals`, `wins`, `sources`, `content_chunks`, `user_goals` |
| Story | `moments`, `patterns`, `pattern_moments` |
| Chat | `conversations`, `messages`, `message_feedback`, `bookmarks` |
| Ops | `notifications`, `llm_calls`, `safety_events` |

### Mobile app

- **Routing:** `expo-router` with file-based routes in `apps/mobile/src/app`. Tabs are Home, Story, Ask, Notifications and Profile; onboarding, goal detail, paywall, bookmarks and settings are stack screens.
- **Notifications:** `lib/notificationPlan.ts` is a pure planner that picks at most one notification per day for the next 3 days (priority: check-in, log reminder, daily idea). `lib/notifications.ts` holds the on-device prefs and check-ins, asks for permission in context, schedules with `expo-notifications` on every app open, and routes taps to the right screen. Nothing goes through a push server, so notification text never leaves the phone; if the app isn't opened for ~3 days, notifications pause. `lib/expoNotifications.ts` imports only the parts of `expo-notifications` the app uses, because importing the package root crashes Android Expo Go.
- **Data:** `lib/api.ts` wraps `fetch` for JSON calls and `expo/fetch` for the chat SSE stream. Server state is cached with react-query, and the JWT lives in secure storage (`lib/session.tsx`).
- **Chat rendering:** `ChatBubble` renders the small slice of Markdown models produce (bold, bullet and numbered lists, headings) with the app's own fonts, and turns `[n]` markers into citation tags that match the "Based on" source list. Copy/share strips the Markdown.

### How the chat answers a message

1. **Safety gate:** regex/phrase rules per category. A match returns a fixed safety message and logs a `safety_events` row that stores the category only, never the text. The LLM is not called.
2. **Retrieve:** Postgres full-text search over content chunks, top 3, boosted for the user's active goals. Chunks below a minimum score are never shown to the model or cited.
3. **Clarify:** if the question is short or generic *and* retrieval confidence is low, the API asks one clarifying question with 2–3 options instead of answering.
4. **Answer:** a system prompt plus child context plus retrieved chunks, streamed back over SSE. The server checks that every citation id the model gives was actually retrieved and drops any that weren't.
5. **Log:** provider, model, purpose, tokens, latency and cost go to `llm_calls`. Prompts and outputs are not stored.

### How notifications work

**Why they exist.** The app's core loop is *pick a goal → try a win → log what happened → get pattern insights*. Parents drop off most between trying something and logging it, so notifications serve that loop rather than just pulling people back into the app. Each one either delivers an idea at a moment it can be used or asks for the one-line note that makes patterns possible.

**The three kinds**

| Kind | When it fires | What it says | Tapping it opens |
|---|---|---|---|
| **Check-in** | 8:30 am the day after the parent taps **I'll try this** on a win | *How did "Name the feeling" go?* | The moment log, titled "How did it go?" with *Tried "Name the feeling".* filled in |
| **Logging reminder** | 7:30 pm on the 3rd day without a logged moment, once per quiet streak | *Anything happen with Mo lately?* | An empty moment log |
| **Daily idea** | At the chosen time. **Smart** (default): sleep ideas 6:30 pm, picky-eating ideas 4:30 pm, everything else 8:00 am. Or a fixed Morning / Midday / Evening. | The day's tip from the server, e.g. *Today's idea: The 2-minute warning* | That goal's page (and marks the tip read) |

**Rules that keep them welcome**

- At most **one notification per day**. If several are due, the check-in wins, then the logging reminder, then the daily idea.
- Nothing is scheduled between 9 pm and 7 am, and times that have already passed today are skipped.
- The OS permission prompt never appears on launch. It only appears after the parent taps **Turn on** on an explainer card in the Notifications tab, or agrees to a check-in from **I'll try this**. If the OS has already refused, the app offers to open system settings instead.
- **Settings → Notifications** has one account-level **Notifications** switch, stored on the server (`users.notifications_enabled`) so it works on every platform, including web and Android Expo Go. Off: no new daily ideas are created (the morning job, the inbox and `upcoming` all skip the user), the tab badge disappears, phone alerts are cancelled, and the Notifications tab shows a "Notifications are off" card with a Turn on button. Under it, where phone alerts are possible, **Phone alerts** and each kind can be switched separately.
- Signing out cancels everything scheduled for that profile.

**How a notification gets to the phone**

Notifications are scheduled **on the device**, not sent from the server:

```
app opens / returns to foreground / setting changes / moment logged / "I'll try this"
        │
        ▼
syncNotifications()                                    apps/mobile/src/lib/notifications.ts
  1. load prefs + pending check-ins (device storage)
  2. fetch  GET /v1/me                    → child's nickname, sign-up date
           GET /v1/notifications/upcoming → tips for today + 2 days (created on demand)
           GET /v1/moments                → date of the last logged moment
  3. planNotifications(...)                            apps/mobile/src/lib/notificationPlan.ts
       for each of the next 3 days: pick ≤ 1 by priority, drop past times
  4. cancel all scheduled → schedule the plan with expo-notifications (date triggers)
        │
        ▼
OS shows it at the planned time → tap → useNotificationTaps() routes to the right screen
```

If the API can't be reached during a sync, the previous schedule is kept. Syncs are queued, so overlapping triggers never interleave cancel and schedule.

**Why on-device rather than server push.** It needs no push credentials, Firebase project or server-side token storage, and it works in iOS Expo Go. No notification text passes through Apple, Google or Expo push servers. The trade-off is that the schedule only reaches 3 days ahead, so if the app isn't opened for about 3 days, notifications pause. The kinds and planner would carry over unchanged to server push later.

**Server side.** Tips come from the same generator as the daily job (`apps/api/src/services/dailyTips.ts`): one per user per day (enforced by a unique index), rotating through the wins of the user's goals. `GET /notifications/upcoming` creates any missing tips for the requested days on demand, so the phone can schedule them in advance. `from` is the phone's local date and must be within a day of the server's, and `days` is capped at 3 to bound LLM cost. The inbox (`GET /notifications?today=…`) hides tips dated after the phone's today, so tomorrow's idea doesn't show up early.

**Where it lives**

| File | Role |
|---|---|
| `apps/mobile/src/lib/notificationPlan.ts` | Pure planner: types, times, priority, one-per-day rule. No React Native imports, so it can run under Node. |
| `apps/mobile/src/lib/notifications.ts` | Prefs and check-ins store, permission flow, scheduling, foreground sync and tap routing hooks |
| `apps/mobile/src/app/(tabs)/notifications.tsx` | Inbox plus the "Turn on" explainer card |
| `apps/mobile/src/app/goal/[slug].tsx` | **I'll try this** button on each unlocked win |
| `apps/mobile/src/app/moment/new.tsx` | "How did it go?" mode when opened from a check-in |
| `apps/mobile/src/app/settings.tsx` | Notification settings |
| `apps/api/src/routes/notifications.ts`, `services/dailyTips.ts` | Inbox, upcoming tips, tip generation |

**Where it runs.** iOS (Expo Go or a build) and Android **development or release builds**. Android Expo Go (SDK 53+) ships `expo-notifications` without the channel support Android needs to show any notification, so there the app detects Expo Go, hides the notification controls and explains why in Settings. The rest of the app works normally. Notifications are also hidden on web, where on-device scheduling isn't available.

**Trying it out.** Run the app on an iPhone with Expo Go, or on Android with a development build (`npx expo run:android`, or an EAS development build). Turn notifications on from the Notifications tab, then open a goal and tap **I'll try this**. The check-in arrives the next morning at 8:30. Today's idea is already in the inbox.

### How Circles work

**Why a constrained version.** Parents want to hear "it's not just you" from other parents, which the AI can't really provide. But open parent forums fail in predictable ways: empty rooms early on, medical misinformation, crises posted in public, and children's names and photos. Circles are designed around those four problems.

| Problem | What Circles do |
|---|---|
| Empty rooms | One circle per goal (not goal × age). Posts carry an age band, and a quiet band shows posts from **nearby ages**. Every question gets an instant **guide reply** built with the chat pipeline: same prompt, a stricter score threshold, only chunks from the circle's own goal, and dropped entirely if it can't cite. |
| Misinformation | `services/moderation.ts` runs on every post and reply. Dose and medicine mentions (rules) and diagnoses of someone else's child (LLM) go to **review**: only the author sees them until a moderator approves. Insults, shaming and spam are rejected with a reason. If the LLM is down, items wait for review (**fail-closed**). |
| Crises | The same red-flag rules as chat. Emergencies, self-harm and abuse are **never published**; the author sees the safety card instead. A developmental worry is published with the "talk to your pediatrician" card pinned and no guide reply. |
| Identity | Phone numbers, emails, links and @handles are rejected. The author's own children's nicknames are replaced with "my child". Pseudonyms come from `hash(secret, circle, user)`, so the same parent can't be linked across circles. Only signed-up accounts can post, react or report, which limits spam. Guests can read. |

Three reports from different parents hide an item until a moderator decides; once a moderator approves it, reports alone can't hide it again. Blocking hides a parent's content everywhere, for the blocker only. Limits: 5 posts and 30 replies a day. Reply notices (at most one per post per day) appear in the Notifications inbox.

| File | Role |
|---|---|
| `apps/api/src/services/community.ts` | Feed, posts, replies, reactions, reports, blocks, guide reply, win stats, inbox notices |
| `apps/api/src/services/moderation.ts` | PII rules, nickname scrub, safety gate, medication rule, LLM verdict |
| `apps/mobile/src/app/(tabs)/circles.tsx`, `circle/[goal].tsx`, `post/[id].tsx`, `post/new.tsx` | Circles tab, feed, post and composer |

### LLM providers

`apps/api/src/llm/` exposes `complete()`, `stream()` and `json<T>(schema)` with three adapters behind one `LLMProvider` interface:

- **`groq`** (default for real answers): used when `GROQ_API_KEY` is set. Reuses the OpenAI adapter pointed at Groq's OpenAI-compatible API (`https://api.groq.com/openai/v1`), default model `openai/gpt-oss-120b` (`GROQ_MODEL`). gpt-oss always reasons, so keep `LLM_REASONING_EFFORT=low` and some `LLM_THINKING_TOKEN_HEADROOM` so reasoning doesn't use up the small per-call caps.
- **`openai`**: used when `OPENAI_API_KEY` is set (and no Groq key). Works with any OpenAI-compatible endpoint via `OPENAI_BASE_URL`.
- **`mock`**: deterministic and template-based. It is used when no key is set and always in tests, so the whole app runs offline at no cost.

Set `LLM_PROVIDER` to force one. Each row in `llm_calls` records the provider, model, purpose, tokens, latency and cost, and `GET /v1/admin/costs` summarizes them.

## Getting started

### Prerequisites

- Node.js 22+ (scripts use `--env-file-if-exists`)
- Docker (for Postgres)
- Optional: a [Groq API key](https://console.groq.com/keys) (or an OpenAI key). Without one the app uses the mock LLM.
- Optional: Expo Go on a phone, or an Android/iOS emulator

### Setup

```bash
npm install
cp .env.example .env      # set JWT_SECRET; add GROQ_API_KEY for real answers
npm run dev               # Postgres + migrate + seed + API + Expo
```

`npm run dev` starts Postgres in Docker (on port **5433**), runs migrations, seeds content, then runs the API on `http://localhost:4000` and the Expo dev server side by side.

For the browser only:

```bash
npm run dev:web
```

To test on a physical phone, the app needs a URL for the API that the phone can reach, because `localhost` on the phone is the phone itself. Expo only reads env files from `apps/mobile`, so set it in `apps/mobile/.env.local`:

- **Same Wi-Fi:** `EXPO_PUBLIC_API_URL=http://<your LAN IP>:4000` and run `npm run dev`.
- **Any network (ngrok):** put `NGROK_AUTHTOKEN` and a free static `NGROK_DOMAIN` in the root `.env`, set `EXPO_PUBLIC_API_URL=https://<NGROK_DOMAIN>`, then run `npm run dev:tunnel`. It starts the API, an ngrok tunnel to it, and Expo in `--tunnel` mode. If ngrok reports `ERR_NGROK_334` or Expo says port 8081 is busy, an earlier run is still alive; stop it first.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `DATABASE_URL` / `TEST_DATABASE_URL` | local docker DBs on `5433` | Postgres connections (the test DB is created by `apps/api/db-init`) |
| `JWT_SECRET` | dev placeholder | Signs auth tokens. **Change it.** |
| `ADMIN_KEY` | `dev-admin-key` | Required as the `x-admin-key` header on `/v1/admin/*` and `/v1/dev/*` |
| `LLM_PROVIDER` | auto | `groq`, `openai` or `mock`. Auto-selects `groq`, then `openai`, by which key is present. |
| `GROQ_API_KEY`, `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq config |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL` | `gpt-4o-mini` | OpenAI or any OpenAI-compatible endpoint |
| `LLM_REASONING_EFFORT` | empty | Sent as `reasoning_effort` (`low` recommended for gpt-oss) |
| `LLM_THINKING_TOKEN_HEADROOM` | `0` | Extra output tokens per call for reasoning models (`512` in `.env.example`) |
| `LLM_PRICE_INPUT_PER_M`, `LLM_PRICE_OUTPUT_PER_M` | `0.15`, `0.60` | USD per 1M tokens for cost logging. Check against current pricing. |
| `DAILY_TIP_CRON` | `0 8 * * *` | Server job that fills the inbox with each user's tip for the day (server local time). Phones also fetch upcoming tips themselves. |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000` | API base URL for the app (set in `apps/mobile/.env.local`) |
| `NGROK_AUTHTOKEN`, `NGROK_DOMAIN` | empty | Used by `npm run dev:tunnel` |

## Scripts

Run from the repo root:

| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:web` | Full stack (native / web) |
| `npm run dev:tunnel` | Full stack with the API and Expo exposed through tunnels, for a phone on any network |
| `npm run tunnel:api` | Only the ngrok tunnel to the local API |
| `npm run setup` | Start the DB, migrate, seed |
| `npm run db:up` / `npm run db:down` | Start / stop Postgres |
| `npm test` | API test suite (vitest against a dockerized test DB, mock LLM) |
| `npm run eval` | Run the eval suite (add `-- --judge` for an LLM grounding judge; needs a real provider) |
| `npm run typecheck` | Type-check all workspaces |
| `npm run -w @parentpal/api db:seed` | Re-seed after editing `content/` |
| `npm run -w @parentpal/api jobs:daily-tips` | Run the daily tip job once |

## API

All routes live under `/v1`, take and return JSON validated with zod, and need a Bearer JWT unless noted. The main groups:

- **Auth:** `POST /auth/guest`, `/auth/register` (upgrades the guest), `/auth/login`
- **Profile:** `GET|PATCH|DELETE /me` (DELETE hard-deletes everything through cascades), `PUT /me/goals`, `POST|PATCH|DELETE /children[/:id]`
- **Goals:** `GET /goals`, `GET /goals/:slug` (locked wins return only their title), `GET /advisors`, `POST|DELETE /subscription` (fake)
- **Story:** `GET|POST /moments`, `DELETE /moments/:id`, `GET /patterns`, `POST /patterns/generate`
- **Chat:** `GET /chat`, `DELETE /chat` (starts a fresh conversation; bookmarked replies are kept), `GET /chat/starters`, `GET /chat/topics`, `POST /chat/messages` (SSE: `meta` → `delta`* → `done`), feedback and bookmark routes, `GET /bookmarks`
- **Notifications:** `GET /notifications?today=YYYY-MM-DD` (inbox; hides tips dated after the device's today), `GET /notifications/upcoming?from=YYYY-MM-DD&days=1-3` (creates and returns the next days' tips for on-device scheduling; `from` must be within a day of the server's date), `POST /notifications/:id/read`
- **Circles:** `GET /circles`, `GET|POST /circles/:goal/posts` (`?band=2-3y|all&cursor=`), `GET|DELETE /posts/:id`, `POST /posts/:id/replies`, `DELETE /replies/:id`, `POST /reactions` (toggles), `POST /reports`, `POST /blocks`. Writes need a signed-up account.
- **Ops** (needs `x-admin-key`): `GET /admin/costs?days=30` (LLM cost and latency breakdown), `POST /dev/run-daily-tips`, `GET /admin/community/queue`, `POST /admin/community/:type/:id` (`approve` or `remove`)

`GET /health` (no auth) reports which LLM provider is active.

## Testing and evals

**Tests** (`apps/api/test`) cover guest/register/login auth, goal locking, moment tagging and pattern creation, the chat SSE stream, the safety bypass, feedback and bookmarks, cascade delete, and the daily job being safe to re-run. They always use the mock LLM.

**Evals** (`evals/cases.json`, 25 cases) measure retrieval hit rate, grounding, clarify behavior and safety-trigger precision/recall. Each run writes a JSON report to `evals/results/`. Latest mock-mode run:

| Metric | Result |
|---|---|
| Expected goal in top 3 | 15/15 |
| Expected chunk in top 3 | 12/14 |
| Clarify decisions correct | 19/19 |
| Safety recall | 6/6 |
| Safety false positives | 0/19 |

Two caveats on these numbers. Grounding scores are close to meaningless in mock mode, because the mock answer is stitched together from the chunk text. And one safety case was fixed after the eval caught it, so the safety score is optimistic (see [`AI_MISTAKES.md`](AI_MISTAKES.md) #4). A clean real-provider grounding run is still to do.

## Content

Seven goals exist. Three have full content: **handling tantrums**, **fixing sleep issues** and **tackling picky eating**. The other four (focus, keeping busy, screen time, potty training) are shown as "Coming soon". Every win cites sources from `content/sources.json` (AAP/HealthyChildren.org, CDC, NHS, AASM), with access dates. The advisors shown in the app are fictional placeholders.

## Privacy by design

- Only the child's birth **month and year** are stored, never the full date.
- `llm_calls` stores metrics only, never prompts or outputs. `safety_events` stores the category only.
- Notifications are scheduled on the phone, so their text (which includes the child's nickname) never passes through a push service. Notification settings and pending check-ins are stored only on the device.
- Circles show a per-circle pseudonym and a coarse label ("Mom of a 2-year-old"), never a name, email or child's nickname. The API never returns another user's id.
- Every user-owned table cascades from `users`, so deleting an account removes all of that user's data. A test checks this.

## Known limitations

- **Safety is rule-based.** Recall depends on phrase lists, so phrasing we didn't anticipate can slip through. The system prompt is a second layer, not a guarantee.
- **Lexical retrieval.** Postgres FTS suits a corpus this small but misses synonyms and can match on unrelated shared words. pgvector is the planned upgrade.
- **Content needs expert review.** The AASM sleep-duration ranges in particular have not been machine-verified against the paper.
- **Payments and referrals are stubs.** The paywall writes a fake subscription row, which does unlock content.
- **Notifications are on-device only, and not available in Android Expo Go.** Testing them on Android needs a development build. They pause if the app isn't opened for about 3 days, and there's no measurement yet of how often a check-in leads to a logged moment.
- **Single instance.** The daily tip cron runs in-process.
- **Circles moderation has no admin UI yet.** The review queue is a JSON endpoint. Before launch, someone has to own that queue every day. There are no push alerts for replies, only the inbox.
- One running conversation per user. No password reset or social sign-in.

## More docs

- [`PLAN.md`](PLAN.md): the original MVP plan, scope cuts and data model
- [`AI_MISTAKES.md`](AI_MISTAKES.md): where AI-generated output was wrong, how it was caught and what changed
- [`content/README.md`](content/README.md): content format and editorial rules
