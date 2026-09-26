// npm run test:checkout
// Exercises /api/checkout against a running dev server. Sets up test data via
// direct service-role inserts (medvantx.createCashPayOrder is server-only and
// can't run under tsx) using the SAME shapes: a cash_pay prescription +
// enrollment + order for the success/decline-by-policy cases, and a bridge
// prescription + enrollment + order for the free-program decline.
//
// Cases: success as Ana; second call no-op (no second charge); declined bridge;
// declined over cap; declined no passkey; declined non-circle member.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { MARIA_ID, ANA_ID, DEMO_DRUG } from "../lib/demo/constants";

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

const AMOUNT = 89;
const createdRxIds: string[] = [];

async function createRx(program: "cash_pay" | "bridge"): Promise<string> {
  const { data, error } = await db
    .from("prescriptions")
    .insert({
      patient_id: MARIA_ID,
      drug: DEMO_DRUG.name,
      dose: DEMO_DRUG.dose,
      frequency: "daily",
      status: "routing",
      program,
      is_seed: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createRx: ${error.message}`);
  createdRxIds.push(data.id);
  return data.id;
}

async function createOrder(program: "cash_pay" | "bridge"): Promise<string> {
  const rxId = await createRx(program);
  const { data: enr, error: enrErr } = await db
    .from("enrollments")
    .insert({ rx_id: rxId, program, status: "active", is_seed: false })
    .select("id")
    .single();
  if (enrErr) throw new Error(`createOrder enrollment: ${enrErr.message}`);
  const { data, error } = await db
    .from("orders")
    .insert({ rx_id: rxId, enrollment_id: enr.id, amount_usd: AMOUNT, status: "created", is_seed: false })
    .select("id")
    .single();
  if (error) throw new Error(`createOrder: ${error.message}`);
  return data.id;
}

interface Body {
  orderId: string;
  payerMemberId: string;
  capUsd: number;
  recurring: boolean;
  passkeyConfirmed: boolean;
}

async function checkout(body: Body): Promise<{ status: number; json: { status: string; visaRef: string | null; reason: string | null } }> {
  const res = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

interface Row {
  label: string;
  expected: string;
  got: string;
  detail: string;
}

let failures = 0;
const rows: Row[] = [];
function record(label: string, expected: string, got: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  rows.push({ label, expected, got: `${ok ? "PASS" : "FAIL"} (${got})`, detail });
}

async function main(): Promise<void> {
  // 1. success as Ana (cash_pay), timed
  const cashOrder = await createOrder("cash_pay");
  const t0 = Date.now();
  const ok1 = await checkout({ orderId: cashOrder, payerMemberId: ANA_ID, capUsd: 200, recurring: true, passkeyConfirmed: true });
  const checkoutMs = Date.now() - t0;
  record("success as Ana", "paid", ok1.json.status, ok1.status === 200 && ok1.json.status === "paid" && !!ok1.json.visaRef, ok1.json.visaRef ?? "");

  // 2. second call = no-op (same visaRef, only one payment row)
  const ok2 = await checkout({ orderId: cashOrder, payerMemberId: ANA_ID, capUsd: 200, recurring: true, passkeyConfirmed: true });
  const { count } = await db.from("payments").select("*", { count: "exact", head: true }).eq("order_id", cashOrder);
  record(
    "second call no-op",
    "paid, 1 payment",
    `${ok2.json.status}, ${count} payment(s)`,
    ok2.json.status === "paid" && ok2.json.visaRef === ok1.json.visaRef && count === 1
  );

  // 3. declined bridge order (free program)
  const bridgeOrder = await createOrder("bridge");
  const ok3 = await checkout({ orderId: bridgeOrder, payerMemberId: ANA_ID, capUsd: 200, recurring: false, passkeyConfirmed: true });
  record("declined bridge (free)", "declined", ok3.json.status, ok3.json.status === "declined", ok3.json.reason ?? "");

  // 4. declined over cap
  const capOrder = await createOrder("cash_pay");
  const ok4 = await checkout({ orderId: capOrder, payerMemberId: ANA_ID, capUsd: 10, recurring: false, passkeyConfirmed: true });
  record("declined over cap", "declined", ok4.json.status, ok4.json.status === "declined", ok4.json.reason ?? "");

  // 5. declined without passkey
  const noPkOrder = await createOrder("cash_pay");
  const ok5 = await checkout({ orderId: noPkOrder, payerMemberId: ANA_ID, capUsd: 200, recurring: false, passkeyConfirmed: false });
  record("declined no passkey", "declined", ok5.json.status, ok5.json.status === "declined", ok5.json.reason ?? "");

  // 6. declined non-circle member
  const strangerOrder = await createOrder("cash_pay");
  const ok6 = await checkout({ orderId: strangerOrder, payerMemberId: crypto.randomUUID(), capUsd: 200, recurring: false, passkeyConfirmed: true });
  record("declined non-circle", "declined", ok6.json.status, ok6.json.status === "declined", ok6.json.reason ?? "");

  // Table
  console.log(`\ncheckout route time (success case): ${checkoutMs}ms\n`);
  console.log("result".padEnd(24) + "| expected".padEnd(18) + "| got");
  console.log("-".repeat(70));
  for (const r of rows) {
    console.log(`${r.label.padEnd(23)} | ${r.expected.padEnd(15)} | ${r.got}${r.detail ? `  ${r.detail.slice(0, 40)}` : ""}`);
  }
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAIL`}`);

  // Cleanup: delete test prescriptions (cascades enrollments/orders/payments/mandates).
  await db.from("prescriptions").delete().in("id", createdRxIds);

  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  if (createdRxIds.length) await db.from("prescriptions").delete().in("id", createdRxIds);
  process.exit(1);
});
