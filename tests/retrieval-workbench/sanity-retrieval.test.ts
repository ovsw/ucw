import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";
import type { PromptRetrievalResult, RetrievalStrategy } from "../../src/retrieval-workbench/retrieval-strategy.js";
import {
  buildSanityHybridQueryPlan,
  buildSanityKeywordQueryPlan,
  createSanityHybridRetrievalStrategy,
} from "../../src/retrieval-workbench/sanity-retrieval.js";

test("sanity hybrid query plan includes keyword and semantic scoring", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-bullying-and-homesickness");

  assert.ok(prompt);

  const plan = buildSanityHybridQueryPlan(prompt.prompt);

  assert.equal(plan.prompt, prompt.prompt);
  assert.equal(plan.kind, "sanityHybrid");
  assert.match(plan.concernQuery, /_type == "concern"/);
  assert.match(plan.contentEntityQuery, /_type != "concern"/);
  assert.ok(plan.concernQuery.includes('!(_id in path("_.*"))'));
  assert.ok(plan.contentEntityQuery.includes('!(_id in path("_.*"))'));
  assert.match(plan.contentEntityBridgeQuery, /relatedConcerns\[_ref in \$matchedConcernIds\]/);
  assert.match(plan.contentEntityBridgeQuery, /relatedConcerns\[\]\._ref/);
  assert.match(plan.concernQuery, /text::query\(\$searchQuery\)/);
  assert.match(plan.contentEntityQuery, /text::query\(\$searchQuery\)/);
  assert.match(plan.concernQuery, /text::semanticSimilarity\(\$searchQuery\)/);
  assert.match(plan.contentEntityQuery, /text::semanticSimilarity\(\$searchQuery\)/);
  assert.doesNotMatch(plan.concernQuery, /boost\(/);
  assert.doesNotMatch(plan.contentEntityQuery, /boost\(/);
  assert.doesNotMatch(plan.concernQuery, /->/);
  assert.doesNotMatch(plan.contentEntityQuery, /->/);
  assert.match(
    plan.contentEntityQuery,
    /score\(\s*relatedConcernTitles match text::query\(\$searchQuery\),\s*title match text::query\(\$searchQuery\),\s*contentMap match text::query\(\$searchQuery\),\s*text::semanticSimilarity\(\$searchQuery\)\s*\)/s,
  );
});

test("sanity keyword query plan omits semantic similarity scoring", () => {
  const plan = buildSanityKeywordQueryPlan("My child is shy and might get bullied.");

  assert.equal(plan.kind, "sanityKeyword");
  assert.match(plan.concernQuery, /text::query\(\$searchQuery\)/);
  assert.doesNotMatch(plan.concernQuery, /text::semanticSimilarity\(\$searchQuery\)/);
  assert.doesNotMatch(plan.contentEntityQuery, /text::semanticSimilarity\(\$searchQuery\)/);
  assert.doesNotMatch(plan.concernQuery, /boost\(/);
  assert.doesNotMatch(plan.contentEntityQuery, /boost\(/);
  assert.doesNotMatch(plan.concernQuery, /->/);
  assert.doesNotMatch(plan.contentEntityQuery, /->/);
  assert.match(plan.contentEntityQuery, /relatedConcernTitles match text::query\(\$searchQuery\)/);
  assert.match(
    plan.concernQuery,
    /score\(\s*title match text::query\(\$searchQuery\),\s*contentMap match text::query\(\$searchQuery\)\s*\)/s,
  );
});

test("sanity hybrid strategy maps query results into comparable ranks for the shared report", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-swim-weak-swimmer");

  assert.ok(prompt);

  const seenPlans: Array<{ prompt: string; kind: string }> = [];
  const strategy = createSanityHybridRetrievalStrategy((plan) => {
    seenPlans.push({ prompt: plan.prompt, kind: plan.kind });

    const fakeResult: PromptRetrievalResult = {
      prompt: plan.prompt,
      matchedConcerns: [
        {
          _id: "concern-swim-safety",
          _type: "concern",
          title: "Weak swimmer safety",
          score: 12,
          rank: 1,
          reasons: [],
        },
        {
          _id: "concern-homesickness-readiness",
          _type: "concern",
          title: "Homesickness and child readiness",
          score: 6,
          rank: 2,
          reasons: [],
        },
      ],
      directContentEntities: [
        {
          _id: "protocol-waterfront-safety",
          _type: "protocol",
          title: "Waterfront safety protocol",
          score: 11,
          rank: 1,
          reasons: [],
          sources: [
            {
              kind: "direct",
              score: 11,
              rank: 1,
              matchedTerms: ["swim"],
            },
          ],
        },
      ],
      mergedContentEntities: [
        {
          _id: "protocol-waterfront-safety",
          _type: "protocol",
          title: "Waterfront safety protocol",
          score: 11,
          rank: 1,
          reasons: [],
          sources: [
            {
              kind: "direct",
              score: 11,
              rank: 1,
              matchedTerms: ["swim"],
            },
          ],
        },
        {
          _id: "program-swim",
          _type: "program",
          title: "Swimming program",
          score: 8,
          rank: 2,
          reasons: [],
          sources: [
            {
              kind: "direct",
              score: 8,
              rank: 2,
              matchedTerms: ["swim"],
            },
          ],
        },
      ],
    };

    return fakeResult;
  });

  const result = strategy.evaluatePrompt(prompt.prompt);

  assert.deepEqual(seenPlans, [{ prompt: prompt.prompt, kind: "sanityHybrid" }]);
  assert.equal(result.prompt, prompt.prompt);
  assert.deepEqual(result.matchedConcerns.map((match) => [match._id, match.rank]), [
    ["concern-swim-safety", 1],
    ["concern-homesickness-readiness", 2],
  ]);
  assert.deepEqual(result.directContentEntities.map((match) => [match._id, match.rank]), [
    ["protocol-waterfront-safety", 1],
  ]);
  assert.deepEqual(result.mergedContentEntities.map((match) => [match._id, match.rank]), [
    ["protocol-waterfront-safety", 1],
    ["program-swim", 2],
  ]);

  const report = renderRetrievalWorkbenchReport(fixture, [
    {
      id: "deterministic",
      label: "Deterministic",
      evaluatePrompt: () => ({
        prompt: prompt.prompt,
        matchedConcerns: [],
        directContentEntities: [],
        mergedContentEntities: [],
      }),
    } satisfies RetrievalStrategy,
    strategy,
  ]);

  assert.match(report, /Strategy: Sanity Hybrid/);
  assert.match(report, /Sanity Hybrid vs Deterministic/);
});
