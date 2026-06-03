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
    },
  ],
  diagnostics: [],
  coverage: {
    status: "source_backed",
    matchedSourceIds: ["program_overnight"],
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

test("Answer Composition contract accepts the canonical semantic shape", () => {
  assert.deepEqual(validateAnswerCompositionCandidate(validComposition, retrieval), {
    valid: true,
    diagnostics: [],
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
    ],
  });
});
