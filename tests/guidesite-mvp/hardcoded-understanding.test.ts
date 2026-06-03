import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHardcodedSessionPatch,
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  startGuideSiteRun,
  withPromptUnderstandingCandidate,
  withHardcodedUnderstandingAndComposition,
} from "../../src/guidesite-mvp/run-lifecycle.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("canonical Prompt produces hardcoded Prompt Understanding and a needs-context Answer Composition", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_understanding",
    createRunId: () => "run_understanding",
  });

  const run = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  assert.deepEqual(run.promptUnderstandingValidation, {
    valid: true,
    diagnostics: [],
  });
  assert.deepEqual(run.understanding, {
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
      {
        key: "child_readiness",
        label: "Child Readiness",
        status: "open",
        provenance: "implied",
      },
    ],
    retrievalNeeds: ["overnight_readiness", "homesickness_support"],
    contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
  });

  assert.equal(run.answerComposition?.status, "needs_context");
  assert.equal(run.answerComposition?.conversationalFraming, "Age 8 is relevant, but the GuideSite needs more Visitor Context before it can honestly assess Fit.");
  assert.deepEqual(
    run.answerComposition?.sections.map((section) => section.kind),
    ["summary", "fit_status", "concerns", "context_needs", "suggested_prompts", "diagnostics"],
  );
  assert.deepEqual(run.answerComposition?.citations, ["program_overnight", "policy_homesickness", "policy_parent_communication"]);
  assert.deepEqual(run.answerComposition?.suggestedPrompts, [
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
  ]);

  const output = renderGuideSiteRunOperatorOutput(run);

  assert.match(output, /Prompt Understanding:/);
  assert.match(output, /"goal": "assess_fit"/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /Answer Composition Status: needs_context/);
  assert.match(output, /Conversational Framing:/);
  assert.match(output, /Suggested Prompts:/);
  assert.match(output, /"status": "needs_context"/);
  assert.doesNotMatch(output, /best fit|recommended|safe|available/i);
});

test("unknown Prompts use a safe fallback understanding and composition", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: "Can you plan my whole summer?",
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_unknown",
    createRunId: () => "run_unknown",
  });

  const run = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  assert.equal(run.status, "fallback");
  assert.deepEqual(run.understanding, {
    goal: "unknown",
    promptType: "unknown",
    fitQuestion: null,
    facts: {},
    concerns: [],
    retrievalNeeds: [],
    contextNeeds: [],
  });
  assert.equal(run.answerComposition?.status, "fallback");
  assert.deepEqual(run.answerComposition?.suggestedPrompts, []);
  assert.deepEqual(run.diagnostics, ["unknown_prompt_fallback"]);
});

test("invalid Prompt Understanding candidate fails safely before composition or Session Patch building", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_invalid_understanding",
    createRunId: () => "run_invalid_understanding",
  });

  const run = withPromptUnderstandingCandidate(
    started.run,
    {
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
    },
    { now: () => new Date("2026-01-01T00:02:00.000Z") },
  );

  assert.equal(run.status, "validation_failed");
  assert.equal(run.understanding, null);
  assert.equal(run.answerComposition, null);
  assert.equal(run.patch, null);
  assert.equal(run.committedSessionState, null);
  assert.deepEqual(run.promptUnderstandingValidation, {
    valid: false,
    diagnostics: [
      "prompt_understanding_goal_required",
      "prompt_understanding_fit_question_required",
      "prompt_understanding_fact_child_age_prompt_text_required",
      "prompt_understanding_fact_child_age_explicit_provenance_required",
      "prompt_understanding_concern_0_key_required",
      "prompt_understanding_concern_0_label_required",
      "prompt_understanding_retrieval_need_0_required",
      "prompt_understanding_context_need_0_required",
    ],
  });
  assert.deepEqual(run.diagnostics, run.promptUnderstandingValidation.diagnostics);
  assert.throws(() => buildHardcodedSessionPatch(run), /validated Prompt Understanding/);

  assert.deepEqual(stores.sessions.read("session_invalid_understanding"), started.session);

  const output = renderGuideSiteRunOperatorOutput(run);
  assert.match(output, /Prompt Understanding Validation:/);
  assert.match(output, /prompt_understanding_fact_child_age_explicit_provenance_required/);
  assert.match(output, /Prompt Understanding:\nnull/);
});

test("Answer Composition source refs must map to Run State Retrieval Results before Session Patch building", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_stale_source_ref",
    createRunId: () => "run_stale_source_ref",
  });
  const run = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });
  const staleSourceRefRun = structuredClone(run);

  staleSourceRefRun.answerComposition?.sections[0]?.sourceRefs?.push({
    sourceId: "missing_policy",
    sourceType: "policy",
    title: "Missing Policy",
    fieldPath: "summary",
    sourceRevision: "mock_rev_missing_policy_001",
  });

  assert.throws(
    () => buildHardcodedSessionPatch(staleSourceRefRun),
    /answer_composition_source_ref_missing_policy_missing_retrieval_result/,
  );
  assert.deepEqual(stores.sessions.read("session_stale_source_ref"), started.session);
});

test("Answer Composition validation rejects presentation-only fields before Session Patch building", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_invalid_answer_composition",
    createRunId: () => "run_invalid_answer_composition",
  });
  const run = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });
  const invalidCompositionRun = structuredClone(run);

  if (invalidCompositionRun.answerComposition?.sections[0]) {
    (invalidCompositionRun.answerComposition.sections[0] as { kind: string; title: string; body: string; layoutHint?: string }).kind = "card";
    (invalidCompositionRun.answerComposition.sections[0] as { kind: string; title: string; body: string; layoutHint?: string }).layoutHint = "two-column";
  }

  assert.throws(
    () => buildHardcodedSessionPatch(invalidCompositionRun),
    /answer_composition_section_0_kind_invalid/,
  );
  assert.deepEqual(stores.sessions.read("session_invalid_answer_composition"), started.session);
});
