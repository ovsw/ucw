import assert from "node:assert/strict";
import test from "node:test";
import { renderRetrievalWorkbenchReport } from "../../src/retrieval-workbench/report.js";
import type { AnswerCompositionResult } from "../../src/retrieval-workbench/answer-composition.js";
import type { ParsedRetrievalWorkbenchFixture } from "../../src/retrieval-workbench/fixture-schema.js";
import type { RetrievalStrategy } from "../../src/retrieval-workbench/retrieval-strategy.js";

const fixture: ParsedRetrievalWorkbenchFixture = {
  fixtureVersion: 1,
  description: "answer report fixture",
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
      _id: "prompt-alpha",
      prompt: "How would camp handle this?",
      expectedConcernIds: ["concern-alpha"],
      requiredContentEntityIds: ["entity-alpha"],
      requiredSourceOfTruthIds: ["entity-alpha"],
    },
  ],
};

const strategy: RetrievalStrategy = {
  id: "sanityHybrid",
  label: "Sanity Hybrid",
  evaluatePrompt(prompt) {
    return {
      prompt,
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
      ],
    };
  },
};

const concernSurfacingStrategy: RetrievalStrategy = {
  id: "sanityHybridOpenAIConcernSurfacing",
  label: "Sanity Hybrid + OpenAI Concern Surfacing",
  evaluatePrompt: strategy.evaluatePrompt,
};

function createComposedResult(): AnswerCompositionResult {
  return {
    status: "composed",
    promptId: "prompt-alpha",
    parentPrompt: "How would camp handle this?",
    sourceStrategy: { id: "sanityHybrid", label: "Sanity Hybrid" },
    topK: 5,
    sourceMaterials: [
      {
        sourceId: "entity-alpha",
        sourceType: "policy",
        title: "Entity Alpha",
        rank: 1,
        score: 10,
        snippets: [
          {
            sourceId: "entity-alpha",
            snippetId: "entity-alpha:contentMap",
            field: "contentMap",
            text: "Entity alpha content.",
          },
        ],
      },
    ],
    draft: "Camp uses the alpha policy.",
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
        text: "The alpha policy supports the answer.",
        evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
      },
    ],
    diagnostics: {
      coverageFailures: [],
      citationFailures: [
        "Repaired cited source claim IDs for entity-alpha#entity-alpha:contentMap: removed deposit-details; added claim-1",
      ],
      unsupportedClaims: [
        {
          text: "Specific date",
          reason: "No date source was supplied.",
        },
      ],
      missingSourceOfTruth: ["No dated policy source supplied."],
      followUpQuestions: ["Which date applies?"],
    },
  };
}

test("report renders composed Answer Composer output without removing retrieval summaries", () => {
  const report = renderRetrievalWorkbenchReport(fixture, [strategy], [createComposedResult()]);

  assert.match(report, /Strategy summary:/);
  assert.match(report, /Sanity Hybrid \(baseline\):/);
  assert.match(report, /Answer Composer Harness \(report-only\)/);
  assert.match(report, /Source strategy: Sanity Hybrid \[sanityHybrid\]/);
  assert.match(report, /Draft:\nCamp uses the alpha policy/);
  assert.match(report, /Cited source snippets:/);
  assert.match(report, /entity-alpha#entity-alpha:contentMap \(claim-1\): contentMap: Entity alpha content/);
  assert.match(report, /Citation validation diagnostics:/);
  assert.match(report, /removed deposit-details; added claim-1/);
  assert.match(report, /Claim coverage:/);
  assert.match(report, /claim-1: The alpha policy supports the answer/);
  assert.match(report, /Unsupported claims:\n- Specific date: No date source was supplied/);
  assert.match(report, /Missing source-of-truth diagnostics:\n- No dated policy source supplied/);
  assert.match(report, /Follow-up questions:\n- Which date applies/);
});

test("report renders unsafe Answer Composer output as provider-skipped", () => {
  const unsafeResult: AnswerCompositionResult = {
    ...createComposedResult(),
    status: "unsafe",
    draft: null,
    citedSources: [],
    claims: [],
    diagnostics: {
      coverageFailures: [{ kind: "requiredContent", missingIds: ["entity-beta"] }],
      citationFailures: [],
      unsupportedClaims: [],
      missingSourceOfTruth: [],
      followUpQuestions: [],
    },
  };

  const report = renderRetrievalWorkbenchReport(fixture, [strategy], [unsafeResult]);

  assert.match(report, /Composition status: unsafe/);
  assert.match(report, /Missing required Content Entities in top 5: entity-beta/);
  assert.match(report, /Draft: none \(provider call skipped\)/);
  assert.match(report, /Cited source snippets:\n- none/);
});

test("report renders unsafe provider source-of-truth diagnostics as withheld output", () => {
  const unsafeResult: AnswerCompositionResult = {
    ...createComposedResult(),
    status: "unsafe",
    draft: null,
    citedSources: [],
    claims: [],
    diagnostics: {
      coverageFailures: [],
      citationFailures: [],
      unsupportedClaims: [],
      missingSourceOfTruth: ["specific deposit amounts"],
      followUpQuestions: ["What deposit amount applies?"],
    },
  };

  const report = renderRetrievalWorkbenchReport(fixture, [strategy], [unsafeResult]);

  assert.match(report, /Composition status: unsafe/);
  assert.match(report, /Provider reported missing source-of-truth: specific deposit amounts/);
  assert.match(report, /Draft: none \(provider output withheld\)/);
  assert.match(report, /Missing source-of-truth diagnostics:\n- specific deposit amounts/);
});

test("report calls out when OpenAI Concern Surfacing has no source-selection impact", () => {
  const report = renderRetrievalWorkbenchReport(fixture, [strategy, concernSurfacingStrategy]);

  assert.match(report, /Concern Surfacing source-selection impact:/);
  assert.match(report, /changed prompt source sets: 0\/1, required rank improvements: 0, regressions: 0, ties: 1/);
  assert.match(report, /Prompts with changed top 5 sources: none/);
  assert.match(report, /No source-selection improvement observed/);
});
