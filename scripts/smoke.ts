// npm run smoke
// Calls every Relay route once against a running dev server and validates each
// response with the contract schemas directly (not via lib/api/client.ts, which
// uses browser-relative URLs). Prints PASS/FAIL per route; exits non-zero on any
// FAIL. Start the dev server first: `npm run dev`.
//
// Base URL override: SMOKE_BASE_URL (default http://localhost:3000).

import type { z } from "zod";

import {
  ApproveResSchema,
  CheckoutResSchema,
  DemoResSchema,
  IntakeResSchema,
  PaResSchema,
  PharmaMetricsResSchema,
} from "../lib/api/contracts";
import { MARIA_ID, DEMO_PHRASE } from "../lib/demo/constants";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

let failures = 0;

function uuid(): string {
  return crypto.randomUUID();
}

async function req(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // leave undefined
    }
  }
  return { status: res.status, json };
}

/** Runs one check, validating status 200 and the response schema; returns parsed data. */
async function check<T>(
  name: string,
  run: () => Promise<{ status: number; json: unknown }>,
  schema: z.ZodType<T>
): Promise<T | undefined> {
  try {
    const { status, json } = await run();
    if (status !== 200) {
      console.log(`FAIL  ${name}  (HTTP ${status}: ${JSON.stringify(json)})`);
      failures++;
      return undefined;
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      console.log(`FAIL  ${name}  (schema: ${parsed.error.message})`);
      failures++;
      return undefined;
    }
    console.log(`PASS  ${name}`);
    return parsed.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL  ${name}  (${msg})`);
    failures++;
    return undefined;
  }
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE}\n`);

  // 1. intake -> capture rxId for the PA check.
  const intake = await check(
    "POST /api/intake",
    () => req("POST", "/api/intake", { patientId: MARIA_ID, transcript: DEMO_PHRASE }),
    IntakeResSchema
  );
  const rxId = intake?.rxId ?? uuid();

  // 2. pa/[rxId]
  await check("GET  /api/pa/[rxId]", () => req("GET", `/api/pa/${rxId}`), PaResSchema);

  // 3. approve
  await check(
    "POST /api/approve",
    () =>
      req("POST", "/api/approve", {
        eventId: uuid(),
        decision: "approve",
        actor: "doctor",
        via: "voice",
      }),
    ApproveResSchema
  );

  // 4. checkout
  await check(
    "POST /api/checkout",
    () =>
      req("POST", "/api/checkout", {
        orderId: uuid(),
        payerMemberId: uuid(),
        capUsd: 300,
        recurring: true,
        passkeyConfirmed: true,
      }),
    CheckoutResSchema
  );

  // 5. demo reset
  await check(
    "POST /api/demo",
    () => req("POST", "/api/demo", { action: "reset" }),
    DemoResSchema
  );

  // 6. pharma metrics
  await check(
    "GET  /api/pharma/metrics",
    () => req("GET", "/api/pharma/metrics"),
    PharmaMetricsResSchema
  );

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAIL`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke run crashed (is the dev server running?):", err);
  process.exit(1);
});
