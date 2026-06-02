import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAnswerSourceMaterials,
  validateAnswerComposerTopK,
} from "../../src/retrieval-workbench/answer-source-material.js";
import type { ParsedRetrievalWorkbenchFixture } from "../../src/retrieval-workbench/fixture-schema.js";
import type { PromptRetrievalResult } from "../../src/retrieval-workbench/retrieval-strategy.js";

function createFixture(): ParsedRetrievalWorkbenchFixture {
  return {
    fixtureVersion: 1,
    description: "answer source material fixture",
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
        contentMap: "Entity alpha content map.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
        sourceKind: "sourceOfTruth",
        priceCad: 1250,
        sensitiveUse: true,
        nested: { value: "not citeable" },
        list: ["not citeable"],
      },
      {
        _id: "entity-beta",
        _type: "policy",
        title: "Entity Beta",
        contentMap: "Entity beta content map.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
    ],
    goldSet: [
      {
        _id: "prompt-alpha",
        prompt: "What should we know?",
        expectedConcernIds: ["concern-alpha"],
        requiredContentEntityIds: ["entity-alpha"],
      },
    ],
  };
}

function createRetrievalResult(): PromptRetrievalResult {
  return {
    prompt: "What should we know?",
    matchedConcerns: [],
    directContentEntities: [],
    mergedContentEntities: [
      {
        _id: "entity-alpha",
        _type: "policy",
        title: "Entity Alpha",
        score: 10,
        rank: 1,
        reasons: [],
        sources: [{ kind: "direct", score: 10, rank: 1, matchedTerms: ["alpha"] }],
      },
      {
        _id: "entity-beta",
        _type: "policy",
        title: "Entity Beta",
        score: 8,
        rank: 2,
        reasons: [],
        sources: [{ kind: "direct", score: 8, rank: 2, matchedTerms: ["beta"] }],
      },
    ],
  };
}

test("source materials turn top-k Content Entities into deterministic citeable snippets", () => {
  const materials = buildAnswerSourceMaterials(createFixture(), createRetrievalResult(), 1);

  assert.equal(materials.length, 1);
  assert.deepEqual(
    materials[0]?.snippets.map((snippet) => [snippet.snippetId, snippet.field, snippet.text]),
    [
      ["entity-alpha:title", "title", "Entity Alpha"],
      ["entity-alpha:contentMap", "contentMap", "Entity alpha content map."],
      ["entity-alpha:priceCad", "priceCad", "1250"],
      ["entity-alpha:sensitiveUse", "sensitiveUse", "true"],
      ["entity-alpha:sourceKind", "sourceKind", "sourceOfTruth"],
    ],
  );
});

test("source material validation rejects invalid top-k values and unknown retrieval ids", () => {
  assert.throws(() => validateAnswerComposerTopK(0), /positive integer/);
  assert.throws(() => validateAnswerComposerTopK(1.5), /positive integer/);

  assert.throws(
    () =>
      buildAnswerSourceMaterials(
        createFixture(),
        {
          ...createRetrievalResult(),
          mergedContentEntities: [
            {
              _id: "entity-missing",
              _type: "policy",
              title: "Missing",
              score: 1,
              rank: 1,
              reasons: [],
              sources: [],
            },
          ],
        },
        1,
      ),
    /outside the fixture: entity-missing/,
  );
});
