# Relay (EchoByRelay)

Relay carries a prescription from the doctor's decision to the patient's hands. The doctor says one sentence; agents check coverage, pick a free or paid access program, draft the prior authorization from the FDA label, explain it to the family in their own language, watch for gaps, and re-route when the insurer says no.

Built for HackGT 13 (Aramco Social Good track). Live: https://echo-by-relay.vercel.app

**All patient data is synthetic.** The payer, Medvantx and Visa are simulated with shapes that mirror the real systems, and every mock-backed step shows a "Simulated" badge. Clinical content comes only from the FDA label (openFDA) and is cited.

## The demo

Maria (Spanish-speaking, rural South Georgia, diabetes + heart failure):

1. The doctor dictates "Starting Maria on Jardiance, ten milligrams daily." (ElevenLabs transcribes; the doctor reviews and presses Send.)
2. Coverage: PA required, $480 copay. The router (deterministic rules) picks a free **Medvantx Bridge** supply; the doctor approves.
3. The PA letter is drafted with numbered FDA-label citations; the doctor approves submission.
4. Maria gets a Spanish update, her daughter Ana an English one.
5. Day 24: the bridge is about to end and the insurer denies the PA. The watchdog alerts the doctor, an appeal is drafted, and the doctor approves **Medvantx Cash Pay**.
6. Ana pays $89 with a spending cap and passkey (simulated Visa Intelligent Commerce), and can ask "When will her medicine arrive?".
7. Day 26: delivered. The pharma dashboard shows one script rescued, 2 days to first dose, 0 days without medication.

Portals: `/doctor`, `/patient/11111111-1111-1111-1111-111111111111`, `/pharma`, and the hidden control panel `/demo` (numbered stage scenes; reset needs a second click).

## Run locally

```sh
npm install
cp .env.example .env.local   # fill in values
npm run dev                  # http://localhost:3000
```

Database: paste `supabase/schema.sql`, then `supabase/seed.sql`, into the Supabase SQL editor (both are safe to re-run). `npm run db:check` verifies the seed. `npm run demo:reset` clears demo data and sets the clock to day 0 (shared database: warn the team first).

## Environment

See `.env.example` (names only; values live in `.env.local` and Vercel).

| Variable | Needed for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser reads + Realtime (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | All server writes |
| `XAI_API_KEY`, `XAI_BASE_URL`, `GROK_FAST_MODEL`, `GROK_REASONING_MODEL` | Grok, the primary AI |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Backup AI after Grok fails |
| `ELEVENLABS_API_KEY` (`ELEVENLABS_STT_MODEL` optional) | Doctor dictation |
| `BACKBOARD_API_KEY` | Care-circle Q&A memory |
| `DEMO_MODE` | `false` in production; `true` = offline fixtures |
| `USE_VISA_SANDBOX` | `false` (sandbox not implemented) |

## Tests

| Command | What it checks |
| --- | --- |
| `npm run lint`, `npm run typecheck`, `npm run build` | Code health |
| `npm run test:engine` | Full rescue chain through the real agents and handlers on an in-memory DB |
| `npm run test:router`, `test:pa`, `test:watchdog` | Routing rules, PA citation validation, watchdog + metrics |
| `npm run test:gemini` | Grok forced down: Gemini answers intake, router, PA and comms |
| `npm run test:transcribe` | ElevenLabs route: success, limits, upstream failure (dev server running) |
| `npm run test:ask` | Full chain stores Backboard memories; Ana's questions answered from memory search in relative time; dosing declined |
| `npm run test:checkout`, `npm run smoke` | Live routes (dev server running; `SMOKE_BASE_URL` for production) |
| `npm run rescue -- --reset-confirmed` | Shared-DB end-to-end rescue through HTTP (resets demo data) |
| `npm run test:e2e` | Playwright drives the real UI on production (`E2E_BASE_URL` to override; resets demo data) |

## Sponsor technology in Relay

- **xAI Grok** (primary AI): parses the dictated sentence into a structured prescription, writes the plain-language "why this path" explanation, drafts the PA rationale (every citation is checked against the FDA label text), writes the bilingual family updates, and answers care-circle questions from stored notes. It never makes the routing decision; that is deterministic code.
- **Google Gemini** (backup AI): if Grok times out, errors or returns invalid output after its retry, Gemini is called once with the same prompt and schema; only then do deterministic templates take over. Event data records which provider answered, and the UI says "Backup AI: Gemini" when it did.
- **ElevenLabs** (speech-to-text): the doctor's dictation is recorded in the browser and transcribed server-side (Scribe, English, with "Jardiance" and "Maria" boosted). The text fills the box for review; nothing is sent until the doctor presses Send. Browser dictation and typing are fallbacks.
- **Backboard** (memory): each patient gets their own Backboard assistant, created on the first update (its id is stored in `patients.backboard_assistant_id`; `reset_demo()` clears it so every demo run starts fresh). Backboard memories are assistant-scoped, so one assistant per patient keeps each patient's facts separate. Every family update is stored as a Backboard memory through the memory API, e.g. "[day 24] The $89 payment … is complete and the medicine has shipped. It should arrive around day 26." When Ana asks "Ask about Maria's medicine", Relay runs Backboard memory search for her question, rewrites every day marker relative to the demo clock ("2 days ago", "in about 2 days", "today"), and Grok (Gemini as backup) writes a 1–3 sentence answer from those retrieved memories only, in the asker's language. No day numbers reach the family. Medical or dosing questions are declined before any AI call (ask the doctor's office). Each Q&A is written to `audit_log` with `memoriesUsed`. Backboard writes are capped at 5 s and can never break the prescription chain; if Backboard or the AI is down, the answer is "the care team will follow up".
- **Visa Intelligent Commerce** (simulated): Cash Pay checkout follows the five-step shape (enroll card, purchase instruction with spending cap and recurring refill, one-time credential, pay, confirm) with a simulated passkey. Free programs never touch payment. No real Visa sandbox is called.
- **Impiricus / Medvantx** (simulated): the access programs (Bridge, Quick Start, PAP, Cash Pay, copay card) and the pharma dashboard's rescue metrics model how a manufacturer program would see the outcome. PA hours saved is an estimate (20 min per PA, AMA survey average), not a measurement.
- **Supabase**: Postgres + Realtime keep the doctor, patient and pharma screens in sync live.

## Team

Person A (engine), Person B (experience + demo), Person C (integration + ops). See `CLAUDE.md` for the rules and `BUILD_PLAN.md` for the plan.
