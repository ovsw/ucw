import assert from "node:assert/strict";
import test from "node:test";
import {
  commitSessionPatch,
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  startGuideSiteRun,
  withHardcodedUnderstandingAndComposition,
  withPromptUnderstandingCandidate,
} from "../../src/guidesite-mvp/run-lifecycle.js";
import { buildSessionPatchFromValidatedRun } from "../../src/guidesite-mvp/session-patch-builder.js";
import { homesicknessConcernUnderstanding } from "./test-helpers.js";
import type { PromptUnderstanding } from "../../src/guidesite-mvp/types.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";
const followUpPrompt = "She has slept at her grandparents' house a few times.";

const followUpUnderstanding: PromptUnderstanding = {
  goal: "assess_fit",
  promptType: "fit",
  fitQuestion: "Assess whether overnight camp is a good fit for the Parent's Child after learning about prior sleepaway experience.",
  facts: {
    prior_sleepaway_experience: {
      value: "slept_with_grandparents",
      provenance: {
        source: "explicit",
        promptText: followUpPrompt,
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
  contextNeeds: ["child_readiness"],
};

function createCanonicalCommittedRun() {
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

  return { patch, committed };
}

test("Session Patch builder derives the canonical patch from validated Run State", () => {
  const { patch, committed } = createCanonicalCommittedRun();

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
  assert.equal(
    committed.session.summary,
    "Parent is assessing overnight camp Fit for an 8-year-old Child. Homesickness and Child Readiness remain open concerns; Remaining need: Prior Sleepaway Experience and Child Readiness.",
  );

  assert.match(committed.session.summary, /Homesickness and Child Readiness remain open concerns/);
  assert.match(committed.session.summary, /Remaining need: Prior Sleepaway Experience and Child Readiness/);

  const output = renderGuideSiteRunOperatorOutput(committed.run);
  assert.match(output, /Committed Session Summary:/);
  assert.match(output, /Homesickness and Child Readiness remain open concerns/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /"revision": 2/);
  assert.notEqual(committed.session.summary, canonicalPrompt);
});

test("Session Patch builder carries the grandparents sleepaway follow-up into the Session summary", () => {
  const { committed: canonicalCommitted } = createCanonicalCommittedRun();
  const stores = createGuideSiteMemoryStores();
  stores.sessions.update(canonicalCommitted.session);

  const started = startGuideSiteRun({
    promptText: followUpPrompt,
    stores,
    now: () => new Date("2026-01-01T00:04:00.000Z"),
    createSessionId: () => canonicalCommitted.session.sessionId,
    createRunId: () => "run_patch_builder_follow_up",
  });
  const run = withPromptUnderstandingCandidate(started.run, followUpUnderstanding, {
    now: () => new Date("2026-01-01T00:05:00.000Z"),
  });
  const patch = buildSessionPatchFromValidatedRun(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:06:00.000Z"),
  });

  assert.match(committed.session.summary, /prior sleepaway experience with grandparents/);
  assert.match(committed.session.summary, /Remaining need: Child Readiness/);
  assert.match(committed.session.summary, /Homesickness and Child Readiness remain open concerns/);
  assert.deepEqual(committed.session.visitorFacts.child_age, {
    value: 8,
    source: "explicit",
    sourceRunId: "run_patch_builder_canonical",
    status: "active",
  });
  assert.deepEqual(committed.session.visitorFacts.prior_sleepaway_experience, {
    value: "slept_with_grandparents",
    source: "explicit",
    sourceRunId: "run_patch_builder_follow_up",
    status: "active",
  });
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
    promptText: "Is overnight camp right for my 8-year-old with budget under $1000?",
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
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child with a travel constraint and budget limit.",
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
  assert.equal(
    committed.session.summary,
    "Parent is assessing overnight camp Fit for an 8-year-old Child. Homesickness and Travel Logistics remain open concerns; Remaining need: Prior Sleepaway Experience and Camp Budget.",
  );
  assert.deepEqual(committed.session.suggestedPrompts.map((prompt) => prompt.id), [
    "prompt_prior_sleepaway_experience",
  ]);
});

test("Session Patch builder marks source-backed homesickness answers as addressed", () => {
  const { committed: canonicalCommitted } = createCanonicalCommittedRun();
  const stores = createGuideSiteMemoryStores();
  stores.sessions.update(canonicalCommitted.session);
  const started = startGuideSiteRun({
    promptText: "What happens if my child gets homesick?",
    stores,
    now: () => new Date("2026-01-01T00:04:00.000Z"),
    createSessionId: () => canonicalCommitted.session.sessionId,
    createRunId: () => "run_patch_builder_homesickness",
  });
  const run = withPromptUnderstandingCandidate(started.run, homesicknessConcernUnderstanding, {
    now: () => new Date("2026-01-01T00:05:00.000Z"),
  });

  assert.equal(run.status, "composed");
  assert.equal(run.answerComposition?.status, "answered");

  const patch = buildSessionPatchFromValidatedRun(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:06:00.000Z"),
  });

  assert.deepEqual(
    patch.operations.map((operation) => operation.type),
    ["upsertConcern", "setFocus", "replaceSuggestedPrompts", "updateSummary"],
  );
  const firstPatchOperation = patch.operations[0];
  assert.equal(firstPatchOperation?.type, "upsertConcern");
  assert.equal(firstPatchOperation?.concern.status, "addressed");
  assert.deepEqual(committed.session.concerns, {
    homesickness: {
      status: "addressed",
      sourceRunIds: ["run_patch_builder_homesickness"],
    },
    child_readiness: {
      status: "open",
      sourceRunIds: ["run_patch_builder_canonical"],
    },
  });
  assert.equal(
    committed.session.summary,
    "Parent is assessing overnight camp Fit for an 8-year-old Child. Homesickness has been addressed; Child Readiness remains an open concern.",
  );
});

test("Session Patch builder keeps unresolved concerns visible after an addressed concern turn", () => {
  const { committed: canonicalCommitted } = createCanonicalCommittedRun();
  const stores = createGuideSiteMemoryStores();
  stores.sessions.update(canonicalCommitted.session);
  const started = startGuideSiteRun({
    promptText: "What happens if my child gets homesick?",
    stores,
    now: () => new Date("2026-01-01T00:04:00.000Z"),
    createSessionId: () => canonicalCommitted.session.sessionId,
    createRunId: () => "run_patch_builder_unresolved_concern",
  });
  const run = withPromptUnderstandingCandidate(started.run, homesicknessConcernUnderstanding, {
    now: () => new Date("2026-01-01T00:05:00.000Z"),
  });
  const patch = buildSessionPatchFromValidatedRun(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:06:00.000Z"),
  });

  assert.match(committed.session.summary, /Homesickness has been addressed/);
  assert.match(committed.session.summary, /Child Readiness remains an open concern/);
  assert.equal(
    committed.session.summary,
    "Parent is assessing overnight camp Fit for an 8-year-old Child. Homesickness has been addressed; Child Readiness remains an open concern.",
  );
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
