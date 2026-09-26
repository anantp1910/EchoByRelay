// Destructive shared-demo test. Warn the team 10 minutes before using --reset-confirmed.
// All scenario writes go through HTTP; Supabase is used only to verify state.
import assert from "node:assert/strict";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { MARIA_ID, ANA_ID, DEMO_PHRASE } from "../lib/demo/constants";
import { PharmaMetricsResSchema } from "../lib/api/contracts";

config({ path: ".env.local", quiet: true });
const base = process.env.LIVE_BASE_URL ?? "http://localhost:3000";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let day = 0;
let rxId = "";
const times: { route: string; ms: number }[] = [];

async function http(path: string, body?: unknown, method = "POST", status = 200) {
  const start = performance.now();
  const res = await fetch(`${base}${path}`, {
    method, headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000),
  });
  const json = await res.json();
  const ms = Math.round(performance.now() - start);
  times.push({ route: path === "/api/demo" ? `${path} ${JSON.stringify(body)}` : path, ms });
  assert.equal(res.status, status, `${path}: ${JSON.stringify(json)}`);
  if (typeof json.day === "number") day = json.day;
  console.log(`PASS day=${day} ${method} ${path} ${ms}ms`);
  return json;
}

async function rows(table: string, columns = "*") {
  const { data, error } = await db.from(table).select(columns).eq(table === "prescriptions" ? "id" : "rx_id", rxId).order("created_at");
  if (error) throw new Error(error.message);
  return data as unknown as Record<string, unknown>[];
}

async function approval(action: string, program?: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { data, error } = await db.from("agent_events").select("id,data,status,title").eq("rx_id", rxId).eq("status", "needs_approval");
    if (error) throw new Error(error.message);
    const event = data?.find((e) => e.data?.action === action && (!program || e.data?.program === program));
    if (event) return event.id;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Missing approval ${action}/${program}`);
}

async function approve(eventId: string, actor = "doctor", status = 200) {
  return http("/api/approve", { eventId, decision: "approve", actor, via: "click" }, "POST", status);
}

async function verify(label: string, check: () => Promise<void>) {
  await check();
  console.log(`PASS day=${day} ${label}`);
}

async function main() {
  if (!process.argv.includes("--reset-confirmed")) {
    throw new Error("This wipes shared non-seed data. Warn the team 10 minutes beforehand, then run npm run rescue -- --reset-confirmed.");
  }
  await http("/api/demo", { action: "reset" });
  const baseline = PharmaMetricsResSchema.parse(await http("/api/pharma/metrics", undefined, "GET"));
  rxId = (await http("/api/intake", { patientId: MARIA_ID, transcript: DEMO_PHRASE })).rxId;
  await approve(await approval("enroll", "bridge"));
  const paEvent = await approval("submit_pa");
  const pa = await http(`/api/pa/${rxId}`, undefined, "GET");
  await http(`/api/pa/${rxId}`, { letterMd: pa.letterMd }, "PATCH");
  await approve(paEvent);
  await http(`/api/pa/${rxId}`, { letterMd: pa.letterMd }, "PATCH", 409);
  await verify("Bridge ships; end day 30; delivery day 2", async () => {
    assert.equal((await rows("prescriptions"))[0].expected_delivery_day, 2);
    assert.equal((await rows("enrollments"))[0].end_day, 30);
    assert.equal((await rows("orders"))[0].status, "shipped");
  });
  await http("/api/demo", { action: "jump", day: 2 });
  await verify("Bridge delivered but not counted as rescued", async () => {
    assert.equal((await rows("prescriptions"))[0].status, "bridge");
    assert.equal((await rows("orders"))[0].status, "delivered");
    assert.equal((await http("/api/pharma/metrics", undefined, "GET")).scriptsRescued, baseline.scriptsRescued);
  });
  await http("/api/demo", { action: "jump", day: 24 });
  await http("/api/demo", { action: "jump", day: 24 });
  await verify("Exactly one bridge cliff", async () => {
    assert.equal((await rows("alerts")).filter((a) => a.kind === "bridge_cliff" && !a.resolved).length, 1);
  });
  await http("/api/demo", { action: "deny_pa" });
  await http("/api/demo", { action: "deny_pa" });
  const cashEvent = await approval("enroll", "cash_pay");
  await verify("Denial creates appeal and approval, no cash order yet", async () => {
    assert.equal((await rows("prescriptions"))[0].status, "at_risk");
    assert.equal((await rows("pa_requests")).filter((p) => p.status === "draft" && String(p.letter_md).startsWith("## Appeal")).length, 1);
    assert.equal((await rows("orders")).length, 1);
    assert.equal((await rows("alerts")).filter((a) => a.kind === "pa_denied" && !a.resolved).length, 1);
  });
  await approve(cashEvent, "caregiver", 409);
  await approve(cashEvent);
  await approve(cashEvent);
  const cashOrder = (await rows("orders")).find((o) => Number(o.amount_usd) === 89);
  assert.ok(cashOrder, "doctor approval must create the cash order");
  assert.equal(cashOrder.status, "created");
  assert.equal((await rows("orders")).length, 2);
  const checkout = { orderId: cashOrder.id, payerMemberId: ANA_ID, capUsd: 100, recurring: true, passkeyConfirmed: true };
  assert.equal((await http("/api/checkout", checkout)).status, "paid");
  assert.equal((await http("/api/checkout", checkout)).status, "paid");
  await verify("Cash order ships but script is not rescued yet", async () => {
    assert.equal((await rows("prescriptions"))[0].status, "at_risk");
    assert.equal((await rows("prescriptions"))[0].expected_delivery_day, 26);
    assert.equal((await http("/api/pharma/metrics", undefined, "GET")).scriptsRescued, baseline.scriptsRescued);
  });
  await http("/api/demo", { action: "advance" });
  assert.notEqual((await rows("prescriptions"))[0].status, "on_therapy");
  await http("/api/demo", { action: "advance" });
  await verify("Delivered, on therapy, both alerts resolved", async () => {
    assert.equal(day, 26);
    assert.equal((await rows("prescriptions"))[0].status, "on_therapy");
    assert.equal((await rows("orders")).find((o) => o.id === cashOrder.id)?.status, "delivered");
    assert.ok((await rows("alerts")).every((a) => a.resolved));
  });
  await http("/api/demo", { action: "jump", day: 26 });
  const metrics = PharmaMetricsResSchema.parse(await http("/api/pharma/metrics", undefined, "GET"));
  assert.equal(metrics.scriptsRescued, baseline.scriptsRescued + 1);
  assert.equal(metrics.sample, false);
  // Maria's initial PA adds one 20-minute estimate; her appeal must not add another.
  assert.ok(Math.abs(metrics.paHoursSaved - baseline.paHoursSaved - 20 / 60) <= 0.1, "paHoursSaved counts one initial PA, not the appeal");
  console.log("FINAL METRICS", JSON.stringify(metrics, null, 2));
  const { data: events, error } = await db.from("agent_events").select("title,status,data").eq("rx_id", rxId).order("created_at");
  if (error) throw new Error(error.message);
  assert.ok(events?.every((e) => !["running", "blocked"].includes(e.status)), "no stuck/failed timeline steps");
  console.log("FINAL TIMELINE");
  for (const event of events ?? []) console.log(`day=${event.data.day} [${event.status}] ${event.title}`);
  console.log("FINAL ALERTS", JSON.stringify(await rows("alerts", "kind,resolved,created_at"), null, 2));
  console.log("ROUTE TIMES", JSON.stringify(times, null, 2));
  console.log("ALL PASS: Maria rescued after delivery");
}
main().catch((error) => { console.error(`FAIL day=${day} rx=${rxId}`, error); process.exitCode = 1; });
