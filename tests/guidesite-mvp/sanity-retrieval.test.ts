import assert from "node:assert/strict";
import test from "node:test";
import { createSanityGuideSiteRetrievalAdapter, type GuideSiteSanityRetrievalQuery } from "../../src/guidesite-mvp/sanity-retrieval.js";
import { canonicalGuideSiteUnderstanding } from "./test-helpers.js";
import type { PromptUnderstandingSessionContext } from "../../src/guidesite-mvp/types.js";

function createSessionContext(): PromptUnderstandingSessionContext {
  return {
    session: {
      schemaVersion: 1,
      sessionId: "session_sanity_retrieval",
      revision: 2,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:02:00.000Z",
      visitorFacts: {
        child_age: {
          value: 8,
          source: "explicit",
          status: "active",
        },
      },
      concerns: {
        homesickness: {
          status: "open",
          sourceRunIds: ["run_1"],
        },
      },
      focus: {
        goal: "assess_fit",
        contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
      },
      suggestedPrompts: [],
      summary: "Parent is assessing overnight camp Fit for an 8-year-old Child. The Child has prior sleepaway experience with grandparents.",
    },
  };
}

test("Sanity GuideSite retrieval adapter normalizes approved source documents into GuideSite Retrieval Results", () => {
  const observedQueries: GuideSiteSanityRetrievalQuery[] = [];
  const adapter = createSanityGuideSiteRetrievalAdapter((query) => {
    observedQueries.push(query);

    return [
      {
        _id: "concern_homesickness",
        _type: "concern",
        _rev: "mock_rev_concern_homesickness_001",
        sourceKind: "sourceOfTruth",
        title: "Homesickness and Child Readiness",
        summary: "Parents often need to assess Child Readiness by looking at prior sleepaway experience.",
      },
      {
        _id: "program_overnight",
        _type: "campProgram",
        _rev: "mock_rev_program_overnight_001",
        sourceKind: "sourceOfTruth",
        title: "Overnight Camp Program",
        body: "The overnight program is designed for children who are ready to spend several nights away from home.",
      },
      {
        _id: "policy_homesickness",
        _type: "policy",
        _rev: "mock_rev_policy_homesickness_001",
        sourceKind: "sourceOfTruth",
        title: "Homesickness Support Policy",
        summary: "Cabin staff watch for homesickness and help children settle into routines.",
      },
      {
        _id: "policy_parent_communication",
        _type: "policy",
        _rev: "mock_rev_policy_parent_communication_001",
        sourceKind: "sourceOfTruth",
        title: "Parent Communication Policy",
        summary: "Camp contacts parents when staff need family context or when adjustment concerns persist.",
      },
      {
        _id: "prompt_template_sleepaway_experience",
        _type: "promptTemplate",
        _rev: "mock_rev_prompt_template_sleepaway_experience_001",
        sourceKind: "sourceOfTruth",
        title: "Prior Sleepaway Experience Prompt Template",
        text: "Has your child slept away from home before?",
      },
      {
        _id: "prompt_template_child_readiness",
        _type: "promptTemplate",
        _rev: "mock_rev_prompt_template_child_readiness_001",
        sourceKind: "sourceOfTruth",
        title: "Child Readiness Prompt Template",
        text: "How does your child usually handle new routines or time away from you?",
      },
    ];
  });

  const retrieval = adapter.retrieve(canonicalGuideSiteUnderstanding, createSessionContext());

  assert.equal(adapter.id, "sanityHybrid");
  assert.equal(adapter.label, "Sanity Hybrid");
  assert.equal(observedQueries.length, 1);
  assert.match(observedQueries[0]?.searchText ?? "", /overnight/i);
  assert.match(observedQueries[0]?.searchText ?? "", /homesickness/i);
  assert.match(observedQueries[0]?.searchText ?? "", /grandparents/i);
  assert.deepEqual(retrieval.adapterId, "sanityHybrid");
  assert.deepEqual(retrieval.adapterLabel, "Sanity Hybrid");
  assert.deepEqual(
    retrieval.results.map((result) => ({
      sourceId: result.sourceId,
      sourceType: result.sourceType,
      title: result.title,
      rank: result.rank,
      fieldPath: result.fieldPath,
      sourceRevision: result.sourceRevision,
    })),
    [
      {
        sourceId: "concern_homesickness",
        sourceType: "concern",
        title: "Homesickness and Child Readiness",
        rank: 1,
        fieldPath: "summary",
        sourceRevision: "mock_rev_concern_homesickness_001",
      },
      {
        sourceId: "program_overnight",
        sourceType: "campProgram",
        title: "Overnight Camp Program",
        rank: 2,
        fieldPath: "body",
        sourceRevision: "mock_rev_program_overnight_001",
      },
      {
        sourceId: "policy_homesickness",
        sourceType: "policy",
        title: "Homesickness Support Policy",
        rank: 3,
        fieldPath: "summary",
        sourceRevision: "mock_rev_policy_homesickness_001",
      },
      {
        sourceId: "policy_parent_communication",
        sourceType: "policy",
        title: "Parent Communication Policy",
        rank: 4,
        fieldPath: "summary",
        sourceRevision: "mock_rev_policy_parent_communication_001",
      },
      {
        sourceId: "prompt_template_sleepaway_experience",
        sourceType: "promptTemplate",
        title: "Prior Sleepaway Experience Prompt Template",
        rank: 5,
        fieldPath: "text",
        sourceRevision: "mock_rev_prompt_template_sleepaway_experience_001",
      },
      {
        sourceId: "prompt_template_child_readiness",
        sourceType: "promptTemplate",
        title: "Child Readiness Prompt Template",
        rank: 6,
        fieldPath: "text",
        sourceRevision: "mock_rev_prompt_template_child_readiness_001",
      },
    ],
  );
  assert.deepEqual(retrieval.coverage, {
    status: "source_backed",
    matchedSourceIds: [
      "concern_homesickness",
      "program_overnight",
      "policy_homesickness",
      "policy_parent_communication",
      "prompt_template_sleepaway_experience",
      "prompt_template_child_readiness",
    ],
  });
  assert.deepEqual(retrieval.diagnostics, []);
});

test("Sanity GuideSite retrieval adapter reports insufficient source diagnostics when only draft or system material is available", () => {
  const adapter = createSanityGuideSiteRetrievalAdapter(() => [
    {
      _id: "_.groups.public",
      _type: "system.group",
      _rev: "mock_rev_system_001",
      sourceKind: "draft",
      title: "Public Group",
      summary: "System material that should never be used as source material.",
    },
    {
      _id: "draft_policy_homesickness",
      _type: "policy",
      _rev: "mock_rev_draft_policy_homesickness_001",
      sourceKind: "draft",
      title: "Draft Homesickness Support Policy",
      summary: "Draft policy content that must not be normalized into retrieval results.",
    },
  ]);

  const retrieval = adapter.retrieve(canonicalGuideSiteUnderstanding);

  assert.deepEqual(retrieval.results, []);
  assert.deepEqual(retrieval.coverage, {
    status: "empty_retrieval",
    matchedSourceIds: [],
  });
  assert.match(retrieval.diagnostics.join(" "), /insufficient_sanity_sources/);
  assert.match(retrieval.diagnostics.join(" "), /sanity_retrieval_rejected_unapproved_sources/);
});

test("Sanity GuideSite retrieval adapter excludes approved-looking documents that are missing the sourceOfTruth marker", () => {
  const adapter = createSanityGuideSiteRetrievalAdapter(() => [
    {
      _id: "policy_parent_communication",
      _type: "policy",
      _rev: "mock_rev_policy_parent_communication_001",
      title: "Parent Communication Policy",
      summary: "Camp contacts parents when staff need family context or when adjustment concerns persist.",
    },
    {
      _id: "prompt_template_child_readiness",
      _type: "promptTemplate",
      _rev: "mock_rev_prompt_template_child_readiness_001",
      sourceKind: "sourceOfTruth",
      title: "Child Readiness Prompt Template",
      text: "How does your child usually handle new routines or time away from you?",
    },
  ]);

  const retrieval = adapter.retrieve(canonicalGuideSiteUnderstanding);

  assert.deepEqual(retrieval.results.map((result) => result.sourceId), ["prompt_template_child_readiness"]);
  assert.deepEqual(retrieval.coverage, {
    status: "source_backed",
    matchedSourceIds: ["prompt_template_child_readiness"],
  });
  assert.deepEqual(retrieval.diagnostics, []);
});
