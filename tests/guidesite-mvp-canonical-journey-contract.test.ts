import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractPath = "docs/guidesite-mvp-canonical-journey-contract.md";

async function readContract(): Promise<string> {
  return readFile(contractPath, "utf8");
}

test("canonical GuideSite MVP journey contract captures issue #21 scope", async () => {
  const contract = await readContract();

  assert.match(contract, /Is overnight camp right for my 8-year-old\?/);
  assert.match(contract, /child_age[\s\S]*8[\s\S]*explicit/i);
  assert.match(contract, /provenance/i);
  assert.match(contract, /assess(?:ing)? Fit/i);
  assert.match(contract, /without making a recommendation yet/i);
  assert.match(contract, /homesickness/i);
  assert.match(contract, /readiness|Child Readiness/);
  assert.match(contract, /prior_sleepaway_experience|prior sleepaway experience/i);
  assert.match(contract, /Child Readiness/);
  assert.match(contract, /best fit/);
  assert.match(contract, /recommended/);
  assert.match(contract, /safe/);
  assert.match(contract, /available/);
  assert.match(contract, /controlled Suggested Prompts/i);
  assert.match(contract, /Has your child slept away from home before\?/);
  assert.match(contract, /How does your child usually handle new routines or time away from you\?/);
  assert.match(contract, /semantic section kinds/i);
  assert.match(contract, /context_needs/);
  assert.doesNotMatch(contract, /React component|component props|Answer Component name/i);
  assert.match(contract, /guidesite-mvp-architecture\.md/);
  assert.match(contract, /guidesite-mvp-sprints-plan\.md/);
  assert.match(contract, /github\.com\/ovsw\/ucw\/issues\/20/);
});
