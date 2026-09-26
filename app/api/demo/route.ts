import { DemoReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";

export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  let raw: unknown;
  try { raw = await request.json(); } catch { return errorResponse("validation_error", "Request body must be valid JSON"); }
  const parsed = DemoReqSchema.safeParse(raw);
  if (!parsed.success) return errorResponse("validation_error", parsed.error.message);
  if (parsed.data.day !== undefined && parsed.data.day < 0) return errorResponse("validation_error", "Demo day cannot be negative");
  try {
    const { runDemoAction } = await import("@/lib/demo/actions");
    return jsonResponse(await runDemoAction(parsed.data));
  } catch (err) {
    return errorResponse("internal", err instanceof Error ? err.message : "Demo action failed");
  }
}
