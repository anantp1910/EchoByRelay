# Engine handoff: A5.1, A6 and A7

Implemented on `engine`; integration into `main` remains Person C's responsibility.

## Changes

- PA rationale validates each citation reference against the corresponding FDA quote, including repeated references and duplicate numbering. Template sentences use their matching excerpts. Word overlap is a mechanical check, not proof of medical equivalence.
- Router explanations address the clinician about Maria. PA detail uses readable citation wording.
- `updatePa(rxId, letterMd)` and `resolveAlert(id)` are available in `lib/api/client.ts`. PA edits return 409 after submission; edits record `edited_by: doctor` in the audit payload.
- Free supplies have shipped orders. Bridge delivery keeps the prescription on Bridge until coverage is approved or a paid Cash Pay order is delivered.
- Denial creates an alert, an appeal draft, and a doctor approval card. Only doctor approval creates the Cash Pay enrollment/order and family payment request.
- Cash Pay delivery marks the prescription on therapy, resolves alerts, and emits a dated rescue milestone. Metrics use those milestones for both live and historical seed rows; order creation is not treated as delivery time.
- Alert IDs and enrollment/order IDs are deterministic. Duplicate inserts are guarded by existing primary keys; no schema migration is required.
- `no_pickup` explicitly holds an undelivered shipment. Ordinary overdue shipments auto-deliver on clock ticks, including a direct jump to day 24.
- Demo `advance` adds one day; `jump` sets the day. Demo reset calls `reset_demo()` and deletes shared non-seed data.
- SDK automatic retries are disabled; PA generation has two bounded attempts. Appeals use the existing FDA fixture and deterministic rationale to avoid live-model latency.
- Brought Person C's intake, router, and FDA fixtures from `origin/integration` unchanged. No experience files were edited.

## Verification completed

- Lint, TypeScript, production build: PASS.
- Router: 8 cases PASS.
- Citation checks: forced template, mismatched/missing/repeated references, duplicate numbering PASS.
- Watchdog boundary and metrics checks: PASS.
- `test:engine`: actual agents and approval/checkout handlers with an in-memory PostgREST adapter PASS. Covers full day-26 rescue, duplicate actions, caregiver approval rejection, PA edits, PA approval before delivery, no-pickup, and alert resolution. This is not a live Supabase end-to-end result.
- `smoke`: live HTTP checks PASS. Smoke no longer resets the shared database.
- `live:chain`: live intake, Bridge approval, PA draft, and submission PASS without reset. Both AI and template letters were observed with aligned citations. Latest AI draft about 9 seconds; enrollment HTTP response about 10.2 seconds.
- Live checkout: all 6 cases PASS. Observed success response times about 3.0–5.3 seconds; sequential repeat produced one payment.

## A7: realtime tables and pharma metrics contract

- `supabase/schema.sql`: `care_circle`, `payment_mandates` and `audit_log` join the guarded, idempotent `supabase_realtime` publication and get `REPLICA IDENTITY FULL` like the other published tables. No columns, constraints or indexes changed (existing indexes already cover `care_circle(patient_id)` and `payment_mandates(rx_id)`). **Person C must re-run `schema.sql` in the Supabase SQL editor**; until then these three tables do not stream.
- `PharmaMetricsResSchema` adds two fields (additions only):
  - `sample: false`: the live route computes every number from DB rows.
  - `paHoursSaved`: **estimate**, not a measured saving. Unique initial PA drafts × 20 minutes (the agreed figure from the AMA prior-authorization survey average) ÷ 60, one decimal. A draft counts when a `paDrafter` step reached its approval card (or a later decision) with a saved `pa_request`. Appeals (`data.appeal: true`) are excluded, each prescription counts once, and seed stub letters (no drafter event) never count. Constant: `PA_MINUTES_SAVED_ESTIMATE` in `lib/pharma/metrics.ts`.
- `scriptsRescued` is unchanged: an `onTherapy` milestone (written only after delivery of sustainable access) plus a prior alert or PA-denial reroute (or the watchdog's `rescued` flag, which is set from exactly those two facts).
- Checks: `test:watchdog` covers appeals, duplicates, unfinished/blocked steps and rounding; `test:engine` asserts 0.3 h and 1 rescue after the full isolated rescue; `rescue` asserts `sample === false` and a one-PA increase (appeal not counted).

### Person B: consume the new fields (components only; engine does not edit them)

- `components/pharma/sample.ts` / `PharmaDashboard.tsx`: replace `METRICS_ARE_SAMPLE` with `metrics.sample` (hide the Sample badge when `false`).
- Replace the page-side `paSubmitted * HOURS_PER_MANUAL_PA` (2 h per PA) with `metrics.paHoursSaved`. Hint text: "Estimate · 20 min per PA (AMA survey average)". Drop `HOURS_PER_MANUAL_PA`.
- `components/fixtures.ts` metrics fixture needs `sample` and `paHoursSaved` to satisfy the type.
- `origin/experience` still carries a stub `app/api/pharma/metrics/route.ts` (fixed numbers). The engine route must win in the main merge.

## Still pending

1. Shared-Supabase `rescue` run, final real timeline/alerts/metrics, and real `deny_pa` timing. The isolated timing is not representative of network performance.
2. Main integration and full browser test with Person B's portals.
3. Person C's seed: `origin/integration` (769541b) has the five approved static patients (James/Bridge, Lucía/PAP, Darnell/Cash Pay, Hoa/Quick Start `pa_pending`, Ruth/retail copay card; four on therapy, none at risk, no alerts/events). It is **not merged to main and not loaded**: `db:check` shows 1 patient. Person C must merge it, then run the updated `schema.sql` followed by `seed.sql` in the SQL editor. These rows add program-mix and rural-share data but, having no `onTherapy` events, add no rescues, durations or PA hours. That is intended; no counts are fabricated.
4. The exact cause of Varnika's fallback requires her server log. Local older logs and the first verification run show repeated Grok timeouts. The original template mismatch came from matching `type 2 diabetes` in the cardiovascular indication before the glycemic indication.

## Run the live rescue test

Post in team chat and wait ten minutes:

> Running demo:reset in 10 min for the engine end-to-end test. Save anything you need.

Then, with the server running:

```sh
npm run rescue -- --reset-confirmed
```

This script performs the scenario writes through HTTP and uses Supabase only for verification reads. It prints PASS/FAIL, day, final metrics, timeline titles, alert resolution flags, and route timings. It refuses to reset unless the explicit flag is supplied.

Fixture handoff for Vedant: `patientComms.json` messages use `{ to, lang, body }`, with `to: "patient"`, `"caregiver1"`, etc. The fixture is absent on this branch; deterministic templates cover demo mode.

The simulated payer, Medvantx, and Visa remain mocks. This is a synthetic-data demo, not a production clinical or payment deployment.
