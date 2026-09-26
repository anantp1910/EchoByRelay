// Fixed identifiers for the Maria demo. These UUIDs are the single source of
// truth: supabase/seed.sql hard-codes the same values (SQL cannot import TS),
// so if you change one here, change it in seed.sql too. scripts/db-check.ts
// verifies the seeded rows against these constants.

export const MARIA_ID = "11111111-1111-1111-1111-111111111111";
export const ANA_ID = "22222222-2222-2222-2222-222222222222";
export const MARIA_PLAN_ID = "33333333-3333-3333-3333-333333333333";

// Demo drug. Empagliflozin (Jardiance) is a real branded therapy for type 2
// diabetes with heart failure and has a public FDA label (used later by the PA
// drafter in Phase 4). Dose/frequency match DEMO_PHRASE.
export const DEMO_DRUG = {
  name: "Jardiance",
  genericName: "empagliflozin",
  dose: "10 mg",
  frequency: "once daily",
  indication: "type 2 diabetes with heart failure",
} as const;

// The one sentence the doctor speaks to start the demo. Maria is already on
// Jardiance; her new insurance requires prior authorization, so this is a
// "continue therapy" case that routes to the Medvantx Bridge program.
export const DEMO_PHRASE = `Continue Maria on ${DEMO_DRUG.name}, 10 mg daily`;
