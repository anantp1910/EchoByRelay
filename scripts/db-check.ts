// npm run db:check
// Health check for the seeded database. Prints a row count per table, confirms
// Maria and Ana exist with the constants' IDs, prints demo_state.day, and exits
// PASS (0) / FAIL (1). Requires .env.local with the service role key.

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { MARIA_ID, ANA_ID } from "../lib/demo/constants";

config({ path: ".env.local" });

const TABLES = [
  "patients",
  "care_circle",
  "prescriptions",
  "coverage_checks",
  "pa_requests",
  "enrollments",
  "orders",
  "payment_mandates",
  "payments",
  "alerts",
  "messages",
  "agent_events",
  "audit_log",
  "demo_state",
] as const;

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }

  // Preflight 1: the URL must be the project REST host, not the dashboard.
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    console.error(`FAIL: NEXT_PUBLIC_SUPABASE_URL is not a valid URL.`);
    process.exit(1);
  }
  if (!host.endsWith(".supabase.co")) {
    console.error(
      `FAIL: NEXT_PUBLIC_SUPABASE_URL host "${host}" does not end in ".supabase.co".\n` +
        `      Use your project's Project URL (https://<project-ref>.supabase.co),\n` +
        `      not the dashboard URL (https://supabase.com/dashboard/...).`
    );
    process.exit(1);
  }

  // Preflight 2: the REST endpoint must answer with JSON. A wrong host / project
  // returns an HTML page, which we catch here with a clear message instead of a
  // confusing HTML blob later.
  try {
    const probe = await fetch(`${url}/rest/v1/demo_state?select=day&limit=1`, {
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
    const contentType = probe.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const body = (await probe.text()).slice(0, 120).replace(/\s+/g, " ");
      console.error(
        `FAIL: REST endpoint did not return JSON ` +
          `(status ${probe.status}, content-type "${contentType || "none"}").\n` +
          `      First bytes: ${body}`
      );
      process.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`FAIL: could not reach the REST endpoint: ${msg}`);
    process.exit(1);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let pass = true;

  console.log("Row counts:");
  for (const table of TABLES) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`  ${table.padEnd(18)} ERROR  ${error.message}`);
      pass = false;
    } else {
      console.log(`  ${table.padEnd(18)} ${count ?? 0}`);
    }
  }

  console.log("\nSeed checks:");

  // Maria exists with the constant ID.
  const { data: maria, error: mariaErr } = await db
    .from("patients")
    .select("id, name")
    .eq("id", MARIA_ID)
    .maybeSingle();
  if (mariaErr || !maria) {
    console.log(`  Maria (${MARIA_ID}): MISSING${mariaErr ? ` (${mariaErr.message})` : ""}`);
    pass = false;
  } else {
    console.log(`  Maria (${MARIA_ID}): OK — ${maria.name}`);
  }

  // Ana exists in care_circle with the constant ID.
  const { data: ana, error: anaErr } = await db
    .from("care_circle")
    .select("id, name")
    .eq("id", ANA_ID)
    .maybeSingle();
  if (anaErr || !ana) {
    console.log(`  Ana (${ANA_ID}): MISSING${anaErr ? ` (${anaErr.message})` : ""}`);
    pass = false;
  } else {
    console.log(`  Ana (${ANA_ID}): OK — ${ana.name}`);
  }

  // demo_state.day.
  const { data: state, error: stateErr } = await db
    .from("demo_state")
    .select("day")
    .eq("id", 1)
    .maybeSingle();
  if (stateErr || !state) {
    console.log(`  demo_state: MISSING${stateErr ? ` (${stateErr.message})` : ""}`);
    pass = false;
  } else {
    console.log(`  demo_state.day: ${state.day}`);
  }

  console.log(`\n${pass ? "PASS" : "FAIL"}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
