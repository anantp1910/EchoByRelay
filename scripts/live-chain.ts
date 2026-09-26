// npm run live:chain
// Full Maria chain against a running dev server WITHOUT resetting the shared DB:
//   intake -> wait router needs_approval -> approve (enroll)
//          -> wait paDrafter needs_approval -> approve (submit_pa)
// Then GET /api/pa/{rxId} and print the letter, citations, source + latency, and
// the final agent_events rows.
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

async function waitForEvent(
  rxId: string,
  agent: string,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  for (let i = 0; i < 70; i++) {
    const { data } = await db
      .from("agent_events")
      .select("id, data")
      .eq("rx_id", rxId)
      .eq("agent", agent)
      .eq("status", "needs_approval")
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      return { id: (data[0] as { id: string }).id, data: (data[0] as { data: Record<string, unknown> }).data ?? {} };
    }
    await sleep(1000);
  }
  return null;
}

async function main(): Promise<void> {
  // 1. intake
  const intake = await post("/api/intake", { patientId: MARIA_ID, transcript: DEMO_PHRASE });
  const rxId = (intake.json as { rxId?: string } | null)?.rxId;
  console.log(`1) POST /api/intake -> ${intake.status} rxId=${rxId}`);
  if (!rxId) process.exit(1);

  // 2. approve enroll
  const routerEvent = await waitForEvent(rxId, "router");
  if (!routerEvent) {
    console.error("router needs_approval never appeared");
    process.exit(1);
  }
  const enrollStart = Date.now();
  const a1 = await post("/api/approve", { eventId: routerEvent.id, decision: "approve", actor: "doctor", via: "voice" });
  console.log(`2) approve enroll (${routerEvent.data.program}) -> ${a1.status} in ${Date.now() - enrollStart}ms ${JSON.stringify(a1.json)}`);

  // 3. approve submit_pa (paDrafter runs in after(); wait for its needs_approval)
  const paEvent = await waitForEvent(rxId, "paDrafter");
  if (!paEvent) {
    console.error("paDrafter needs_approval never appeared");
    process.exit(1);
  }
  console.log(
    `3) paDrafter ready -> source=${paEvent.data.source} draftMs=${paEvent.data.draftMs} paRequestId=${paEvent.data.paRequestId}`
  );
  const a2 = await post("/api/approve", { eventId: paEvent.id, decision: "approve", actor: "doctor", via: "voice" });
  console.log(`4) approve submit_pa -> ${a2.status} ${JSON.stringify(a2.json)}`);
  await sleep(1500);

  // 4. fetch the PA letter
  const paRes = await fetch(`${BASE}/api/pa/${rxId}`);
  const pa = (await paRes.json()) as { status: string; letterMd: string; citations: { n: number; section: string; quote: string; url: string }[] };
  console.log(`\n===== PA (${paRes.status}) status=${pa.status} =====`);
  console.log(pa.letterMd);
  console.log(`\nprint page: ${BASE}/api/pa/${rxId}/print`);
  console.log(`\n----- citations (${pa.citations.length}) -----`);
  for (const c of pa.citations) {
    console.log(`  [${c.n}] ${c.section}: "${c.quote.slice(0, 60)}${c.quote.length > 60 ? "…" : ""}"`);
    console.log(`       ${c.url}`);
  }

  // 5. final events
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

  const { data: rx } = await db
    .from("prescriptions")
    .select("status,program,expected_delivery_day")
    .eq("id", rxId)
    .maybeSingle();
  console.log(`\nprescription: ${JSON.stringify(rx)}`);

  // Patient/family messages produced by patientComms.
  const { data: msgs } = await db
    .from("messages")
    .select("recipient_member_id, lang, body, created_at")
    .eq("patient_id", MARIA_ID)
    .order("created_at", { ascending: false })
    .limit(6);
  console.log(`\nmessages (latest ${msgs?.length ?? 0}):`);
  for (const m of (msgs ?? []).reverse()) {
    const who = m.recipient_member_id ? "care-circle" : "patient";
    console.log(`  [${String(m.lang).toUpperCase()} ${who}] ${m.body}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
