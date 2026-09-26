// GET /api/pa/[rxId] -> { status, letterMd, citations[] }  (Phase 4)
//
// Returns the latest pa_request for the prescription, per the contract. 404 if
// no PA has been drafted yet. Next.js 16: dynamic `params` is a Promise.

import { PaResSchema, Uuid, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ rxId: string }> }
): Promise<Response> {
  const { rxId } = await params;

  if (!Uuid.safeParse(rxId).success) {
    return errorResponse("validation_error", "rxId must be a valid UUID");
  }
  if (!hasServerEnv()) {
    return errorResponse("not_found", "No prior authorization for this prescription yet");
  }

  const { db } = await import("@/lib/db/server");
  const { data, error } = await db
    .from("pa_requests")
    .select("status, letter_md, citations")
    .eq("rx_id", rxId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return errorResponse("internal", error.message);
  }
  if (!data) {
    return errorResponse("not_found", "No prior authorization for this prescription yet");
  }

  const body = {
    status: data.status,
    letterMd: data.letter_md ?? "",
    citations: data.citations ?? [],
  };
  const check = PaResSchema.safeParse(body);
  if (!check.success) {
    return errorResponse("internal", `PA row failed the contract: ${check.error.message}`);
  }

  return jsonResponse(check.data);
}
