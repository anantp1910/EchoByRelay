// Run: npm run test:ask
// Care-circle Q&A end to end, without touching the shared database:
// 1. Maria's chain runs through the real agents + approve/checkout handlers on
//    the in-memory DB (fixture AI), up to Ana's Cash Pay payment on day 24.
//    Every patientComms update appends a note to a REAL Backboard thread.
// 2. Live AI on: Ana asks both suggested questions via the real /api/ask handler.
// 3. A dosing question is declined. Each Q&A is written to audit_log.
// Needs BACKBOARD_API_KEY (+ XAI/GEMINI for answers) in .env.local. Never prints keys.
import assert from "node:assert/strict";
import { config } from "dotenv";
import { MemoryDb, type Row } from "./memory-db";
import { MARIA_ID, ANA_ID, MARIA_PLAN_ID } from "../lib/demo/constants";

config({ path: ".env.local", quiet: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://memory.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";
process.env.DEMO_MODE = "true"; // chain runs on fixtures; answers use live AI below

async function main() {
  assert.ok(process.env.BACKBOARD_API_KEY, "BACKBOARD_API_KEY must be set");
  const { db } = await import("../lib/db/server");
  const memory = new MemoryDb();
  (db as unknown as { from: MemoryDb["from"] }).from = memory.from.bind(memory);
  (db as unknown as { rpc: () => Promise<unknown> }).rpc = async () => { throw new Error("No shared reset in this test"); };
  const { runDemoAction } = await import("../lib/demo/actions");
  const { POST: approve } = await import("../app/api/approve/route");
  const { POST: checkout } = await import("../app/api/checkout/route");
  const { POST: askRoute } = await import("../app/api/ask/route");
  const { createContext } = await import("../lib/agents/context");
  const { router } = await import("../lib/agents/router");

  const rxId = "44444444-4444-4444-4444-444444444444";
  memory.tables = {
    demo_state: [{ id: 1, day: 0 }],
    patients: [{ id: MARIA_ID, name: "Maria González", language: "es", rural: true, insured: true, on_drug_before: true, income_band: "above_pap", plan_id: MARIA_PLAN_ID, conditions: ["type 2 diabetes mellitus", "heart failure"], backboard_thread_id: null, is_seed: true }],
    care_circle: [{ id: ANA_ID, patient_id: MARIA_ID, name: "Ana González", relation: "daughter", can_pay: true, lang: "en", is_seed: true }],
    prescriptions: [{ id: rxId, patient_id: MARIA_ID, drug: "Jardiance", dose: "10 mg", frequency: "daily", indication: "diabetes; heart failure", status: "routing", program: null, expected_delivery_day: null, is_seed: false, created_at: new Date().toISOString() }],
  };
  const event = (action: string, program?: string) => {
    const found = memory.tables.agent_events?.find((e) => e.status === "needs_approval" && (e.data as Row)?.action === action && (!program || (e.data as Row)?.program === program));
    assert.ok(found, `missing ${action}/${program}`);
    return found;
  };
  const approval = (e: Row) => approve(new Request("http://localhost/api/approve", { method: "POST", body: JSON.stringify({ eventId: e.id, decision: "approve", actor: "doctor", via: "click" }) }) as Parameters<typeof approve>[0]);

  // Full chain to Ana's payment (fixture AI, real Backboard notes).
  await router(memory.tables.patients[0] as unknown as Parameters<typeof router>[0], { paRequired: true, copayUsd: 480, tier: 3 }, createContext(MARIA_ID, rxId));
  assert.equal((await approval(event("enroll", "bridge"))).status, 200);
  assert.equal((await approval(event("submit_pa"))).status, 200);
  await runDemoAction({ action: "jump", day: 2 });
  await runDemoAction({ action: "jump", day: 24 });
  await runDemoAction({ action: "deny_pa" });
  assert.equal((await approval(event("enroll", "cash_pay"))).status, 200);
  const cashOrder = memory.tables.orders.find((o) => o.amount_usd === 89)!;
  const paid = await checkout(new Request("http://localhost", { method: "POST", body: JSON.stringify({ orderId: cashOrder.id, payerMemberId: ANA_ID, capUsd: 100, recurring: true, passkeyConfirmed: true }) }) as Parameters<typeof checkout>[0]);
  assert.equal(paid.status, 200);
  const threadId = memory.tables.patients[0].backboard_thread_id;
  assert.ok(typeof threadId === "string" && threadId.length > 0, "Maria's Backboard thread was created");
  const updates = memory.tables.agent_events.filter((e) => e.agent === "patientComms" && e.status === "done").length;
  console.log(`PASS chain to day 24 payment: ${updates} updates sent, Backboard thread created`);

  // Live answers.
  delete process.env.DEMO_MODE;
  async function askAsAna(question: string) {
    const t = performance.now();
    const res = await askRoute(new Request("http://localhost/api/ask", { method: "POST", body: JSON.stringify({ patientId: MARIA_ID, memberId: ANA_ID, question }) }) as Parameters<typeof askRoute>[0]);
    assert.equal(res.status, 200);
    const body = await res.json() as { answer: string; source: string; answeredBy: string };
    console.log(`\nAna: ${question}\nRelay (${body.answeredBy}, ${Math.round(performance.now() - t)}ms): ${body.answer}`);
    return body;
  }
  const arrive = await askAsAna("When will her medicine arrive?");
  assert.equal(arrive.source, "backboard");
  assert.ok(["backboard", "grok", "gemini"].includes(arrive.answeredBy), `answered by live AI, got ${arrive.answeredBy}`);
  assert.match(arrive.answer, /2 days|two days|day 26|26/i);
  const why = await askAsAna("Why did her plan change?");
  assert.ok(["backboard", "grok", "gemini"].includes(why.answeredBy));
  assert.match(why.answer, /den|not approve|didn.t approve|cash pay/i);
  const dose = await askAsAna("Can she take two pills if she missed yesterday's dose?");
  assert.equal(dose.answeredBy, "guardrail");
  assert.match(dose.answer, /Calhoun/);
  const audits = memory.tables.audit_log.filter((a) => a.action === "ask.answered");
  assert.equal(audits.length, 3);
  console.log(`\nPASS: 3 questions answered from Backboard thread ${String(threadId).slice(0, 8)}…; dosing declined; 3 audit_log rows`);
}
main().catch((e) => { console.error("FAIL", e); process.exitCode = 1; });
