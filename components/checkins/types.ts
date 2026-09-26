// PROPOSED — mirrors a check_ins table that does not exist yet. Move to
// lib/db/types.ts when Anant adds the table (with a team-chat heads-up, per
// CLAUDE.md hard rule #11).
//
//   check_ins(id, prescription_id, patient_id, day int, answers jsonb,
//             flags text[], submitted_by_member_id nullable, lang,
//             created_at, is_seed)

import type { Language } from "@/lib/db/types";

export const CHECKIN_FLAGS = ["low_supply", "cost_concern", "severe_symptom"] as const;
export type CheckInFlag = (typeof CHECKIN_FLAGS)[number];

export type YesNo = "yes" | "no";
export type Feeling = "good" | "okay" | "bad";
export type PillsLeft = "many" | "some" | "few";

/** answers jsonb. Each scheduled day fills a subset. */
export interface CheckInAnswers {
  arrived?: YesNo; // day 3
  takingDaily?: YesNo; // day 7
  sideEffects?: string[]; // day 7 — SIDE_EFFECTS ids, "none" or "other"
  feeling?: Feeling; // day 14
  pillsLeft?: PillsLeft; // day 21
  costWorry?: YesNo; // day 21
  voiceNote?: string; // optional, any day
}

export interface CheckIn {
  id: string;
  prescription_id: string | null;
  patient_id: string;
  day: number;
  answers: CheckInAnswers;
  flags: CheckInFlag[];
  submitted_by_member_id: string | null; // null = the patient
  lang: Language;
  created_at: string;
  is_seed: boolean;
}

/** Client-side view: a check-in plus whether it reached the server. */
export interface CheckInView extends CheckIn {
  source: "sample" | "session";
  synced: boolean;
}
