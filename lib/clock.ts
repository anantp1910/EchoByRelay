import "server-only";

import { db } from "./db/server";

// Demo clock. All engine time logic reads the simulated "now" from
// demo_state.day via these helpers — never Date.now() (CLAUDE.md hard rule
// #10), so the /demo panel can fast-forward days.

const DEMO_STATE_ID = 1;

/** Stable calendar anchor for displayed demo dates and payer decisions. */
export function dateAtDay(day: number): Date {
  return new Date(Date.UTC(2026, 8, 26 + day));
}

/** The current simulated day (0-based) from demo_state. */
export async function now(): Promise<{ day: number }> {
  const { data, error } = await db
    .from("demo_state")
    .select("day")
    .eq("id", DEMO_STATE_ID)
    .single();

  if (error) {
    throw new Error(`clock.now(): ${error.message}`);
  }
  return { day: data.day as number };
}

/** Set the simulated day to an absolute value. */
export async function setDay(day: number): Promise<{ day: number }> {
  const { data, error } = await db
    .from("demo_state")
    .update({ day })
    .eq("id", DEMO_STATE_ID)
    .select("day")
    .single();

  if (error) {
    throw new Error(`clock.setDay(${day}): ${error.message}`);
  }
  return { day: data.day as number };
}

/** Advance the simulated day by n (n may be negative). Returns the new day. */
export async function advance(n: number): Promise<{ day: number }> {
  const current = await now();
  return setDay(current.day + n);
}
