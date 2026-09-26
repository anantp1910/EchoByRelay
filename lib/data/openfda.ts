// openFDA drug-label client for the demo drug (Jardiance / empagliflozin).
//
// Extracts four label sections as whitespace-cleaned text plus the SPL set_id,
// and builds one DailyMed citation URL per set_id (shared by all sections).
// Cached per process. On live-fetch failure or DEMO_MODE=true, reads the
// read-only fixture at lib/data/fixtures/openfda-jardiance.json (Person C's).
//
// No `import "server-only"`: also imported by scripts/fetch-label.ts under tsx.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

const OPENFDA_URL = "https://api.fda.gov/drug/label.json";
const FETCH_TIMEOUT_MS = 8_000;
const FIXTURE_PATH = join(process.cwd(), "lib", "data", "fixtures", "openfda-jardiance.json");

export class LabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabelError";
  }
}

export interface LabelSections {
  indications_and_usage: string;
  dosage_and_administration: string;
  contraindications: string;
  warnings_and_cautions: string;
}

export interface LabelData {
  setId: string;
  brandName: string;
  genericName: string;
  citationUrl: string;
  sections: LabelSections;
  source: "live" | "fixture";
}

// Shape written to / read from the fixture (no runtime `source`).
const LabelFixtureSchema = z.object({
  setId: z.string().min(1),
  brandName: z.string(),
  genericName: z.string(),
  citationUrl: z.url(),
  sections: z.object({
    indications_and_usage: z.string(),
    dosage_and_administration: z.string(),
    contraindications: z.string(),
    warnings_and_cautions: z.string(),
  }),
});
export type LabelFixture = z.infer<typeof LabelFixtureSchema>;

function clean(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.join("\n\n").replace(/\s+/g, " ").trim();
}

function dailyMedUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`;
}

interface OpenFdaResult {
  set_id?: string;
  indications_and_usage?: unknown;
  dosage_and_administration?: unknown;
  contraindications?: unknown;
  warnings_and_cautions?: unknown;
  openfda?: { brand_name?: string[]; generic_name?: string[]; spl_set_id?: string[] };
}

async function queryOpenFda(search: string): Promise<OpenFdaResult | null> {
  const url = `${OPENFDA_URL}?search=${encodeURIComponent(search)}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: OpenFdaResult[] };
  return json?.results?.[0] ?? null;
}

function normalizeResult(result: OpenFdaResult): LabelData {
  const setId = result.set_id ?? result.openfda?.spl_set_id?.[0] ?? "";
  if (!setId) {
    throw new LabelError("openFDA label has no set_id");
  }
  return {
    setId,
    brandName: result.openfda?.brand_name?.[0] ?? "JARDIANCE",
    genericName: result.openfda?.generic_name?.[0] ?? "empagliflozin",
    citationUrl: dailyMedUrl(setId),
    sections: {
      indications_and_usage: clean(result.indications_and_usage),
      dosage_and_administration: clean(result.dosage_and_administration),
      contraindications: clean(result.contraindications),
      warnings_and_cautions: clean(result.warnings_and_cautions),
    },
    source: "live",
  };
}

/** Fetch the live Jardiance label (brand first, then generic). Throws LabelError on failure. */
export async function fetchLiveLabel(): Promise<LabelData> {
  let result = await queryOpenFda('openfda.brand_name:"Jardiance"');
  if (!result) {
    result = await queryOpenFda('openfda.generic_name:"empagliflozin"');
  }
  if (!result) {
    throw new LabelError("openFDA returned no label for Jardiance / empagliflozin");
  }
  return normalizeResult(result);
}

function loadFixture(): LabelData {
  let raw: string;
  try {
    raw = readFileSync(FIXTURE_PATH, "utf8");
  } catch {
    throw new LabelError(
      "No live label and no fixture at lib/data/fixtures/openfda-jardiance.json (run `npm run fetch:label`)"
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LabelError("openfda-jardiance.json is not valid JSON");
  }
  const result = LabelFixtureSchema.safeParse(parsed);
  if (!result.success) {
    throw new LabelError(`openfda-jardiance.json failed schema: ${result.error.message}`);
  }
  return { ...result.data, source: "fixture" };
}

let cached: LabelData | null = null;

/** Cached label. DEMO_MODE or live-fetch failure falls back to the fixture. */
export async function getJardianceLabel(): Promise<LabelData> {
  if (cached) return cached;

  if (process.env.DEMO_MODE === "true") {
    cached = loadFixture();
    return cached;
  }

  try {
    cached = await fetchLiveLabel();
  } catch (err) {
    console.warn(`[openfda] live fetch failed, falling back to fixture: ${err instanceof Error ? err.message : err}`);
    cached = loadFixture();
  }
  return cached;
}
