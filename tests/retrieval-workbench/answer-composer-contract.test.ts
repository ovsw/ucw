import assert from "node:assert/strict";
import test from "node:test";
import {
  validateAnswerComposerProviderResultDetailed,
  validateAnswerComposerProviderResult,
  type AnswerComposerProviderResult,
} from "../../src/retrieval-workbench/answer-composer-contract.js";
import type { AnswerSourceMaterial } from "../../src/retrieval-workbench/answer-source-material.js";

const sourceMaterials: AnswerSourceMaterial[] = [
  {
    sourceId: "entity-alpha",
    sourceType: "policy",
    title: "Entity Alpha",
    rank: 1,
    score: 10,
    snippets: [
      {
        sourceId: "entity-alpha",
        snippetId: "entity-alpha:title",
        field: "title",
        text: "Entity Alpha",
      },
      {
        sourceId: "entity-alpha",
        snippetId: "entity-alpha:contentMap",
        field: "contentMap",
        text: "Alpha source text.",
      },
    ],
  },
  {
    sourceId: "entity-beta",
    sourceType: "policy",
    title: "Entity Beta",
    rank: 2,
    score: 8,
    snippets: [
      {
        sourceId: "entity-beta",
        snippetId: "entity-beta:title",
        field: "title",
        text: "Entity Beta",
      },
    ],
  },
];

function createValidProviderResult(): AnswerComposerProviderResult {
  return {
    status: "composed",
    draft: "Use the alpha policy as the source-grounded answer.",
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
        text: "The answer uses alpha source text.",
        evidence: [
          {
            sourceId: "entity-alpha",
            snippetId: "entity-alpha:contentMap",
          },
        ],
      },
    ],
    diagnostics: {
      unsupportedClaims: [
        {
          text: "Specific date claim",
          reason: "No date snippet was supplied.",
        },
      ],
      missingSourceOfTruth: [],
      followUpQuestions: ["Which session date applies?"],
    },
  };
}

test("Answer Composer validation accepts a cited claim/evidence map", () => {
  assert.deepEqual(validateAnswerComposerProviderResult(createValidProviderResult(), sourceMaterials), createValidProviderResult());
});

test("Answer Composer validation rejects malformed drafts and claims without evidence", () => {
  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          draft: "",
        },
        sourceMaterials,
      ),
    /draft/,
  );

  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          claims: [{ claimId: "claim-1", text: "Unsupported shape", evidence: [] }],
        },
        sourceMaterials,
      ),
    /evidence/,
  );
});

test("Answer Composer validation rejects unknown and cross-source citation references", () => {
  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          claims: [
            {
              claimId: "claim-1",
              text: "Unknown source.",
              evidence: [{ sourceId: "entity-missing", snippetId: "entity-alpha:contentMap" }],
            },
          ],
        },
        sourceMaterials,
      ),
    /unknown source ids: entity-missing/,
  );

  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          claims: [
            {
              claimId: "claim-1",
              text: "Unknown snippet.",
              evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:missing" }],
            },
          ],
        },
        sourceMaterials,
      ),
    /unknown snippet ids: entity-alpha:missing/,
  );

  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          claims: [
            {
              claimId: "claim-1",
              text: "Cross-source snippet.",
              evidence: [{ sourceId: "entity-alpha", snippetId: "entity-beta:title" }],
            },
          ],
        },
        sourceMaterials,
      ),
    /cross-source snippet references: entity-alpha -> entity-beta:title/,
  );
});

test("Answer Composer validation rejects cited source entries that reference unknown claims", () => {
  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          citedSources: [
            {
              sourceId: "entity-alpha",
              snippetId: "entity-alpha:contentMap",
              claimIds: ["claim-missing"],
            },
          ],
        },
        sourceMaterials,
      ),
    /claim references outside claims: claim-missing/,
  );
});

test("Answer Composer validation can repair cited source claim ids from matching claim evidence", () => {
  const result = validateAnswerComposerProviderResultDetailed(
    {
      ...createValidProviderResult(),
      citedSources: [
        {
          sourceId: "entity-alpha",
          snippetId: "entity-alpha:contentMap",
          claimIds: ["deposit-details", "refund-details"],
        },
      ],
      claims: [
        {
          claimId: "claim-1",
          text: "Deposit and refund details are described by alpha.",
          evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
        },
      ],
    },
    sourceMaterials,
    {
      repairCitedSourceClaimIds: true,
      context: {
        promptId: "prompt-price-refund",
        sourceStrategyId: "sanityHybridOpenAIConcernSurfacing",
        selectedSourceIds: ["entity-alpha"],
      },
    },
  );

  assert.deepEqual(result.result.citedSources[0]?.claimIds, ["claim-1"]);
  assert.deepEqual(result.citationDiagnostics, [
    "Repaired cited source claim IDs for entity-alpha#entity-alpha:contentMap: removed deposit-details, refund-details; added claim-1",
  ]);
});

test("Answer Composer validation can rebuild cited sources from claim evidence when claim ids are unrecoverable", () => {
  const result = validateAnswerComposerProviderResultDetailed(
    {
      ...createValidProviderResult(),
      citedSources: [
        {
          sourceId: "entity-beta",
          snippetId: "entity-beta:title",
          claimIds: ["6"],
        },
      ],
      claims: [
        {
          claimId: "claim-1",
          text: "The alpha source supports the answer.",
          evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
        },
      ],
    },
    sourceMaterials,
    { repairCitedSourceClaimIds: true },
  );

  assert.deepEqual(result.result.citedSources, [
    {
      sourceId: "entity-alpha",
      snippetId: "entity-alpha:contentMap",
      claimIds: ["claim-1"],
    },
  ]);
  assert.deepEqual(result.citationDiagnostics, [
    "Rebuilt cited source list from claim evidence after invalid cited source claim IDs: 6; cited sources: 1",
  ]);
});

test("Answer Composer validation errors include prompt and selected source context", () => {
  assert.throws(
    () =>
      validateAnswerComposerProviderResult(
        {
          ...createValidProviderResult(),
          claims: [
            {
              claimId: "claim-1",
              text: "Unknown source.",
              evidence: [{ sourceId: "entity-missing", snippetId: "entity-alpha:contentMap" }],
            },
          ],
        },
        sourceMaterials,
        {
          context: {
            promptId: "prompt-alpha",
            sourceStrategyId: "sanityHybrid",
            selectedSourceIds: ["entity-alpha", "entity-beta"],
          },
        },
      ),
    /for prompt prompt-alpha; source strategy sanityHybrid; selected sources entity-alpha, entity-beta: unknown source ids: entity-missing/,
  );
});
