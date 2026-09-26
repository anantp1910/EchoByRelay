// STUB — replaced in A2..A6 (real watchdog / demo control lands in A7).
//
// POST /api/demo  { action, day? } -> { day }
//
// Drives the demo clock. When Supabase env is present it uses lib/clock.ts to
// persist the day; otherwise it echoes a plausible day so the panel still works
// before keys arrive. The payer/watchdog actions (deny_pa, approve_pa,
// no_pickup) don't move the clock in this stub — they'll trigger agent work in
// A7 — so they just return the current day.

import type { NextRequest } from "next/server";

import { DemoReqSchema, errorResponse, jsonResponse } from "@/lib/api/contracts";
import type { DemoAction } from "@/lib/api/contracts";

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function applyViaClock(action: DemoAction, day?: number): Promise<number | null> {
  if (!hasSupabaseEnv()) return null;
  try {
    const clock = await import("@/lib/clock");
    switch (action) {
      case "reset":
        return (await clock.setDay(0)).day;
      case "jump":
        return (await clock.setDay(day as number)).day;
      case "advance":
        return (await clock.advance(day ?? 1)).day;
      default:
        return (await clock.now()).day;
    }
  } catch (err) {
    console.warn("demo clock failed:", err);
    return null;
  }
}

function fallbackDay(action: DemoAction, day?: number): number {
  switch (action) {
    case "reset":
      return 0;
    case "jump":
      return day as number;
    case "advance":
      return day ?? 1;
    default:
      return 0;
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorResponse("validation_error", "Request body must be valid JSON");
  }

  const parsed = DemoReqSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse("validation_error", parsed.error.message);
  }
  const { action, day } = parsed.data;

  const viaClock = await applyViaClock(action, day);
  const resultDay = viaClock ?? fallbackDay(action, day);

  return jsonResponse({ day: resultDay });
}
