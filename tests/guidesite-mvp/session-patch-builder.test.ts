import assert from "node:assert/strict";
import test from "node:test";
import {
  commitSessionPatch,
  createGuideSiteMemoryStores,
  startGuideSiteRun,
  withHardcodedUnderstandingAndComposition,
  withPromptUnderstandingCandidate,
} from "../../src/guidesite-mvp/run-lifecycle.js";
import { buildSessionPatchFromValidatedRun } from "../../src/guidesite-mvp/session-patch-builder.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("Session Patch builder derives the canonical patch from validated Run State", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_canonical",
    createRunId: () => "run_patch_builder_canonical",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  const patch = buildSessionPatchFromValidatedRun(composedRun);
  const committed = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });

  assert.deepEqual(
    patch.operations.map((operation) => operation.type),
    ["upsertFact", "upsertConcern", "upsertConcern", "setFocus", "replaceSuggestedPrompts", "updateSummary"],
  );
  assert.deepEqual(committed.session.visitorFacts.child_age, {
    value: 8,
    source: "explicit",
    sourceRunId: "run_patch_builder_canonical",
    status: "active",
  });
  assert.deepEqual(committed.session.concerns, {
    homesickness: {
      status: "open",
      sourceRunIds: ["run_patch_builder_canonical"],
    },
    child_readiness: {
      status: "open",
      sourceRunIds: ["run_patch_builder_canonical"],
    },
  });
  assert.deepEqual(committed.session.focus, {
    goal: "assess_fit",
    contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
  });
  assert.equal(committed.session.summary, "Parent is assessing overnight camp Fit for an 8-year-old Child.");
});

test("Session Patch builder rejects factual Answer Composition sections without source refs", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_missing_source_refs",
    createRunId: () => "run_patch_builder_missing_source_refs",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  const invalidRun = {
    ...composedRun,
    answerComposition: composedRun.answerComposition
      ? {
          ...composedRun.answerComposition,
          sections: composedRun.answerComposition.sections.map((section, index) =>
            index === 0 ? { ...section, sourceRefs: undefined } : section,
          ),
        }
      : null,
  } as typeof composedRun;

  assert.throws(() => buildSessionPatchFromValidatedRun(invalidRun), /source_refs_required/);
});

test("Session Patch builder commits validated non-canonical Visitor Context and Concerns", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_noncanonical",
    createRunId: () => "run_patch_builder_noncanonical",
  });
  const run = withPromptUnderstandingCandidate(
    started.run,
    {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child with a travel constraint.",
      facts: {
        child_age: {
          value: 8,
          provenance: {
            source: "explicit",
            promptText: "8-year-old",
          },
        },
        camp_budget: {
          value: "under_1000",
          provenance: {
            source: "explicit",
            promptText: "budget under $1000",
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
          key: "travel_logistics",
          label: "Travel Logistics",
          status: "open",
          provenance: "explicit",
        },
      ],
      retrievalNeeds: ["overnight_readiness", "homesickness_support"],
      contextNeeds: ["prior_sleepaway_experience", "camp_budget"],
    },
    { now: () => new Date("2026-01-01T00:02:00.000Z") },
  );

  assert.equal(run.status, "composed");
  assert.deepEqual(run.answerComposition?.suggestedPrompts, [
    {
      id: "prompt_prior_sleepaway_experience",
      purpose: "gather_fit_context",
      text: "Has your child slept away from home before?",
      contextNeeds: ["prior_sleepaway_experience"],
      concerns: ["homesickness"],
      templateId: "ask_sleepaway_experience",
    },
  ]);
  assert.deepEqual(run.answerComposition?.diagnostics, [
    "suggested_prompt_unknown_context_need_camp_budget",
    "needs_visitor_context",
    "no_fit_recommendation",
  ]);

  const patch = buildSessionPatchFromValidatedRun(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });

  assert.deepEqual(committed.session.visitorFacts, {
    child_age: {
      value: 8,
      source: "explicit",
      sourceRunId: "run_patch_builder_noncanonical",
      status: "active",
    },
    camp_budget: {
      value: "under_1000",
      source: "explicit",
      sourceRunId: "run_patch_builder_noncanonical",
      status: "active",
    },
  });
  assert.deepEqual(committed.session.concerns, {
    homesickness: {
      status: "open",
      sourceRunIds: ["run_patch_builder_noncanonical"],
    },
    travel_logistics: {
      status: "open",
      sourceRunIds: ["run_patch_builder_noncanonical"],
    },
  });
  assert.deepEqual(committed.session.focus, {
    goal: "assess_fit",
    contextNeeds: ["prior_sleepaway_experience", "camp_budget"],
  });
  assert.equal(committed.session.summary, "Parent is assessing overnight camp Fit for an 8-year-old Child.");
  assert.deepEqual(committed.session.suggestedPrompts.map((prompt) => prompt.id), [
    "prompt_prior_sleepaway_experience",
  ]);
});

test("Session Patch builder marks source-backed homesickness answers as addressed", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: "What happens if my child gets homesick?",
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_homesickness",
    createRunId: () => "run_patch_builder_homesickness",
  });
  const run = withPromptUnderstandingCandidate(
    started.run,
    {
      goal: "address_concern",
      promptType: "factual",
      fitQuestion: null,
      facts: {},
      concerns: [
        {
          key: "homesickness",
          label: "Homesickness",
          status: "open",
          provenance: "explicit",
        },
      ],
      retrievalNeeds: ["homesickness_support"],
      contextNeeds: [],
    },
    { now: () => new Date("2026-01-01T00:02:00.000Z") },
  );

  assert.equal(run.status, "composed");
  assert.equal(run.answerComposition?.status, "answered");

  const patch = buildSessionPatchFromValidatedRun(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });

  assert.deepEqual(
    patch.operations.map((operation) => operation.type),
    ["upsertConcern", "setFocus", "replaceSuggestedPrompts", "updateSummary"],
  );
  assert.deepEqual(committed.session.concerns, {
    homesickness: {
      status: "addressed",
      sourceRunIds: ["run_patch_builder_homesickness"],
    },
  });
});

test("Session Patch builder rejects unvalidated Suggested Prompts even when invoked directly", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_invalid_prompt",
    createRunId: () => "run_patch_builder_invalid_prompt",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  const invalidRun = {
    ...composedRun,
    answerComposition: composedRun.answerComposition
      ? {
          ...composedRun.answerComposition,
          suggestedPrompts: [
            {
              ...composedRun.answerComposition.suggestedPrompts[0]!,
              purpose: "test_fit" as const,
              text: "This camp is the best fit. Enroll now.",
            },
          ],
        }
      : null,
  } as typeof composedRun;

  assert.throws(() => buildSessionPatchFromValidatedRun(invalidRun), /unsupported Answer Composition/);
});

test("Session Patch builder rejects a valid run whose Answer Composition is not patchable", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch_builder_fallback",
    createRunId: () => "run_patch_builder_fallback",
  });
  const run = withPromptUnderstandingCandidate(
    started.run,
    {
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
          key: "transportation",
          label: "Transportation",
          status: "open",
          provenance: "explicit",
        },
      ],
      retrievalNeeds: ["bus_schedule"],
      contextNeeds: ["pickup_location"],
    },
    { now: () => new Date("2026-01-01T00:02:00.000Z") },
  );

  assert.equal(run.status, "fallback");
  assert.throws(() => buildSessionPatchFromValidatedRun(run), /patchable Answer Composition/);
});
