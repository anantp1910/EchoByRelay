# Relay — Project Memory (CLAUDE.md)

Relay is a voice-first access router that carries a prescription from the doctor's decision to the patient's hands. It sits on top of Impiricus Ascend and Medvantx (both simulated here). Built for HackGT 13: Aramco Social Good track + Impiricus, Visa, SpaceXAI, Meta, NSA HEARSAY challenges.

Read `BUILD_PLAN.md` for the full plan. This file is the rulebook.

Also read @AGENTS.md for Next.js 16 guidance from the scaffold.

## The one demo that must work

Maria (Spanish-speaking, rural South Georgia, diabetes + heart failure) → doctor speaks one sentence → coverage check (PA required, $480 copay) → router sends her to a free Medvantx Bridge + PA drafted with FDA label citations → patient portal explains in Spanish, daughter Ana joins care circle → demo clock jumps to day 24: PA denied, bridge ends in 6 days → watchdog alerts doctor → router moves Maria to Medvantx Cash Pay → Ana pays via Visa agent with passkey + spending cap → refill mandate → pharma dashboard shows "script rescued".

Every feature decision is judged against: does it make this demo better? If not, skip it.

## Stack

- Next.js 16 (App Router) + TypeScript (strict) + Tailwind + shadcn/ui + Framer Motion + lucide-react
- Supabase (Postgres + Realtime) so all three portals update live
- Grok via xAI's OpenAI-compatible API (`openai` npm SDK with `baseURL` from env). Model names come from env vars, never hardcoded.
- Recharts for dashboard charts
- Optional Python FastAPI microservice in `/services/hearsay` for the NSA deepfake model
- Deploy on Vercel

## Folder layout

```
app/
  (marketing)/page.tsx        landing page
  doctor/                     doctor portal
  patient/[id]/               patient portal (mobile-first)
  pharma/                     pharma client dashboard
  demo/                       hidden demo control panel
  api/                        route handlers (agents, mocks, webhooks)
lib/
  agents/                     one file per agent + orchestrator.ts
  mocks/                      payer.ts, medvantx.ts, visa.ts
  data/                       openfda.ts, trials.ts, formulary.ts
  db/                         supabase client, types, queries
  clock.ts                    demo clock (simulated "now")
components/                   shared UI (AgentTimeline, StatusPill, VoiceButton ...)
supabase/                     schema.sql, seed.sql
services/hearsay/             Python deepfake scorer (optional)
```

## Agents (lib/agents)

Team is 3 people. trustGate, eligibility, and trialMatcher are OUT of scope unless a human says otherwise (Person C may build trustGate / NSA HEARSAY late, only if the demo is stable). Build intake → coverage → router → paDrafter → patientComms → checkout → watchdog first.

Each agent is a pure async function: `(input, ctx) => result`, and it MUST emit events via `ctx.emit(event)` so the UI timeline streams. Every event is also written to `agent_events` and `audit_log`.

| Agent | Input → Output |
| --- | --- |
| trustGate | audio → synthetic score 0–100; block if above threshold |
| intake | transcript → structured Rx {patient, drug, dose, frequency} |
| coverage | Rx + patient plan → {paRequired, copay, formularyTier} (mock payer) |
| router | patient + coverage → Medvantx program: bridge / quick_start / pap / cash_pay / retail_copay_card, with reasons |
| paDrafter | Rx + chart + openFDA label → PA letter with inline citations |
| eligibility | patient → pre-filled PAP form fields for patient to confirm |
| patientComms | plan → plain-language explanation in patient's language (+ optional visual) |
| checkout | order + payer → Visa Intelligent Commerce flow (enroll, instruct, pay, confirm) |
| watchdog | runs on demo clock ticks → alerts for bridge cliff, PA denial, no pickup |
| trialMatcher (stretch) | patient → ClinicalTrials.gov matches |
| orchestrator | plans the steps and calls the agents in order |

## Hard rules

1. **Synthetic data only.** Never real patient data. Seed patients live in `supabase/seed.sql`.
2. **Mocks are honest.** Payer, Medvantx, and Visa (if no sandbox) are mocks. Mock function names and shapes mirror the real APIs. UI shows a small "Simulated" badge on mock-backed steps.
3. **Clinical content only from the FDA label** (openFDA) and it is cited. No off-label claims. The LLM may summarize, never invent.
4. **LLM output that drives logic must be JSON** validated with zod. On parse failure, retry once, then fall back to a deterministic path. The demo must never hang.
5. **Router eligibility is deterministic code**, not the LLM. The LLM only writes the human explanation of the decision.
6. **Money:** free programs (bridge, quick start, PAP) never touch Visa. Visa is only for Cash Pay and remaining copays.
7. **Every agent step emits an event** with: agent, status (running/done/blocked/needs_approval), title, detail, simulated flag, timestamp.
8. **Human in the loop:** PA submission, program enrollment, and payment all need an explicit approval (doctor voice/click or payer passkey).
9. **Secrets** only in `.env.local`. Never commit keys. Keep `.env.example` updated.
10. **Demo clock:** all time logic uses `lib/clock.ts` `now()`, never `Date.now()` directly, so the demo panel can fast-forward days.

## UI rules

- Three distinct personas, one design system. Doctor = calm clinical (dense, fast). Patient = warm, large type, mobile-first, bilingual toggle. Pharma = executive dashboard.
- The Agent Timeline (live streaming steps with icons, spinners, and approval cards) is the hero component. Reuse it in doctor and pharma views.
- Status colors are consistent everywhere: on-therapy green, at-risk amber, blocked red, pending blue.
- Every screen must look good at 1440px (projector) and 390px (phone).
- Empty, loading, and error states on every data view.
- Accessibility: keyboard reachable, visible focus, 4.5:1 contrast.

## Commands

```
npm run dev          # local dev on :3000
npm run lint
npm run typecheck
npm run seed         # reset Supabase + load seed data
npm run demo:reset   # reset demo state + clock to day 0
```

## Working style for Claude

- Three humans work in parallel, each with their own Claude session. Stay inside your person's folders; for anything else, propose the change instead of making it.
  - Person A (Engine): `lib/` (except `lib/data/fixtures/`), `app/api/`, `supabase/schema.sql`
  - Person B (Experience + Demo): page routes under `app/` (not `app/api/`), `components/`, `public/`
  - Person C (Integration + Ops): `lib/data/fixtures/`, `supabase/seed.sql`, `tests/`, `docs/`, `README.md`, `.env.example`, deploy config

- Before a multi-file change, state the plan in 3–5 bullets, then do it.
- After each phase in BUILD_PLAN.md, run lint + typecheck and fix errors before moving on.
- Prefer small, reviewable commits with clear messages.
- If a real API is flaky or slow, add a cached fixture in `lib/data/fixtures/` and use it behind a flag.
- Ask before adding a new dependency that isn't in the stack above.
