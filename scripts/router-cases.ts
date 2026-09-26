// npm run test:router
// Asserts the pure deterministic router (BUILD_PLAN §2.3) over a spread of
// profiles, including the post-PA-denial reroute. No DB, no LLM — imports only
// route() from lib/agents/router.ts. Non-zero exit on any mismatch.

import { route, type RouteOptions, type RouterProgram } from "../lib/agents/router";

interface PatientLike {
  insured: boolean;
  on_drug_before: boolean;
  income_band: "low" | "mid" | "above_pap" | null;
}
interface Coverage {
  paRequired: boolean;
  copayUsd: number;
  tier: number;
}
interface Case {
  label: string;
  patient: PatientLike;
  coverage: Coverage;
  opts?: RouteOptions;
  expect: RouterProgram;
}

const CASES: Case[] = [
  {
    label: "Maria: insured, PA, on therapy",
    patient: { insured: true, on_drug_before: true, income_band: "above_pap" },
    coverage: { paRequired: true, copayUsd: 480, tier: 3 },
    expect: "bridge",
  },
  {
    label: "insured, PA, new to therapy",
    patient: { insured: true, on_drug_before: false, income_band: "above_pap" },
    coverage: { paRequired: true, copayUsd: 480, tier: 3 },
    expect: "quick_start",
  },
  {
    label: "low income (uninsured)",
    patient: { insured: false, on_drug_before: false, income_band: "low" },
    coverage: { paRequired: false, copayUsd: 0, tier: 0 },
    expect: "pap",
  },
  {
    label: "uninsured, above PAP",
    patient: { insured: false, on_drug_before: false, income_band: "above_pap" },
    coverage: { paRequired: false, copayUsd: 0, tier: 0 },
    expect: "cash_pay",
  },
  {
    label: "covered, cheap",
    patient: { insured: true, on_drug_before: false, income_band: "mid" },
    coverage: { paRequired: false, copayUsd: 10, tier: 1 },
    expect: "retail",
  },
  {
    label: "covered, expensive",
    patient: { insured: true, on_drug_before: false, income_band: "mid" },
    coverage: { paRequired: false, copayUsd: 250, tier: 2 },
    expect: "retail_copay_card",
  },
  {
    label: "Maria + PA denied -> cash_pay",
    patient: { insured: true, on_drug_before: true, income_band: "above_pap" },
    coverage: { paRequired: true, copayUsd: 480, tier: 3 },
    opts: { paDenied: true },
    expect: "cash_pay",
  },
  {
    label: "low-income insured + PA denied -> pap",
    patient: { insured: true, on_drug_before: true, income_band: "low" },
    coverage: { paRequired: true, copayUsd: 480, tier: 3 },
    opts: { paDenied: true },
    expect: "pap",
  },
];

let failures = 0;
for (const c of CASES) {
  const { program } = route(c.patient, c.coverage, c.opts);
  const ok = program === c.expect;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.label.padEnd(36)} expected=${c.expect.padEnd(18)} got=${program}`
  );
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
