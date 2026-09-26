// Sample check-ins for Maria (synthetic). Stand-ins until the check_ins table
// exists; the day-21 answers feed the day-24 story (low supply + cost worry).

import { FIXTURE_MARIA_RX_ID } from "@/components/fixtures";
import { ANA_ID, MARIA_ID } from "@/lib/demo/constants";

import { flagsFor } from "./questions";
import type { CheckIn, CheckInAnswers } from "./types";

const fx = (n: number) => `f1c70000-0000-4000-8000-${String(600 + n).padStart(12, "0")}`;
const T0 = Date.parse("2026-09-26T14:00:00.000Z");

function sample(day: number, answers: CheckInAnswers, by: string | null, lang: "es" | "en"): CheckIn {
  return {
    id: fx(day),
    prescription_id: FIXTURE_MARIA_RX_ID,
    patient_id: MARIA_ID,
    day,
    answers,
    flags: flagsFor(answers),
    submitted_by_member_id: by,
    lang,
    created_at: new Date(T0 + day * 86_400_000).toISOString(),
    is_seed: true,
  };
}

export const FIXTURE_CHECKINS: CheckIn[] = [
  sample(3, { arrived: "yes" }, null, "es"),
  sample(7, { takingDaily: "yes", sideEffects: ["none"] }, null, "es"),
  sample(14, { feeling: "good" }, null, "es"),
  // Ana answers for her mother on day 21 → ["low_supply", "cost_concern"].
  sample(21, { pillsLeft: "few", costWorry: "yes" }, ANA_ID, "en"),
];
