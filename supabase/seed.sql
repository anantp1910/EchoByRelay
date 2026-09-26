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

insert into patients (id, name, language, zip, rural, insured, plan_id, income_band, on_drug_before, is_seed)
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
  is_seed        = excluded.is_seed;

-- Ana: Maria's daughter, in the care circle, able to pay (Visa checkout later).
insert into care_circle (id, patient_id, name, relation, can_pay, is_seed)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Ana González',
  'daughter',
  true,
  true
)
on conflict (id) do update set
  patient_id = excluded.patient_id,
  name       = excluded.name,
  relation   = excluded.relation,
  can_pay    = excluded.can_pay,
  is_seed    = excluded.is_seed;

-- Demo clock starts at day 0.
insert into demo_state (id, day)
values (1, 0)
on conflict (id) do update set day = 0;
