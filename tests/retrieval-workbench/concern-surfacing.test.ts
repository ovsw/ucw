import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApprovedConcernCatalog,
  mergeConcernSurfacingResultIntoRetrievalResult,
  validateConcernSurfacingResult,
} from "../../src/retrieval-workbench/concern-surfacing.js";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import type { PromptRetrievalResult } from "../../src/retrieval-workbench/retrieval-strategy.js";

test("Concern Surfacing validation accepts empty missing candidates but rejects unknown approved Concern ids", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const catalog = buildApprovedConcernCatalog(fixture);

  assert.deepEqual(
    validateConcernSurfacingResult(
      {
        surfacedConcerns: [
          {
            concernId: "concern-pricing-affordability",
            rationale: "The prompt asks about a gentler option and may imply plan changes or cost concerns.",
          },
        ],
        missingConcernCandidates: [],
      },
      catalog,
    ),
    {
      surfacedConcerns: [
        {
          concernId: "concern-pricing-affordability",
          rationale: "The prompt asks about a gentler option and may imply plan changes or cost concerns.",
        },
      ],
      missingConcernCandidates: [],
    },
  );

  assert.throws(
    () =>
      validateConcernSurfacingResult(
        {
          surfacedConcerns: [
            {
              concernId: "concern-not-approved",
              rationale: "This id is not in the approved Concern catalog.",
            },
          ],
          missingConcernCandidates: [],
        },
        catalog,
      ),
    /unknown approved Concern ids: concern-not-approved/,
  );

  assert.throws(
    () =>
      validateConcernSurfacingResult(
        {
          surfacedConcerns: [],
        },
        catalog,
      ),
    /missingConcernCandidates/,
  );
});

test("AI-surfaced approved Concerns expand through related Concerns without changing direct Content Entity matches", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const prompt = fixture.goldSet.find((entry) => entry._id === "prompt-day-camp-alternative");

  assert.ok(prompt);

  const baseResult: PromptRetrievalResult = {
    prompt: prompt.prompt,
    matchedConcerns: [],
    directContentEntities: [],
    mergedContentEntities: [],
  };

  const result = mergeConcernSurfacingResultIntoRetrievalResult(fixture, baseResult, {
    surfacedConcerns: [
      {
        concernId: "concern-pricing-affordability",
        rationale: "Choosing a gentler alternative may require registration, cancellation, or refund guidance.",
      },
    ],
    missingConcernCandidates: [
      {
        description: "Day-camp transition fit",
        rationale: "The catalog has readiness and pricing, but not a specific day-camp transition concern.",
      },
    ],
  });

  assert.deepEqual(result.directContentEntities, []);
  assert.equal(result.concernSurfacing?.missingConcernCandidates[0]?.description, "Day-camp transition fit");
  assert.ok(result.matchedConcerns.some((match) => match._id === "concern-pricing-affordability"));

  const registrationPolicy = result.mergedContentEntities.find(
    (match) => match._id === "policy-registration-cancellation",
  );

  assert.ok(registrationPolicy);
  assert.ok(
    registrationPolicy.sources.some(
      (source) =>
        source.kind === "concernExpansion" &&
        source.concernId === "concern-pricing-affordability",
    ),
  );
});
