import assert from "node:assert/strict";
import test from "node:test";
import {
  assessPromptUnderstandingCandidate,
} from "../../src/guidesite-mvp/prompt-understanding.js";

test("Prompt Understanding module accepts the canonical Parent Prompt meaning", () => {
  const assessment = assessPromptUnderstandingCandidate({
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
    facts: {
      child_age: {
        value: 8,
        provenance: {
          source: "explicit",
          promptText: "8-year-old",
        },
      },
    },
    concerns: [
      {
        key: "homesickness",
        label: "Homesickness",
        status: "open",
        provenance: "implied",
      },
    ],
    retrievalNeeds: ["overnight_readiness"],
    contextNeeds: ["prior_sleepaway_experience"],
  });

  assert.equal(assessment.accepted, true);
  assert.deepEqual(assessment.diagnostics, []);
  assert.equal(assessment.understanding.goal, "assess_fit");
});

test("Prompt Understanding module rejects invalid meaning with diagnostics", () => {
  const assessment = assessPromptUnderstandingCandidate({
    goal: "unknown",
    promptType: "fit",
    fitQuestion: "",
    facts: {
      child_age: {
        value: 8,
        provenance: {
          source: "inferred",
          promptText: "",
        },
      },
    },
    concerns: [
      {
        key: "",
        label: "",
        status: "open",
        provenance: "implied",
      },
    ],
    retrievalNeeds: [""],
    contextNeeds: [""],
  });

  assert.equal(assessment.accepted, false);
  assert.equal(assessment.understanding, null);
  assert.deepEqual(assessment.diagnostics, [
    "prompt_understanding_goal_required",
    "prompt_understanding_fit_question_required",
    "prompt_understanding_fact_child_age_prompt_text_required",
    "prompt_understanding_fact_child_age_explicit_provenance_required",
    "prompt_understanding_concern_0_key_required",
    "prompt_understanding_concern_0_label_required",
    "prompt_understanding_retrieval_need_0_required",
    "prompt_understanding_context_need_0_required",
  ]);
});
