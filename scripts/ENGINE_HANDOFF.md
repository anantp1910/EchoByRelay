# Engine handoff: A5.1 and A6

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

## Still pending

1. Shared-Supabase `rescue` run, final real timeline/alerts/metrics, and real `deny_pa` timing. The isolated timing is not representative of network performance.
2. Main integration and full browser test with Person B's portals.
3. Person C's historical seed dataset: the shared DB currently contains Maria and Ana, not six patients plus 40 historical prescriptions. Historical metric fixtures should include agent events with `data: { day, onTherapy: true, rescued }` and a start-day event or enrollment. No counts are fabricated.
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
