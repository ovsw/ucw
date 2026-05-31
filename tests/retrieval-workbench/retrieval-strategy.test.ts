import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { createDeterministicWorkbench } from "../../src/retrieval-workbench/deterministic-retrieval.js";
import type { ParsedRetrievalWorkbenchFixture } from "../../src/retrieval-workbench/fixture-schema.js";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";
import type {
  PromptRetrievalResult,
  RetrievalStrategy,
} from "../../src/retrieval-workbench/retrieval-strategy.js";
import { createDeterministicRetrievalStrategy } from "../../src/retrieval-workbench/retrieval-strategy.js";

function createContentEntityMatch(
  id: string,
  title: string,
  rank: number,
  score: number,
): PromptRetrievalResult["mergedContentEntities"][number] {
  return {
    _id: id,
    _type: "policy",
    title,
    score,
    rank,
    reasons: [],
    sources: [
      {
        kind: "direct",
        score,
        rank,
        matchedTerms: ["prompt"],
      },
    ],
  };
}

function createConcernMatch(
  id: string,
  title: string,
  rank: number,
  score: number,
): PromptRetrievalResult["matchedConcerns"][number] {
  return {
    _id: id,
    _type: "concern",
    title,
    score,
    rank,
    reasons: [],
  };
}

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

test("retrieval workbench report summarizes rank-based top-k usefulness per strategy", async () => {
  const fixture: ParsedRetrievalWorkbenchFixture = {
    fixtureVersion: 1 as const,
    description: "rank summary fixture",
    documents: [
      {
        _id: "concern-alpha",
        _type: "concern",
        title: "Concern Alpha",
        contentMap: "Concern alpha content.",
        concernArea: "alpha",
        parentSignals: ["alpha"],
      },
      {
        _id: "entity-one",
        _type: "policy",
        title: "Entity One",
        contentMap: "Entity one content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
      {
        _id: "entity-two",
        _type: "policy",
        title: "Entity Two",
        contentMap: "Entity two content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
      {
        _id: "entity-three",
        _type: "policy",
        title: "Entity Three",
        contentMap: "Entity three content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
    ],
    goldSet: [
      {
        _id: "prompt-rank-summary",
        prompt: "How should we handle this situation?",
        expectedConcernIds: ["concern-alpha"],
        requiredContentEntityIds: ["entity-one", "entity-two", "entity-three"],
      },
    ],
  };

  const prompt = fixture.goldSet[0];
  assert.ok(prompt);

  const deterministicStrategy: RetrievalStrategy = {
    id: "deterministic",
    label: "Deterministic",
    evaluatePrompt: () => ({
      prompt: prompt.prompt,
      matchedConcerns: [createConcernMatch("concern-alpha", "Concern Alpha", 1, 10)],
      directContentEntities: [],
      mergedContentEntities: [
        createContentEntityMatch("entity-one", "Entity One", 1, 10),
        createContentEntityMatch("entity-two", "Entity Two", 6, 6),
        createContentEntityMatch("entity-three", "Entity Three", 12, 2),
      ],
    }),
  };

  const sanityKeywordStrategy: RetrievalStrategy = {
    id: "sanityKeyword",
    label: "Sanity Keyword",
    evaluatePrompt: () => ({
      prompt: prompt.prompt,
      matchedConcerns: [createConcernMatch("concern-alpha", "Concern Alpha", 1, 9)],
      directContentEntities: [],
      mergedContentEntities: [
        createContentEntityMatch("entity-one", "Entity One", 2, 9),
        createContentEntityMatch("entity-two", "Entity Two", 4, 7),
      ],
    }),
  };

  const report = renderRetrievalWorkbenchReport(fixture, [deterministicStrategy, sanityKeywordStrategy]);

  assert.match(report, /Strategy summary:/);
  assert.match(report, /Deterministic \(baseline\):/);
  assert.match(report, /Sanity Keyword vs Deterministic:/);
  assert.match(report, /top 5 required content hits: 1\/3/);
  assert.match(report, /top 10 required content hits: 2\/3/);
  assert.match(report, /average required rank: 6\.33/);
  assert.match(report, /average required rank: 3\.00/);
  assert.match(report, /missing required content: 1/);
  assert.match(report, /improvements: 1/);
  assert.match(report, /regressions: 2/);
});
