// POST /api/alerts/[id]/resolve -> marks the alert resolved (idempotent) -> { ok: true }

import { OkResSchema, Uuid, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const dynamic = "force-dynamic";

function hasServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  if (!Uuid.safeParse(id).success) {
    return errorResponse("validation_error", "alert id must be a valid UUID");
  }
  if (!hasServerEnv()) {
    return errorResponse("internal", "Alerts are temporarily unavailable");
  }

  const { db } = await import("@/lib/db/server");
  const { data: alert, error } = await db.from("alerts").select("id").eq("id", id).maybeSingle();
  if (error) return errorResponse("internal", error.message);
  if (!alert) return errorResponse("not_found", "Alert not found");

  // Idempotent: setting resolved=true again is a no-op.
  const { error: updErr } = await db.from("alerts").update({ resolved: true }).eq("id", id);
  if (updErr) return errorResponse("internal", updErr.message);

  return jsonResponse(OkResSchema.parse({ ok: true }));
}
