import {
  ENROLLMENT_PROGRAMS,
  type EnrollmentProgram,
  type Patient,
  type PrescriptionStatus,
} from "@/lib/db/types";
import { textCall } from "@/lib/llm/grok";
import type { AgentContext } from "./context";

// Router. The decision (route) is PURE deterministic code implementing
// BUILD_PLAN §2.3 — the LLM never decides, it only writes the human
// explanation from the reasons. route() has no server-only deps so it's unit
// testable (scripts/router-cases.ts).

// Engine-internal program space: adds "retail" and "escalate", which are NOT
// enrollable (no enrollments row). Kept out of the shared DB contract.
export type RouterProgram = EnrollmentProgram | "retail" | "escalate";

export interface CoverageInput {
  paRequired: boolean;
  copayUsd: number;
  tier: number;
}

export interface RouteResult {
  program: RouterProgram;
  reasons: string[];
}

export interface RouteOptions {
  paDenied?: boolean;
}

// The demo drug offers a Cash Pay self-pay price.
const CASH_PAY_AVAILABLE = true;

function incomeWithinPap(band: string | null | undefined): boolean {
  return band === "low";
}

/** Pure deterministic router (BUILD_PLAN §2.3), plus the post-PA-denial reroute. */
export function route(
  patient: Pick<Patient, "insured" | "on_drug_before" | "income_band">,
  coverage: CoverageInput,
  opts: RouteOptions = {}
): RouteResult {
  const insured = Boolean(patient.insured);
  const paRequired = Boolean(coverage.paRequired);
  const copay = coverage.copayUsd ?? 0;
  const onDrug = Boolean(patient.on_drug_before);
  const band = patient.income_band;
  const paDenied = Boolean(opts.paDenied);

  // Post-denial reroute for an insured patient whose PA was denied.
  if (paDenied && insured) {
    if (incomeWithinPap(band)) {
      return {
        program: "pap",
        reasons: [
          "Prior authorization was denied",
          "Household income is within the PAP limit — the Patient Assistance Program provides the drug at no cost",
        ],
      };
    }
    return {
      program: "cash_pay",
      reasons: [
        "Prior authorization was denied and the insured path is exhausted",
        "Above the PAP income limit — Medvantx Cash Pay offers a discounted self-pay price",
      ],
    };
  }

  // §2.3, in order.
  if (insured && !paRequired && copay <= 50) {
    return {
      program: "retail",
      reasons: [
        "Drug is covered with no prior authorization required",
        `Copay is $${copay} (≤ $50) — fill at a retail pharmacy`,
      ],
    };
  }
  if (insured && paRequired && onDrug) {
    return {
      program: "bridge",
      reasons: [
        "Insured, but the new plan requires prior authorization",
        "Patient is already on therapy — a Bridge supply prevents a gap while the PA is processed",
      ],
    };
  }
  if (insured && paRequired && !onDrug) {
    return {
      program: "quick_start",
      reasons: [
        "Insured with a prior-authorization requirement",
        "New to therapy — Quick Start begins treatment today",
      ],
    };
  }
  if (incomeWithinPap(band)) {
    return {
      program: "pap",
      reasons: [
        "Household income is within the manufacturer PAP limit",
        "Patient Assistance Program provides the drug at no cost",
      ],
    };
  }
  if (!insured && CASH_PAY_AVAILABLE) {
    return {
      program: "cash_pay",
      reasons: [
        "Patient is uninsured and above the PAP limit",
        "Manufacturer Cash Pay offers a discounted self-pay price",
      ],
    };
  }
  if (insured && copay > 50) {
    return {
      program: "retail_copay_card",
      reasons: [
        `Drug is covered but the copay is $${copay} (> $50)`,
        "A manufacturer copay card reduces the out-of-pocket cost",
      ],
    };
  }
  return {
    program: "escalate",
    reasons: ["No standard access path applies", "Escalating to the doctor for a manual decision"],
  };
}

/** Prescription status once enrolled. Never on_therapy before the patient has the medicine. */
export function statusForProgram(program: RouterProgram): PrescriptionStatus {
  switch (program) {
    case "bridge":
    case "quick_start":
      return "bridge";
    default:
      // pap, cash_pay, retail_copay_card, retail, escalate stay routing until
      // the order is paid/delivered (A5/A6).
      return "routing";
  }
}

const PROGRAM_TITLES: Record<RouterProgram, string> = {
  bridge: "Recommended: Medvantx Bridge",
  quick_start: "Recommended: Medvantx Quick Start",
  pap: "Recommended: Patient Assistance Program",
  cash_pay: "Recommended: Medvantx Cash Pay",
  retail_copay_card: "Recommended: Retail with copay card",
  retail: "Recommended: Fill at retail pharmacy",
  escalate: "Doctor review needed",
};

const EXPLAIN_SYSTEM = `You write ONE short paragraph (2-3 sentences), in plain language a patient could understand, explaining why this medication-access path was chosen. Use ONLY the reasons provided. Do not add clinical claims, statistics, or any fact that is not in the reasons.`;

async function explain(program: RouterProgram, reasons: string[]): Promise<string> {
  try {
    const text = await textCall(
      [
        { role: "system", content: EXPLAIN_SYSTEM },
        {
          role: "user",
          content: `Path: ${program}\nReasons:\n${reasons.map((r) => `- ${r}`).join("\n")}`,
        },
      ],
      { model: "fast", fixtureKey: "router", timeoutMs: 10_000 }
    );
    return text.trim() || reasons.join(" ");
  } catch {
    return reasons.join(" ");
  }
}

/**
 * Router agent: decide (pure), explain (Grok/fallback), then emit. Enrollable
 * programs emit a needs_approval card; "escalate" emits a done event plus an
 * alert for the doctor's inbox. The decision is real, so simulated=false.
 */
export async function router(
  patient: Patient,
  coverage: CoverageInput,
  ctx: AgentContext,
  opts: RouteOptions = {}
): Promise<RouteResult> {
  const { program, reasons } = route(patient, coverage, opts);
  const rxId = ctx.rxId;
  const s = await ctx.step("router", "Choosing an access path…", {
    detail: "Applying the deterministic coverage rules.",
  });

  try {
    const detail = await explain(program, reasons);

    if (program === "escalate") {
      await s.done(PROGRAM_TITLES.escalate, detail, { program, rxId });
      // Alert for the doctor's inbox. Own try/catch so an alert failure does not
      // re-block the (successful) routing step. Dynamic import keeps route()
      // importable outside Next (test:router).
      try {
        const { db } = await import("@/lib/db/server");
        const { error } = await db.from("alerts").insert({
          rx_id: rxId,
          kind: "escalation",
          severity: "warning",
          resolved: false,
          is_seed: false,
        });
        if (error) console.warn(`[router] escalation alert insert failed: ${error.message}`);
      } catch (err) {
        console.warn("[router] escalation alert insert threw:", err);
      }
      return { program, reasons };
    }

    const action = (ENROLLMENT_PROGRAMS as readonly string[]).includes(program)
      ? "enroll"
      : "fill_retail";
    await s.needsApproval(PROGRAM_TITLES[program], detail, { action, program, rxId });
    return { program, reasons };
  } catch (err) {
    await s.blocked("Routing failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}
