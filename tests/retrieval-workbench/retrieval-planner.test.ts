import assert from "node:assert/strict";
import test from "node:test";
import { createPlannedRetrievalStrategy } from "../../src/retrieval-workbench/planned-retrieval-strategy.js";
import { createPrototypeRetrievalPlanner } from "../../src/retrieval-workbench/retrieval-planner.js";
import { createDeterministicRetrievalStrategy } from "../../src/retrieval-workbench/retrieval-strategy.js";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";

test("prototype Retrieval Planner turns the day-camp alternative prompt into an implied policy need", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-day-camp-alternative");

  assert.ok(prompt);

  const planner = createPrototypeRetrievalPlanner();
  const plan = planner.planPrompt(prompt.prompt);

  assert.equal(plan.prompt, prompt.prompt);
  assert.deepEqual(
    plan.needs.map((need) => [need.kind, need.id]),
    [
      ["stated", "need-stated-prompt"],
      ["implied", "need-registration-change-policy"],
    ],
  );
  assert.ok(
    plan.queries.some((query) =>
      query.searchText.includes("registration cancellation refund plan change day camp alternative"),
    ),
  );
});

test("planned retrieval uses rank fusion to lift implied policy content into the usable band", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-day-camp-alternative");

  assert.ok(prompt);

  const baseStrategy = createDeterministicRetrievalStrategy(fixture);
  const plannedStrategy = createPlannedRetrievalStrategy(baseStrategy, createPrototypeRetrievalPlanner());
  const baselineResult = baseStrategy.evaluatePrompt(prompt.prompt);
  const plannedResult = plannedStrategy.evaluatePrompt(prompt.prompt);
  const baselinePolicy = baselineResult.mergedContentEntities.find(
    (match) => match._id === "policy-registration-cancellation",
  );
  const plannedPolicy = plannedResult.mergedContentEntities.find(
    (match) => match._id === "policy-registration-cancellation",
  );

  assert.ok(baselinePolicy);
  assert.ok(plannedPolicy);
  assert.ok(baselinePolicy.rank > 10);
  assert.ok(plannedPolicy.rank <= 5);
  assert.equal(plannedResult.retrievalPlan?.needs.some((need) => need.kind === "implied"), true);
});

test("planned retrieval report shows the Retrieval Plan that drove the strategy", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const report = renderRetrievalWorkbenchReport(fixture, [
    createPlannedRetrievalStrategy(createDeterministicRetrievalStrategy(fixture), createPrototypeRetrievalPlanner()),
  ]);

  assert.match(report, /Strategy: Deterministic \+ Planner/);
  assert.match(report, /Retrieval plan:/);
  assert.match(report, /implied: Check whether a gentler camp alternative creates registration/);
});
