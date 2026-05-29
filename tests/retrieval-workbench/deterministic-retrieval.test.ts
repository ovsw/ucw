import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { createDeterministicWorkbench } from "../../src/retrieval-workbench/deterministic-retrieval.js";

test("deterministic retrieval keeps concern matches and content-entity matches separate", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/seed.json");
  const workbench = createDeterministicWorkbench(fixture);
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-allergy-epipen");

  assert.ok(prompt);

  const result = workbench.evaluatePrompt(prompt.prompt);
  const matchedConcernIds = result.matchedConcerns.map((concern) => concern._id);
  const directEntityIds = result.directContentEntities.map((entity) => entity._id);
  const mergedEntity = result.mergedContentEntities.find((entity) => entity._id === "policy-medical-care");

  assert.deepEqual(matchedConcernIds.slice(0, 1), ["concern-allergy-medical-safety"]);
  assert.ok(directEntityIds.includes("policy-medical-care"));
  assert.ok(directEntityIds.includes("protocol-allergy-response"));
  assert.ok(mergedEntity);
  assert.ok(mergedEntity.sources.some((source) => source.kind === "direct"));
  assert.ok(mergedEntity.sources.some((source) => source.kind === "concernExpansion"));
  assert.ok(
    mergedEntity.reasons.some(
      (reason) => reason.kind === "fieldMatch" && reason.field === "contentMap" && reason.matchedTerms.length > 0,
    ),
  );
});
