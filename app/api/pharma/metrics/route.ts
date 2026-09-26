// STUB — replaced in A2..A6 (real dashboard queries land in Phase 8).
//
// GET /api/pharma/metrics -> KPI + chart data
//
// Returns realistic fake numbers so Person B can build the pharma dashboard now.
// Replaced later by real queries over seed + live data.

import { PharmaMetricsResSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const body = {
    scriptsRescued: 42,
    medianDaysToTherapy: 3.5,
    bridgeCliffsCaught: 7,
    pctUnderserved: 61,
    rescuedSeries: [
      { day: 0, count: 2 },
      { day: 6, count: 9 },
      { day: 12, count: 18 },
      { day: 18, count: 28 },
      { day: 24, count: 42 },
    ],
    programMix: [
      { program: "bridge", count: 11 },
      { program: "quick_start", count: 14 },
      { program: "pap", count: 6 },
      { program: "cash_pay", count: 8 },
      { program: "retail_copay_card", count: 3 },
    ],
  };

  const check = PharmaMetricsResSchema.safeParse(body);
  if (!check.success) {
    return errorResponse("internal", "pharma metrics stub failed its own schema");
  }

  return jsonResponse(check.data);
}
