import assert from "node:assert/strict";
import test from "node:test";
import { validateAnswerCompositionCandidate } from "../../src/guidesite-mvp/answer-composition-contract.js";
import type { AnswerComposition, RetrievalResults } from "../../src/guidesite-mvp/types.js";

const retrieval: RetrievalResults = {
  needs: ["overnight_readiness"],
  concerns: ["homesickness"],
  results: [
    {
      sourceId: "program_overnight",
      sourceType: "campProgram",
      title: "Overnight Camp Program",
      rank: 1,
      fieldPath: "summary",
      sourceRevision: "mock_rev_program_overnight_001",
      sourceText: "The overnight Camp Program gives children a residential camp experience with cabin life.",
    },
    {
      sourceId: "concern_homesickness",
      sourceType: "concern",
      title: "Homesickness and Child Readiness",
      rank: 2,
      fieldPath: "summary",
      sourceRevision: "mock_rev_concern_homesickness_001",
      sourceText: "Parents often need to assess Child Readiness by looking at prior sleepaway experience.",
    },
    {
      sourceId: "policy_homesickness",
      sourceType: "policy",
      title: "Homesickness Support Policy",
      rank: 3,
      fieldPath: "summary",
      sourceRevision: "mock_rev_policy_homesickness_001",
      sourceText: "Cabin staff watch for homesickness and help children settle into routines.",
    },
    {
      sourceId: "policy_parent_communication",
      sourceType: "policy",
      title: "Parent Communication Policy",
      rank: 4,
      fieldPath: "summary",
      sourceRevision: "mock_rev_policy_parent_communication_001",
      sourceText: "Camp contacts parents when staff need family context or when adjustment concerns persist.",
    },
  ],
  diagnostics: [],
  coverage: {
    status: "source_backed",
    matchedSourceIds: ["program_overnight", "concern_homesickness", "policy_homesickness", "policy_parent_communication"],
  },
};

const validComposition: AnswerComposition = {
  status: "needs_context",
  conversationalFraming: "Age 8 is relevant, but more Visitor Context is needed.",
  sections: [
    {
      kind: "summary",
      title: "Known Context",
      body: "The Parent is asking about overnight camp for an 8-year-old Child.",
      sourceRefs: [
        {
          sourceId: "program_overnight",
          sourceType: "campProgram",
          title: "Overnight Camp Program",
          fieldPath: "summary",
          sourceRevision: "mock_rev_program_overnight_001",
        },
      ],
    },
    {
      kind: "diagnostics",
      title: "Diagnostics",
      body: "No recommendation was made yet.",
    },
  ],
  suggestedPrompts: [],
  citations: ["program_overnight"],
  diagnostics: ["needs_visitor_context"],
};

const approvedSuggestedPrompts: AnswerComposition["suggestedPrompts"] = [
  {
    id: "prompt_prior_sleepaway_experience",
    purpose: "gather_fit_context",
    text: "Has your child slept away from home before?",
    contextNeeds: ["prior_sleepaway_experience"],
    concerns: ["homesickness"],
    templateId: "ask_sleepaway_experience",
  },
  {
    id: "prompt_child_readiness",
    purpose: "gather_fit_context",
    text: "How does your child usually handle new routines or time away from you?",
    contextNeeds: ["child_readiness"],
    concerns: ["child_readiness"],
    templateId: "ask_child_readiness",
  },
];

test("Answer Composition contract accepts the canonical semantic shape", () => {
  assert.deepEqual(validateAnswerCompositionCandidate(validComposition, retrieval), {
    valid: true,
    diagnostics: [],
  });
});

test("Answer Composition contract accepts approved Suggested Prompts", () => {
  const compositionWithApprovedPrompts: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: approvedSuggestedPrompts,
  };

  assert.deepEqual(validateAnswerCompositionCandidate(compositionWithApprovedPrompts, retrieval), {
    valid: true,
    diagnostics: [],
  });
});

test("Answer Composition contract accepts source-less non-factual sections", () => {
  const sourceLessComposition: AnswerComposition = {
    status: "needs_context",
    conversationalFraming: "The GuideSite needs more Visitor Context before it can honestly assess Fit.",
    sections: [
      {
        kind: "fit_status",
        title: "Fit Status",
        body: "Fit cannot be assessed honestly yet because Prior Sleepaway Experience is still unknown.",
      },
      {
        kind: "context_needs",
        title: "Missing Visitor Context",
        body: "The next turn should gather Prior Sleepaway Experience.",
        items: ["prior_sleepaway_experience"],
      },
      {
        kind: "suggested_prompts",
        title: "Suggested Prompts",
        body: "Approved prompts gather the missing Visitor Context.",
        items: ["prompt_prior_sleepaway_experience"],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "No factual claims were made in this response.",
      },
    ],
    suggestedPrompts: approvedSuggestedPrompts,
    citations: [],
    diagnostics: ["needs_visitor_context"],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(sourceLessComposition, retrieval), {
    valid: true,
    diagnostics: [],
  });
});

test("Answer Composition contract accepts source-backed homesickness answers", () => {
  const answeredComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The approved fixture material explains how the camp handles homesickness.",
    sections: [
      {
        kind: "summary",
        title: "Homesickness Answer",
        body: "Homesickness is a concern for first-time overnight campers, and the approved fixture material explains how staff support the Child.",
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_001",
          },
        ],
      },
      {
        kind: "concerns",
        title: "Concern",
        body: "Camp staff watch for homesickness, help the Child settle, and escalate persistent distress.",
        items: ["homesickness"],
        sourceRefs: [
          {
            sourceId: "policy_homesickness",
            sourceType: "policy",
            title: "Homesickness Support Policy",
            fieldPath: "summary",
            sourceRevision: "mock_rev_policy_homesickness_001",
          },
          {
            sourceId: "policy_parent_communication",
            sourceType: "policy",
            title: "Parent Communication Policy",
            fieldPath: "summary",
            sourceRevision: "mock_rev_policy_parent_communication_001",
          },
        ],
      },
      {
        kind: "sources",
        title: "Sources",
        body: "Approved fixture source material was retrieved for the homesickness concern.",
        items: [
          "Homesickness and Child Readiness (concern_homesickness)",
          "Homesickness Support Policy (policy_homesickness)",
          "Parent Communication Policy (policy_parent_communication)",
        ],
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_001",
          },
          {
            sourceId: "policy_homesickness",
            sourceType: "policy",
            title: "Homesickness Support Policy",
            fieldPath: "summary",
            sourceRevision: "mock_rev_policy_homesickness_001",
          },
          {
            sourceId: "policy_parent_communication",
            sourceType: "policy",
            title: "Parent Communication Policy",
            fieldPath: "summary",
            sourceRevision: "mock_rev_policy_parent_communication_001",
          },
        ],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "All required source material was available.",
      },
    ],
    suggestedPrompts: [],
    citations: ["concern_homesickness", "policy_homesickness", "policy_parent_communication"],
    diagnostics: [],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(answeredComposition, retrieval), {
    valid: true,
    diagnostics: [],
  });
});

test("Answer Composition contract rejects factual sections without source refs", () => {
  const invalidComposition: AnswerComposition = {
    status: "needs_context",
    conversationalFraming: "The GuideSite needs more Visitor Context before it can honestly assess Fit.",
    sections: [
      {
        kind: "summary",
        title: "Known Context",
        body: "The Parent is asking about overnight camp for an 8-year-old Child.",
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "No recommendation was made yet.",
      },
    ],
    suggestedPrompts: [],
    citations: [],
    diagnostics: ["needs_visitor_context"],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_section_0_source_refs_required"],
  });
});

test("Answer Composition contract rejects stale source refs", () => {
  const invalidComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The approved fixture material explains how the camp handles homesickness.",
    sections: [
      {
        kind: "summary",
        title: "Homesickness Answer",
        body: "Homesickness is a concern for first-time overnight campers.",
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_001",
          },
        ],
      },
      {
        kind: "sources",
        title: "Sources",
        body: "Approved fixture source material was retrieved for the homesickness concern.",
        items: ["Homesickness and Child Readiness (concern_homesickness)"],
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_999",
          },
        ],
      },
    ],
    suggestedPrompts: [],
    citations: ["concern_homesickness"],
    diagnostics: [],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_source_ref_concern_homesickness_stale_retrieval_result"],
  });
});

test("Answer Composition contract rejects unsupported citations", () => {
  const invalidComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The approved fixture material explains how the camp handles homesickness.",
    sections: [
      {
        kind: "summary",
        title: "Homesickness Answer",
        body: "Homesickness is a concern for first-time overnight campers.",
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_001",
          },
        ],
      },
      {
        kind: "sources",
        title: "Sources",
        body: "Approved fixture source material was retrieved for the homesickness concern.",
        items: ["Homesickness and Child Readiness (concern_homesickness)"],
        sourceRefs: [
          {
            sourceId: "concern_homesickness",
            sourceType: "concern",
            title: "Homesickness and Child Readiness",
            fieldPath: "summary",
            sourceRevision: "mock_rev_concern_homesickness_001",
          },
        ],
      },
    ],
    suggestedPrompts: [],
    citations: ["concern_homesickness", "policy_homesickness"],
    diagnostics: [],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_citation_policy_homesickness_unsupported_source_ref"],
  });
});

test("Answer Composition contract reports duplicate unsupported citations once", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    citations: ["program_overnight", "policy_homesickness", "policy_homesickness"],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_citation_policy_homesickness_unsupported_source_ref"],
  });
});

test("Answer Composition contract rejects Suggested Prompts with unknown context needs", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: [
      {
        id: "prompt_transportation",
        purpose: "gather_fit_context",
        text: "How will your child get to camp?",
        contextNeeds: ["transportation"],
        concerns: ["homesickness"],
        templateId: "ask_transportation",
      },
    ],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_suggested_prompt_0_unknown_context_need_transportation"],
  });
});

test("Answer Composition contract rejects Suggested Prompts with wrong template details", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience_v2",
      },
    ],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_suggested_prompt_0_template_id_mismatch"],
  });
});

test("Answer Composition contract rejects Suggested Prompts with mismatched contextNeeds", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
    ],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_suggested_prompt_0_context_needs_mismatch"],
  });
});

test("Answer Composition contract rejects Suggested Prompts with unsupported decisioning text", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "This camp is the best fit. Enroll now.",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
    ],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_suggested_prompt_0_text_mismatch"],
  });
});

test("Answer Composition contract rejects Suggested Prompts with decisioning purpose", () => {
  const invalidComposition: AnswerComposition = {
    ...validComposition,
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "test_fit",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
    ],
  };

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: ["answer_composition_suggested_prompt_0_purpose_mismatch"],
  });
});

test("Answer Composition contract rejects unknown section kinds and presentation-only fields", () => {
  const invalidComposition = {
    ...validComposition,
    sections: [
      {
        kind: "card",
        title: "Known Context",
        body: "The Parent is asking about overnight camp for an 8-year-old Child.",
        layoutHint: "two-column",
      },
    ],
  } as unknown as AnswerComposition;

  assert.deepEqual(validateAnswerCompositionCandidate(invalidComposition, retrieval), {
    valid: false,
    diagnostics: [
      "answer_composition_section_0_unknown_field_layoutHint",
      "answer_composition_section_0_kind_invalid",
      "answer_composition_citation_program_overnight_unsupported_source_ref",
    ],
  });
});
