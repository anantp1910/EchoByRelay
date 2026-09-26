// npm run fetch:label
// Fetches the live Jardiance label and WRITES lib/data/fixtures/openfda-jardiance.json
// in the exact shape lib/data/openfda.ts reads. Person C runs this and commits
// the fixture (lib/data/fixtures is Person C's folder).

import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { fetchLiveLabel, type LabelFixture } from "../lib/data/openfda";

config({ path: ".env.local" });

async function main(): Promise<void> {
  const label = await fetchLiveLabel();

  // Drop the runtime-only `source` field; write exactly what openfda.ts reads.
  const fixture: LabelFixture = {
    setId: label.setId,
    brandName: label.brandName,
    genericName: label.genericName,
    citationUrl: label.citationUrl,
    sections: label.sections,
  };

  const path = join(process.cwd(), "lib", "data", "fixtures", "openfda-jardiance.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(fixture, null, 2)}\n`);

  console.log(`Wrote ${path}`);
  console.log(`  setId: ${fixture.setId}`);
  console.log(`  ${fixture.brandName} (${fixture.genericName})`);
  for (const [k, v] of Object.entries(fixture.sections)) {
    console.log(`  ${k}: ${v.length} chars`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
