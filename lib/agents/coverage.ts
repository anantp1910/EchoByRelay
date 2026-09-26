import "server-only";

import { db } from "@/lib/db/server";
import { checkCoverage, type CoverageQuote } from "@/lib/mocks/payer";
import { DEMO_DRUG } from "@/lib/demo/constants";
import type { Patient } from "@/lib/db/types";
import type { AgentContext } from "./context";

// Coverage agent: run the (mock) payer check, persist a coverage_checks row, and
// stream the result. Mock-backed, so events are simulated=true.

export async function coverage(patient: Patient, ctx: AgentContext): Promise<CoverageQuote> {
  await ctx.emit({
    agent: "coverage",
    status: "running",
    title: "Checking coverage…",
    detail: "Verifying the plan's requirements.",
    simulated: true,
  });

  const quote = checkCoverage(patient, DEMO_DRUG.name);

  if (ctx.rxId) {
    const { error } = await db.from("coverage_checks").insert({
      rx_id: ctx.rxId,
      pa_required: quote.paRequired,
      copay_usd: quote.copayUsd,
      tier: quote.tier,
      is_seed: false,
    });
    if (error) {
      throw new Error(`coverage_checks insert failed: ${error.message}`);
    }
  }

  const title = `${quote.paRequired ? "PA required" : "Covered"} · $${quote.copayUsd} copay`;
  await ctx.emit({
    agent: "coverage",
    status: "done",
    title,
    detail: `Formulary tier ${quote.tier}`,
    simulated: true,
  });

  return quote;
}
