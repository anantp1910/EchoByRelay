// Run: npm run test:gemini
// Backup AI check: Grok is forced to fail in-process (its base URL points at a
// closed local port), so every AI step must be answered by Gemini. Real agents,
// in-memory DB (no shared Supabase writes), live Gemini calls. Needs
// GEMINI_API_KEY + GEMINI_MODEL in .env.local. Never prints key values.
import assert from "node:assert/strict";
import { config } from "dotenv";
import { MemoryDb, type Row } from "./memory-db";
import { MARIA_ID, ANA_ID, MARIA_PLAN_ID, DEMO_PHRASE } from "../lib/demo/constants";

config({ path: ".env.local", quiet: true });
process.env.XAI_BASE_URL = "http://127.0.0.1:9"; // Grok unreachable -> connection error
process.env.XAI_API_KEY ||= "test-only";
delete process.env.DEMO_MODE;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://memory.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only";

async function main() {
  assert.ok(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL, "GEMINI_API_KEY and GEMINI_MODEL must be set");
  console.log(`Gemini model: ${process.env.GEMINI_MODEL}`);
  const { db } = await import("../lib/db/server");
  const memory = new MemoryDb();
  (db as unknown as { from: MemoryDb["from"] }).from = memory.from.bind(memory);
  const rxId = "44444444-4444-4444-4444-444444444444";
  memory.tables = {
    demo_state: [{ id: 1, day: 0 }],
    patients: [{ id: MARIA_ID, name: "Maria González", language: "es", rural: true, insured: true, on_drug_before: true, income_band: "above_pap", plan_id: MARIA_PLAN_ID, conditions: ["type 2 diabetes mellitus", "heart failure with reduced ejection fraction"], is_seed: true }],
    care_circle: [{ id: ANA_ID, patient_id: MARIA_ID, name: "Ana González", relation: "daughter", can_pay: true, lang: "en", is_seed: true }],
    prescriptions: [{ id: rxId, patient_id: MARIA_ID, drug: "Jardiance", dose: "10 mg", frequency: "once daily", indication: "type 2 diabetes mellitus; heart failure", status: "bridge", program: "bridge", expected_delivery_day: 2, is_seed: false, created_at: new Date().toISOString() }],
  };
  const { parseIntake } = await import("../lib/agents/intake");
  const { router } = await import("../lib/agents/router");
  const { draftRationale } = await import("../lib/agents/paLetter");
  const { notify } = await import("../lib/agents/patientComms");
  const { createContext } = await import("../lib/agents/context");
  const { getJardianceLabel } = await import("../lib/data/openfda");
  const timed = async <T>(label: string, run: () => Promise<T>) => {
    const t = performance.now();
    const out = await run();
    console.log(`  ${label}: ${Math.round(performance.now() - t)}ms`);
    return out;
  };

  const intake = await timed("intake", () => parseIntake(DEMO_PHRASE));
  assert.equal(intake.provider, "gemini");
  assert.match(intake.drug, /jardiance/i);
  console.log(`PASS intake: provider=${intake.provider} drug=${intake.drug} dose=${intake.dose}`);

  const ctx = createContext(MARIA_ID, rxId);
  await timed("router explanation", () =>
    router(memory.tables.patients[0] as unknown as Parameters<typeof router>[0], { paRequired: true, copayUsd: 480, tier: 3 }, ctx));
  const card = memory.tables.agent_events.find((e) => e.agent === "router" && e.status === "needs_approval");
  assert.equal((card?.data as Row)?.provider, "gemini");
  console.log(`PASS router: provider=gemini "${String(card?.detail).slice(0, 110)}…"`);

  const label = await getJardianceLabel({ preferFixture: true });
  const pa = await timed("PA letter", () => draftRationale(
    { drug: "Jardiance", dose: "10 mg", frequency: "once daily", indication: "type 2 diabetes mellitus; heart failure", program: "bridge" },
    { name: "Maria González", conditions: ["type 2 diabetes mellitus", "heart failure with reduced ejection fraction"], planId: MARIA_PLAN_ID },
    label,
  ));
  assert.equal(pa.provider, "gemini");
  assert.equal(pa.source, "ai");
  console.log(`PASS PA letter: provider=${pa.provider}, ${pa.citations.length} citations validated against the FDA label`);

  await timed("patient comms", () => notify(ctx, "enrolled"));
  const sent = memory.tables.agent_events.find((e) => e.agent === "patientComms" && e.status === "done");
  assert.equal((sent?.data as Row)?.provider, "gemini");
  assert.equal(sent?.detail, "Backup AI: Gemini");
  const messages = memory.tables.messages ?? [];
  assert.equal(messages.length, 2);
  assert.ok(messages.every((m) => /jardiance/i.test(String(m.body))));
  for (const m of messages) console.log(`  [${m.lang}] ${m.body}`);
  console.log(`PASS patient comms: provider=gemini, ${messages.length} messages (ES patient, EN Ana)`);
  console.log("ALL PASS: Grok down -> Gemini answered intake, router, PA letter and patient comms");
}
main().catch((error) => { console.error("FAIL", error); process.exitCode = 1; });
