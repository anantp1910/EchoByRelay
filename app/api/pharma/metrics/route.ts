import { PharmaMetricsResSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import { calculateMetrics, type MetricsRows } from "@/lib/pharma/metrics";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const { db } = await import("@/lib/db/server");
    // Paginate so Supabase's default row limit never silently caps demo history.
    async function all(table: string, columns: string) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from(table).select(columns).order("id").range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) return rows;
      }
    }
    const [prescriptions, patients, alerts, enrollments, events] = await Promise.all([
      all("prescriptions", "id,status,created_at,is_seed"), all("patients", "rural"),
      all("alerts", "rx_id,kind,created_at"), all("enrollments", "rx_id,program,start_day"),
      all("agent_events", "rx_id,created_at,data"),
    ]);
    const rows = { prescriptions, patients, alerts, enrollments, events } as unknown as MetricsRows;
    rows.events.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return jsonResponse(PharmaMetricsResSchema.parse(calculateMetrics(rows)));
  } catch (err) {
    return errorResponse("internal", err instanceof Error ? err.message : "Could not load metrics");
  }
}
