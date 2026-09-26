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
