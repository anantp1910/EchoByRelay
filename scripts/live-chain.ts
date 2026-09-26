// npm run live:chain
// Drives one full Maria chain against a running dev server WITHOUT resetting the
// shared DB: intake -> wait for the router needs_approval event -> approve ->
// approve again (idempotent no-op) -> print the agent_events, the enrollment
// row, and the prescription status/program/expected_delivery_day/indication.
//
// Needs .env.local (service role for reads) and the dev server on :3000
// (override with LIVE_BASE_URL).

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { MARIA_ID, DEMO_PHRASE } from "../lib/demo/constants";

config({ path: ".env.local" });

const BASE = process.env.LIVE_BASE_URL ?? "http://localhost:3000";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
  return v;
}

const db = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function post(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function main(): Promise<void> {
  // 1. intake
  const intake = await post("/api/intake", { patientId: MARIA_ID, transcript: DEMO_PHRASE });
  const rxId = (intake.json as { rxId?: string } | null)?.rxId;
  console.log(`1) POST /api/intake -> ${intake.status} rxId=${rxId}`);
  if (!rxId) {
    console.error("No rxId returned.");
    process.exit(1);
  }

  // 2. wait for the router needs_approval event on this rx
  let eventId: string | undefined;
  for (let i = 0; i < 25; i++) {
    const { data } = await db
      .from("agent_events")
      .select("id")
      .eq("rx_id", rxId)
      .eq("agent", "router")
      .eq("status", "needs_approval")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      eventId = (data[0] as { id: string }).id;
      break;
    }
    await sleep(1000);
  }
  console.log(`2) router needs_approval eventId=${eventId ?? "(not found)"}`);
  if (!eventId) {
    process.exit(1);
  }

  // 3. approve
  const a1 = await post("/api/approve", { eventId, decision: "approve", actor: "doctor", via: "voice" });
  console.log(`3) POST /api/approve -> ${a1.status} ${JSON.stringify(a1.json)}`);
  await sleep(2500);

  const { data: before } = await db.from("agent_events").select("id").eq("rx_id", rxId);
  const countBefore = before?.length ?? 0;

  // 4. approve again — must be an idempotent no-op
  const a2 = await post("/api/approve", { eventId, decision: "approve", actor: "doctor", via: "voice" });
  console.log(`4) POST /api/approve again -> ${a2.status} ${JSON.stringify(a2.json)}`);
  await sleep(1000);
  const { data: after } = await db.from("agent_events").select("id").eq("rx_id", rxId);
  const countAfter = after?.length ?? 0;
  console.log(
    `   event count ${countBefore} -> ${countAfter} (${countBefore === countAfter ? "no duplicates" : "DUPLICATED"})`
  );

  // 5. results
  const { data: events } = await db
    .from("agent_events")
    .select("agent,status,title,simulated")
    .eq("rx_id", rxId)
    .order("created_at");
  console.log(`\nagent_events (${events?.length ?? 0}):  [agent | status | sim | title]`);
  for (const e of events ?? []) {
    console.log(
      `  ${String(e.agent).padEnd(9)} | ${String(e.status).padEnd(15)} | ${String(e.simulated).padEnd(5)} | ${e.title}`
    );
  }

  const { data: enrollment } = await db
    .from("enrollments")
    .select("program,status,start_day,end_day")
    .eq("rx_id", rxId);
  console.log(`\nenrollment: ${JSON.stringify(enrollment)}`);

  const { data: rx } = await db
    .from("prescriptions")
    .select("status,program,expected_delivery_day,drug,dose,frequency,indication")
    .eq("id", rxId)
    .maybeSingle();
  console.log(`prescription: ${JSON.stringify(rx)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
