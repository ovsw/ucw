import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { createDeterministicWorkbench } from "../../src/retrieval-workbench/deterministic-retrieval.js";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";
import type {
  PromptRetrievalResult,
  RetrievalStrategy,
} from "../../src/retrieval-workbench/retrieval-strategy.js";
import { createDeterministicRetrievalStrategy } from "../../src/retrieval-workbench/retrieval-strategy.js";

test("deterministic retrieval strategy matches the legacy deterministic workbench", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/seed.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-allergy-epipen");

  assert.ok(prompt);

  const legacyWorkbench = createDeterministicWorkbench(fixture);
  const strategy = createDeterministicRetrievalStrategy(fixture);

  assert.deepEqual(strategy.evaluatePrompt(prompt.prompt), legacyWorkbench.evaluatePrompt(prompt.prompt));
});

test("retrieval workbench report can render multiple strategies through one pipeline", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/seed.json");
  const fakeResult: PromptRetrievalResult = {
    prompt: "",
    matchedConcerns: [],
    directContentEntities: [],
    mergedContentEntities: [],
  };

  const fakeStrategy: RetrievalStrategy = {
    id: "fake-strategy",
    label: "Fake strategy",
    evaluatePrompt: () => ({ ...fakeResult }),
  };

  const report = renderRetrievalWorkbenchReport(fixture, [
    createDeterministicRetrievalStrategy(fixture),
    fakeStrategy,
  ]);

  assert.match(report, /Strategy: Deterministic/);
  assert.match(report, /Strategy: Fake strategy/);
  assert.match(report, /Direct Content Entity matches/);
});
