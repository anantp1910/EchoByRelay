-- Person C owns this file from now on. Keep the IDs in lib/demo/constants.ts.
--
-- MINIMAL seed (agreed engine/Person C exception): just enough for the Maria
-- demo to start. Everything the demo produces (prescription, coverage, PA,
-- enrollment, order, payment, alerts, events) is created live as non-seed rows.
--
-- Idempotent: safe to re-run in the Supabase SQL editor. All rows use the fixed
-- IDs from lib/demo/constants.ts and set is_seed = true.
--   MARIA_ID      = 11111111-1111-1111-1111-111111111111
--   ANA_ID        = 22222222-2222-2222-2222-222222222222
--   MARIA_PLAN_ID = 33333333-3333-3333-3333-333333333333
--
-- Maria: Spanish-speaking, rural South Georgia (ZIP 39840, Blakely GA),
-- insured, income above the PAP limit, already on Jardiance (on_drug_before = true).
-- Her new plan requires prior authorization, so this is a "continue therapy" case
-- -> the router will send her to the Medvantx Bridge program. That is our demo choice.

insert into patients (id, name, language, zip, rural, insured, plan_id, income_band, on_drug_before, conditions, is_seed)
values (
  '11111111-1111-1111-1111-111111111111',
  'Maria González',
  'es',
  '39840',
  true,
  true,
  '33333333-3333-3333-3333-333333333333',
  'above_pap',
  true,
  '{"type 2 diabetes mellitus","heart failure with reduced ejection fraction"}',
  true
)
on conflict (id) do update set
  name           = excluded.name,
  language       = excluded.language,
  zip            = excluded.zip,
  rural          = excluded.rural,
  insured        = excluded.insured,
  plan_id        = excluded.plan_id,
  income_band    = excluded.income_band,
  on_drug_before = excluded.on_drug_before,
  conditions     = excluded.conditions,
  is_seed        = excluded.is_seed;

-- Ana: Maria's daughter, in the care circle, able to pay (Visa checkout later).
-- English-speaking: her messages are in English while Maria's are in Spanish.
insert into care_circle (id, patient_id, name, relation, can_pay, lang, is_seed)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Ana González',
  'daughter',
  true,
  'en',
  true
)
on conflict (id) do update set
  patient_id = excluded.patient_id,
  name       = excluded.name,
  relation   = excluded.relation,
  can_pay    = excluded.can_pay,
  lang       = excluded.lang,
  is_seed    = excluded.is_seed;

-- ============================================================================
-- Background panel: 5 static patients, one per Medvantx program.
--
-- Each patient's inputs are chosen so route() in lib/agents/router.ts would
-- pick the same program. Days are demo-clock days; negative = before the demo.
-- These rows are history only: NO alerts, agent_events, audit_log, messages,
-- or payments, so Maria's day-24 alert stays the only one in the demo.
--
-- WATCHDOG NOTE: the watchdog must skip is_seed = true rows. Hoa's PA is
-- 'submitted' and must never be decided/denied by the demo. No active
-- enrollment ends before day 87, so no bridge-cliff can fire from these.
--
--   ID prefixes: patients 44444444, plans 55555555, prescriptions 66666666,
--   coverage 77777777, pa 88888888, enrollments 99999999, orders aaaaaaaa.
--   Suffix ...01 James, 02 Lucía, 03 Darnell, 04 Hoa, 05 Ruth.
--
--   James Whitfield  bridge            on_therapy (PA approved, bridge ended)
--   Lucía Herrera    pap               on_therapy
--   Darnell Brooks   cash_pay          on_therapy
--   Hoa Nguyen       quick_start       pa_pending (free Quick Start supply)
--   Ruth Ellison     retail_copay_card on_therapy
-- ============================================================================

insert into patients (id, name, language, zip, rural, insured, plan_id, income_band, on_drug_before, conditions, is_seed)
values
  -- Waycross GA (rural). Insured, plan change requires PA, already on Eliquis -> bridge.
  ('44444444-0000-0000-0000-000000000001', 'James Whitfield', 'en', '31501', true,  true,
   '55555555-0000-0000-0000-000000000001', 'above_pap', true,
   '{"atrial fibrillation","hypertension"}', true),
  -- Dalton GA. Uninsured, low income -> PAP.
  ('44444444-0000-0000-0000-000000000002', 'Lucía Herrera', 'es', '30721', false, false,
   null, 'low', false,
   '{"rheumatoid arthritis"}', true),
  -- Atlanta GA. Uninsured, above PAP limit -> Cash Pay.
  ('44444444-0000-0000-0000-000000000003', 'Darnell Brooks', 'en', '30310', false, false,
   null, 'mid', false,
   '{"heart failure with reduced ejection fraction","hypertension"}', true),
  -- Norcross GA. Insured, PA required, new to therapy -> Quick Start.
  -- Vietnamese-speaking in the story, but schema allows only es/en.
  ('44444444-0000-0000-0000-000000000004', 'Hoa Nguyen', 'en', '30093', false, true,
   '55555555-0000-0000-0000-000000000004', 'mid', false,
   '{"chronic obstructive pulmonary disease"}', true),
  -- Vidalia GA (rural). Insured, covered without PA, $85 copay (> $50) -> copay card.
  ('44444444-0000-0000-0000-000000000005', 'Ruth Ellison', 'en', '30474', true,  true,
   '55555555-0000-0000-0000-000000000005', 'mid', true,
   '{"chronic kidney disease stage 3","type 2 diabetes mellitus"}', true)
on conflict (id) do update set
  name           = excluded.name,
  language       = excluded.language,
  zip            = excluded.zip,
  rural          = excluded.rural,
  insured        = excluded.insured,
  plan_id        = excluded.plan_id,
  income_band    = excluded.income_band,
  on_drug_before = excluded.on_drug_before,
  conditions     = excluded.conditions,
  is_seed        = excluded.is_seed;

insert into prescriptions (id, patient_id, drug, dose, frequency, indication, status, program, expected_delivery_day, is_seed)
values
  ('66666666-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001',
   'Eliquis', '5 mg', 'twice daily', 'nonvalvular atrial fibrillation',
   'on_therapy', 'bridge', -44, true),
  ('66666666-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002',
   'Enbrel', '50 mg', 'once weekly', 'rheumatoid arthritis',
   'on_therapy', 'pap', -56, true),
  ('66666666-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003',
   'Entresto', '49 mg/51 mg', 'twice daily', 'chronic heart failure with reduced ejection fraction',
   'on_therapy', 'cash_pay', -28, true),
  ('66666666-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000004',
   'Trelegy Ellipta', '100/62.5/25 mcg', 'one inhalation once daily', 'chronic obstructive pulmonary disease',
   'pa_pending', 'quick_start', -1, true),
  ('66666666-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000005',
   'Farxiga', '10 mg', 'once daily', 'chronic kidney disease',
   'on_therapy', 'retail_copay_card', -88, true)
on conflict (id) do update set
  patient_id            = excluded.patient_id,
  drug                  = excluded.drug,
  dose                  = excluded.dose,
  frequency             = excluded.frequency,
  indication            = excluded.indication,
  status                = excluded.status,
  program               = excluded.program,
  expected_delivery_day = excluded.expected_delivery_day,
  is_seed               = excluded.is_seed;

-- Insured patients only.
insert into coverage_checks (id, rx_id, pa_required, copay_usd, tier, is_seed)
values
  ('77777777-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', true,  395.00, 3, true),
  ('77777777-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004', true,  140.00, 3, true),
  ('77777777-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000005', false,  85.00, 3, true)
on conflict (id) do update set
  rx_id       = excluded.rx_id,
  pa_required = excluded.pa_required,
  copay_usd   = excluded.copay_usd,
  tier        = excluded.tier,
  is_seed     = excluded.is_seed;

-- Stub letters only; real letters are drafted live by paDrafter for Maria.
insert into pa_requests (id, rx_id, letter_md, citations, status, decided_at, is_seed)
values
  ('88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001',
   'Prior authorization request for Eliquis 5 mg twice daily (nonvalvular atrial fibrillation). Seed record.',
   '[]', 'approved', now() - interval '16 days', true),
  ('88888888-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004',
   'Prior authorization request for Trelegy Ellipta once daily (COPD). Seed record.',
   '[]', 'submitted', null, true)
on conflict (id) do update set
  rx_id      = excluded.rx_id,
  letter_md  = excluded.letter_md,
  citations  = excluded.citations,
  status     = excluded.status,
  decided_at = excluded.decided_at,
  is_seed    = excluded.is_seed;

-- No active enrollment ends before day 87 (keeps the day-24 watchdog quiet).
insert into enrollments (id, rx_id, program, start_day, end_day, status, is_seed)
values
  ('99999999-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', 'bridge',            -45, -16, 'ended',  true),
  ('99999999-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', 'pap',               -60, 305, 'active', true),
  ('99999999-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003', 'cash_pay',          -30, null, 'active', true),
  ('99999999-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004', 'quick_start',        -3,  87, 'active', true),
  ('99999999-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000005', 'retail_copay_card', -90, 275, 'active', true)
on conflict (id) do update set
  rx_id      = excluded.rx_id,
  program    = excluded.program,
  start_day  = excluded.start_day,
  end_day    = excluded.end_day,
  status     = excluded.status,
  is_seed    = excluded.is_seed;

-- All delivered, so no no-pickup alert can fire. Free programs are $0.
insert into orders (id, rx_id, enrollment_id, amount_usd, status, is_seed)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001',   0.00, 'delivered', true),
  ('aaaaaaaa-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', '99999999-0000-0000-0000-000000000002',   0.00, 'delivered', true),
  ('aaaaaaaa-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000003', '99999999-0000-0000-0000-000000000003', 325.00, 'delivered', true),
  ('aaaaaaaa-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000004', '99999999-0000-0000-0000-000000000004',   0.00, 'delivered', true),
  ('aaaaaaaa-0000-0000-0000-000000000005', '66666666-0000-0000-0000-000000000005', '99999999-0000-0000-0000-000000000005',  10.00, 'delivered', true)
on conflict (id) do update set
  rx_id         = excluded.rx_id,
  enrollment_id = excluded.enrollment_id,
  amount_usd    = excluded.amount_usd,
  status        = excluded.status,
  is_seed       = excluded.is_seed;

-- Demo clock starts at day 0.
insert into demo_state (id, day)
values (1, 0)
on conflict (id) do update set day = 0;
