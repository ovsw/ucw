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
  const directlyMatchedProtocol = result.directContentEntities.find(
    (entity) => entity._id === "protocol-allergy-response",
  );

  assert.deepEqual(matchedConcernIds.slice(0, 1), ["concern-allergy-medical-safety"]);
  assert.ok(directEntityIds.includes("policy-medical-care"));
  assert.ok(directEntityIds.includes("protocol-allergy-response"));
  assert.ok(mergedEntity);
  assert.ok(directlyMatchedProtocol);
  assert.ok(mergedEntity.sources.some((source) => source.kind === "direct"));
  assert.ok(mergedEntity.sources.some((source) => source.kind === "concernExpansion"));
  assert.ok(
    directlyMatchedProtocol.reasons.some(
      (reason) => reason.kind === "fieldMatch" && reason.field === "contentMap" && reason.matchedTerms.length > 0,
    ),
  );
});

test("generated corpus ranks required source-of-truth entities ahead of broad distractors", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const workbench = createDeterministicWorkbench(fixture);

  function rankFor(promptId: string, entityId: string): number {
    const prompt = fixture.goldSet.find((entry) => entry._id === promptId);
    assert.ok(prompt);

    const result = workbench.evaluatePrompt(prompt.prompt);
    const match = result.mergedContentEntities.find((entity) => entity._id === entityId);
    assert.ok(match, `${entityId} was not retrieved for ${promptId}`);

    return match.rank;
  }

  for (const prompt of fixture.goldSet) {
    const result = workbench.evaluatePrompt(prompt.prompt);
    const matchedConcernIds = new Set(result.matchedConcerns.map((concern) => concern._id));
    const retrievedIds = new Set(result.mergedContentEntities.map((entity) => entity._id));

    assert.deepEqual(
      prompt.expectedConcernIds.filter((concernId) => !matchedConcernIds.has(concernId)),
      [],
      `${prompt._id} should retrieve every expected Concern`,
    );
    assert.deepEqual(
      prompt.requiredContentEntityIds.filter((entityId) => !retrievedIds.has(entityId)),
      [],
      `${prompt._id} should retrieve every required Content Entity`,
    );
  }

  assert.ok(
    rankFor("prompt-allergy-epipen", "protocol-allergy-response") <
      rankFor("prompt-allergy-epipen", "policy-parent-communication"),
  );
  assert.ok(
    rankFor("prompt-allergy-epipen", "policy-medical-care") <
      rankFor("prompt-allergy-epipen", "policy-parent-communication"),
  );
  assert.ok(rankFor("prompt-airport-pickup", "transportation-route-airport") <= 3);
  assert.ok(rankFor("prompt-swim-weak-swimmer", "program-swim") <= 5);
  assert.ok(rankFor("prompt-swim-weak-swimmer", "protocol-waterfront-safety") <= 5);
  assert.ok(rankFor("prompt-bullying-and-homesickness", "policy-bullying-response") <= 3);
});
