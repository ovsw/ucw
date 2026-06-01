import assert from "node:assert/strict";
import test from "node:test";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";
import type { ParsedRetrievalWorkbenchFixture } from "../../src/retrieval-workbench/fixture-schema.js";
import type {
  PromptRetrievalResult,
  RetrievalStrategy,
} from "../../src/retrieval-workbench/retrieval-strategy.js";

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

test("evaluation notes stay local to benchmark reporting and do not reach retrieval strategies", () => {
  const fixture: ParsedRetrievalWorkbenchFixture = {
    fixtureVersion: 1,
    description: "evaluation note fixture",
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
        _id: "entity-alpha",
        _type: "policy",
        title: "Entity Alpha",
        contentMap: "Entity alpha content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
    ],
    goldSet: [
      {
        _id: "prompt-evaluation-notes",
        prompt: "How should this be handled?",
        expectedConcernIds: ["concern-alpha"],
        requiredContentEntityIds: ["entity-alpha"],
        evaluationNotes: ["semanticFailure", "fixtureGap"],
      },
    ],
  };

  const seenPrompts: string[] = [];
  const strategy: RetrievalStrategy = {
    id: "spy",
    label: "Spy",
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      seenPrompts.push(prompt);

      return {
        prompt,
        matchedConcerns: [],
        directContentEntities: [],
        mergedContentEntities: [],
      };
    },
  };

  renderRetrievalWorkbenchReport(fixture, [strategy]);

  assert.deepEqual(seenPrompts, [fixture.goldSet[0].prompt]);
  assert.doesNotMatch(seenPrompts[0], /semanticFailure|impliedNeedFailure|fixtureGap/);
});

test("report surfaces evaluation note categories for weak ranks and missing results", () => {
  const fixture: ParsedRetrievalWorkbenchFixture = {
    fixtureVersion: 1,
    description: "evaluation note report fixture",
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
        _id: "entity-alpha",
        _type: "policy",
        title: "Entity Alpha",
        contentMap: "Entity alpha content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
    ],
    goldSet: [
      {
        _id: "prompt-evaluation-notes",
        prompt: "How should this be handled?",
        expectedConcernIds: ["concern-alpha"],
        requiredContentEntityIds: ["entity-alpha"],
        evaluationNotes: ["semanticFailure", "fixtureGap"],
      },
    ],
  };

  const strategy: RetrievalStrategy = {
    id: "weak-strategy",
    label: "Weak Strategy",
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      return {
        prompt,
        matchedConcerns: [],
        directContentEntities: [],
        mergedContentEntities: [createContentEntityMatch("entity-alpha", "Entity Alpha", 12, 1)],
      };
    },
  };

  const report = renderRetrievalWorkbenchReport(fixture, [strategy]);

  assert.match(report, /Missing expected concerns: concern-alpha/);
  assert.match(report, /Evaluation notes: semanticFailure, fixtureGap/);
});
