// Run: node --conditions=react-server --import tsx scripts/engine-cases.ts
// Runs real agents and approval/checkout handlers against an in-memory DB.
import assert from "node:assert/strict";
import { MemoryDb, type Row } from "./memory-db";
import { MARIA_ID, ANA_ID, MARIA_PLAN_ID } from "../lib/demo/constants";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://memory.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.DEMO_MODE = "true";

async function main() {
  const { db } = await import("../lib/db/server");
  const memory = new MemoryDb();
  (db as unknown as { from: MemoryDb["from"] }).from = memory.from.bind(memory);
  (db as unknown as { rpc: () => Promise<unknown> }).rpc = async () => { throw new Error("No shared reset is permitted in this test"); };
  const { runDemoAction } = await import("../lib/demo/actions");
  const { POST: approve } = await import("../app/api/approve/route");
  const { POST: checkout } = await import("../app/api/checkout/route");
  const { runWatchdog } = await import("../lib/agents/watchdog");
  const { createContext } = await import("../lib/agents/context");
  const { router } = await import("../lib/agents/router");
  const { PATCH: editPa } = await import("../app/api/pa/[rxId]/route");
  const { POST: resolve } = await import("../app/api/alerts/[id]/resolve/route");

  function seed() {
    memory.tables = {
      demo_state: [{ id: 1, day: 0 }],
      patients: [{ id: MARIA_ID, name: "Maria González", language: "es", rural: true, insured: true, on_drug_before: true, income_band: "above_pap", plan_id: MARIA_PLAN_ID, conditions: ["type 2 diabetes mellitus", "heart failure"], is_seed: true }],
      care_circle: [{ id: ANA_ID, patient_id: MARIA_ID, name: "Ana", relation: "daughter", can_pay: true, lang: "en", is_seed: true }],
      prescriptions: [{ id: "44444444-4444-4444-4444-444444444444", patient_id: MARIA_ID, drug: "Jardiance", dose: "10 mg", frequency: "daily", indication: "diabetes; heart failure", status: "routing", program: null, expected_delivery_day: null, is_seed: false, created_at: new Date().toISOString() }],
    };
  }
  const rxId = "44444444-4444-4444-4444-444444444444";
  const rx = () => memory.tables.prescriptions[0];
  function event(action: string, program?: string) {
    const found = memory.tables.agent_events?.find((e) => e.status === "needs_approval" && (e.data as Row)?.action === action && (!program || (e.data as Row)?.program === program));
    assert.ok(found, `missing ${action}/${program} approval`);
    return found;
  }
  async function approval(e: Row, actor = "doctor") {
    return approve(new Request("http://localhost/api/approve", { method: "POST", body: JSON.stringify({ eventId: e.id, decision: "approve", actor, via: "click" }) }) as Parameters<typeof approve>[0]);
  }
  async function initialChain() {
    seed();
    await router(memory.tables.patients[0] as unknown as Parameters<typeof router>[0], { paRequired: true, copayUsd: 480, tier: 3 }, createContext(MARIA_ID, rxId));
    assert.equal((await approval(event("enroll", "bridge"))).status, 200);
    const edit = await editPa(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ letterMd: "Doctor reviewed draft" }) }), { params: Promise.resolve({ rxId }) });
    assert.equal(edit.status, 200);
    assert.ok(memory.tables.audit_log.some((a) => (a.payload as Row)?.edited_by === "doctor"));
    assert.equal((await approval(event("submit_pa"))).status, 200);
    assert.equal((await editPa(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ letterMd: "Late edit" }) }), { params: Promise.resolve({ rxId }) })).status, 409);
  }

  await initialChain();
  assert.equal(rx().expected_delivery_day, 2);
  assert.equal(memory.tables.enrollments[0].end_day, 30);
  await runDemoAction({ action: "jump", day: 2 });
  assert.equal(rx().status, "bridge");
  assert.equal(memory.tables.orders[0].status, "delivered");
  await runDemoAction({ action: "jump", day: 24 });
  await runWatchdog(24);
  assert.equal(memory.tables.alerts.length, 1);
  await runDemoAction({ action: "deny_pa" });
  await runDemoAction({ action: "deny_pa" });
  assert.equal(memory.tables.alerts.length, 2);
  assert.equal(memory.tables.pa_requests.length, 2);
  assert.match(String(memory.tables.pa_requests[1].letter_md), /^## Appeal/);
  const switchCard = event("enroll", "cash_pay");
  assert.equal(memory.tables.orders.length, 1);
  assert.equal((await approval(switchCard, "caregiver")).status, 409);
  assert.equal((await approval(switchCard)).status, 200);
  assert.equal((await approval(switchCard)).status, 200);
  assert.equal(memory.tables.orders.length, 2);
  assert.equal(rx().expected_delivery_day, null);
  const cashOrder = memory.tables.orders.find((o) => o.amount_usd === 89)!;
  const payment = await checkout(new Request("http://localhost", { method: "POST", body: JSON.stringify({ orderId: cashOrder.id, payerMemberId: ANA_ID, capUsd: 100, recurring: true, passkeyConfirmed: true }) }) as Parameters<typeof checkout>[0]);
  assert.equal(payment.status, 200);
  assert.equal((await payment.json()).status, "paid");
  assert.equal(rx().status, "at_risk");
  assert.ok(memory.tables.messages.some((m) => m.recipient_member_id === ANA_ID && String(m.body).startsWith("Your payment of $89 for Maria's Jardiance is complete")));
  await runDemoAction({ action: "advance" });
  assert.equal(rx().status, "at_risk");
  await runDemoAction({ action: "advance" });
  assert.equal(rx().status, "on_therapy");
  assert.ok(memory.tables.alerts.every((a) => a.resolved));
  assert.equal(memory.tables.agent_events.filter((e) => (e.data as Row)?.onTherapy).length, 1);
  const messageCount = memory.tables.messages.length;
  await runWatchdog(26);
  assert.equal(memory.tables.messages.length, messageCount);
  console.log("PASS: full rescue chain, repeat denial/approval/tick, doctor gate, messages, PA edit conflict, resolved alerts");
  console.log("ISOLATED TIMELINE", memory.tables.agent_events.map((e) => `[${e.status}] ${e.title}`).join("\n"));

  await initialChain();
  await runDemoAction({ action: "approve_pa" });
  assert.notEqual(rx().status, "on_therapy");
  await runDemoAction({ action: "jump", day: 2 });
  assert.equal(rx().status, "on_therapy");
  console.log("PASS: PA approval before arrival does not mark on_therapy; delivery does");

  await initialChain();
  await runDemoAction({ action: "no_pickup" });
  await runDemoAction({ action: "no_pickup" });
  assert.equal(memory.tables.orders[0].status, "shipped");
  assert.equal(memory.tables.alerts.length, 1);
  assert.equal(memory.tables.alerts[0].kind, "no_pickup");
  const params = { params: Promise.resolve({ id: String(memory.tables.alerts[0].id) }) };
  assert.equal((await resolve(new Request("http://localhost"), params)).status, 200);
  assert.equal((await resolve(new Request("http://localhost"), params)).status, 200);
  assert.equal(memory.tables.alerts[0].resolved, true);
  console.log("PASS: overdue held shipment stays undelivered; one alert; resolve is idempotent");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
