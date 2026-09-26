// npm run test:intake
// Runs the intake parser on a spread of sentences and prints parsed fields,
// whether Grok (ai) or the deterministic fallback handled it, and latency.
// Then blanks XAI_API_KEY in-process and reruns one case to prove the fallback.
//
// Uses parseIntake (pure — no DB writes). Needs .env.local for the xAI key to
// exercise the AI path; without it, every case takes the fallback.

import { config } from "dotenv";

import { parseIntake, type IntakeResult } from "../lib/agents/intake";

config({ path: ".env.local" });

interface Case {
  label: string;
  transcript: string;
}

const CASES: Case[] = [
  { label: "demo phrase", transcript: "Continue Maria on Jardiance, 10 mg daily" },
  {
    label: "spanish-accented",
    transcript: "Please continue María González on Jardiance, 10 mg once daily",
  },
  { label: "different drug", transcript: "Starting John on Metformin, 500 mg twice daily" },
  { label: "missing dose", transcript: "Starting Jane on Lisinopril daily" },
  { label: "gibberish", transcript: "asdf qwerty zxcv" },
];

interface Row {
  label: string;
  source: string;
  name: string;
  drug: string;
  dose: string;
  freq: string;
  indication: string;
  ms: number;
}

async function runOne(label: string, transcript: string): Promise<Row> {
  const started = Date.now();
  let res: IntakeResult | undefined;
  let source = "error";
  try {
    res = await parseIntake(transcript);
    source = res.source;
  } catch (err) {
    source = `error(${err instanceof Error ? err.message : String(err)})`;
  }
  return {
    label,
    source,
    name: res?.patientName ?? "",
    drug: res?.drug ?? "",
    dose: res?.dose ?? "",
    freq: res?.frequency ?? "",
    indication: res?.indication ?? "",
    ms: Date.now() - started,
  };
}

function printTable(rows: Row[]): void {
  const cols: { key: keyof Row; head: string; w: number }[] = [
    { key: "label", head: "case", w: 20 },
    { key: "source", head: "source", w: 10 },
    { key: "name", head: "name", w: 16 },
    { key: "drug", head: "drug", w: 14 },
    { key: "dose", head: "dose", w: 8 },
    { key: "freq", head: "freq", w: 12 },
    { key: "indication", head: "indication", w: 34 },
    { key: "ms", head: "ms", w: 6 },
  ];
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(cols[i].w)).join(" | ");
  console.log(line(cols.map((c) => c.head)));
  console.log(line(cols.map((c) => "-".repeat(c.w))));
  for (const r of rows) {
    console.log(
      line(
        cols.map((c) => {
          const v = String(r[c.key] ?? "");
          return v.length > c.w ? v.slice(0, c.w - 1) + "…" : v;
        })
      )
    );
  }
}

async function main(): Promise<void> {
  console.log(`XAI_API_KEY present: ${Boolean(process.env.XAI_API_KEY)}\n`);

  const rows: Row[] = [];
  for (const c of CASES) {
    rows.push(await runOne(c.label, c.transcript));
  }
  printTable(rows);

  console.log("\n--- forcing fallback (XAI_API_KEY blanked in-process) ---");
  delete process.env.XAI_API_KEY;
  const forced = await runOne("demo phrase (no key)", CASES[0].transcript);
  printTable([forced]);

  if (forced.source !== "fallback") {
    console.error(`\nExpected fallback with no key, got "${forced.source}"`);
    process.exit(1);
  }
  console.log("\nFallback confirmed with no key.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
