import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  startGuideSiteRun,
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
  assert.deepEqual(
    run.answerComposition?.sections.map((section) => section.kind),
    ["summary", "fit_status", "concerns", "context_needs", "suggested_prompts", "diagnostics"],
  );
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
