import assert from "node:assert/strict";
import { getJardianceLabel } from "../lib/data/openfda";
import { templateRationale, validateAndCorrect } from "../lib/agents/paLetter";

async function main() {
  process.env.DEMO_MODE = "true";
  const label = await getJardianceLabel();
  const draft = templateRationale({ drug: "Jardiance", dose: "10 mg", frequency: "daily", indication: "type 2 diabetes; heart failure", program: "bridge" }, label);
  assert.equal(draft.citations.length, 3);
  assert.ok(validateAndCorrect(draft.rationaleMd, draft.citations, label));
  assert.match(draft.citations[0].quote, /glycemic/);
  assert.match(draft.citations[1].quote, /heart failure/);
  assert.equal(validateAndCorrect(draft.rationaleMd.replace("[1]", "[9]"), draft.citations, label), null);
  assert.equal(validateAndCorrect(draft.rationaleMd, draft.citations.map((c, i) => i === 0 ? { ...c, quote: draft.citations[1].quote } : c), label), null);
  assert.equal(validateAndCorrect(`${draft.rationaleMd} It cures cancer permanently [1].`, draft.citations, label), null);
  assert.equal(validateAndCorrect(draft.rationaleMd, [...draft.citations, draft.citations[0]], label), null);
  console.log("PASS: template, swapped citation, missing reference, repeated reference, duplicate numbering");
  console.log(draft.rationaleMd);
  for (const c of draft.citations) console.log(`[${c.n}] ${c.quote}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
