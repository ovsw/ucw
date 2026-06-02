import assert from "node:assert/strict";
import test from "node:test";
import { mergeConcernSurfacingResultIntoRetrievalResult } from "../../src/retrieval-workbench/concern-surfacing.js";
import {
  checkAnswerCompositionCoverage,
  composeAnswerForPrompt,
  type AnswerComposer,
} from "../../src/retrieval-workbench/answer-composition.js";
import { buildAnswerSourceMaterials } from "../../src/retrieval-workbench/answer-source-material.js";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import type { ParsedRetrievalWorkbenchFixture } from "../../src/retrieval-workbench/fixture-schema.js";
import type { PromptRetrievalResult } from "../../src/retrieval-workbench/retrieval-strategy.js";

function createFixture(): ParsedRetrievalWorkbenchFixture {
  return {
    fixtureVersion: 1,
    description: "answer composition fixture",
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
      {
        _id: "entity-beta",
        _type: "policy",
        title: "Entity Beta",
        contentMap: "Entity beta content.",
        relatedConcerns: [{ _type: "reference", _ref: "concern-alpha" }],
      },
    ],
    goldSet: [
      {
        _id: "prompt-alpha",
        prompt: "Can you answer this?",
        expectedConcernIds: ["concern-alpha"],
        requiredContentEntityIds: ["entity-alpha", "entity-beta"],
        requiredSourceOfTruthIds: ["entity-beta"],
      },
    ],
  };
}

function createRetrievalResult(ids: string[]): PromptRetrievalResult {
  return {
    prompt: "Can you answer this?",
    matchedConcerns: [],
    directContentEntities: [],
    mergedContentEntities: ids.map((id, index) => ({
      _id: id,
      _type: "policy",
      title: id,
      score: 10 - index,
      rank: index + 1,
      reasons: [],
      sources: [{ kind: "direct", score: 10 - index, rank: index + 1, matchedTerms: ["prompt"] }],
    })),
  };
}

test("coverage gating marks composition unsafe before the provider when required sources are absent", async () => {
  const fixture = createFixture();
  const prompt = fixture.goldSet[0];
  assert.ok(prompt);

  let providerCalls = 0;
  const composer: AnswerComposer = {
    async compose() {
      providerCalls += 1;
      throw new Error("provider should not be called");
    },
  };

  const result = await composeAnswerForPrompt({
    fixture,
    prompt,
    retrievalResult: createRetrievalResult(["entity-alpha"]),
    sourceStrategy: { id: "sanityHybrid", label: "Sanity Hybrid" },
    topK: 1,
    composer,
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.status, "unsafe");
  assert.equal(result.draft, null);
  assert.deepEqual(result.diagnostics.coverageFailures, [
    { kind: "requiredContent", missingIds: ["entity-beta"] },
    { kind: "requiredSourceOfTruth", missingIds: ["entity-beta"] },
  ]);
  assert.match(result.diagnostics.missingSourceOfTruth[0] ?? "", /entity-beta/);
});

test("successful composition returns a draft and validated citation diagnostics", async () => {
  const fixture = createFixture();
  const prompt = fixture.goldSet[0];
  assert.ok(prompt);

  const composer: AnswerComposer = {
    async compose(input) {
      assert.deepEqual(input.sourceMaterials.map((material) => material.sourceId), ["entity-alpha", "entity-beta"]);

      return {
        status: "composed",
        draft: "Entity alpha and beta are both covered.",
        citedSources: [
          {
            sourceId: "entity-alpha",
            snippetId: "entity-alpha:contentMap",
            claimIds: ["claim-1"],
          },
        ],
        claims: [
          {
            claimId: "claim-1",
            text: "Entity alpha is covered.",
            evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
          },
        ],
        diagnostics: {
          unsupportedClaims: [],
          missingSourceOfTruth: [],
          followUpQuestions: ["Is there a dated policy?"],
        },
      };
    },
  };

  const result = await composeAnswerForPrompt({
    fixture,
    prompt,
    retrievalResult: createRetrievalResult(["entity-alpha", "entity-beta"]),
    sourceStrategy: { id: "sanityHybrid", label: "Sanity Hybrid" },
    topK: 2,
    composer,
  });

  assert.equal(result.status, "composed");
  assert.equal(result.draft, "Entity alpha and beta are both covered.");
  assert.equal(result.claims[0]?.claimId, "claim-1");
  assert.deepEqual(result.diagnostics.coverageFailures, []);
  assert.deepEqual(result.diagnostics.followUpQuestions, ["Is there a dated policy?"]);
});

test("provider missing source-of-truth diagnostics mark composition unsafe and withhold draft", async () => {
  const fixture = createFixture();
  const prompt = fixture.goldSet[0];
  assert.ok(prompt);

  const composer: AnswerComposer = {
    async compose() {
      return {
        status: "composed",
        draft: "Entity alpha is covered, but deposit detail is missing.",
        citedSources: [
          {
            sourceId: "entity-alpha",
            snippetId: "entity-alpha:contentMap",
            claimIds: ["claim-1"],
          },
        ],
        claims: [
          {
            claimId: "claim-1",
            text: "Entity alpha is covered.",
            evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
          },
        ],
        diagnostics: {
          unsupportedClaims: [],
          missingSourceOfTruth: ["specific deposit amounts"],
          followUpQuestions: ["What deposit amount applies?"],
        },
      };
    },
  };

  const result = await composeAnswerForPrompt({
    fixture,
    prompt,
    retrievalResult: createRetrievalResult(["entity-alpha", "entity-beta"]),
    sourceStrategy: { id: "sanityHybrid", label: "Sanity Hybrid" },
    topK: 2,
    composer,
  });

  assert.equal(result.status, "unsafe");
  assert.equal(result.draft, null);
  assert.deepEqual(result.citedSources, []);
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.diagnostics.missingSourceOfTruth, ["specific deposit amounts"]);
  assert.deepEqual(result.diagnostics.followUpQuestions, ["What deposit amount applies?"]);
});

test("approved surfaced Concerns can affect source selection, but missing candidates stay out of evidence", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-price-refund");
  assert.ok(prompt);

  const surfacedResult = mergeConcernSurfacingResultIntoRetrievalResult(
    fixture,
    {
      prompt: prompt.prompt,
      matchedConcerns: [],
      directContentEntities: [],
      mergedContentEntities: [],
    },
    {
      surfacedConcerns: [
        {
          concernId: "concern-pricing-affordability",
          rationale: "The prompt asks about cost, deposits, and cancellation.",
        },
      ],
      missingConcernCandidates: [
        {
          description: "Installment-plan promise",
          rationale: "The prompt may imply payment-plan detail that is not in the approved catalog.",
        },
      ],
    },
  );
  const sourceMaterials = buildAnswerSourceMaterials(fixture, surfacedResult, 5);
  const coverageFailures = checkAnswerCompositionCoverage(prompt, sourceMaterials);
  const serializedSourceMaterials = JSON.stringify(sourceMaterials);

  assert.deepEqual(coverageFailures, []);
  assert.ok(sourceMaterials.some((material) => material.sourceId === "policy-pricing-refunds"));
  assert.doesNotMatch(serializedSourceMaterials, /Installment-plan promise/);
  assert.doesNotMatch(serializedSourceMaterials, /payment-plan detail/);
});
