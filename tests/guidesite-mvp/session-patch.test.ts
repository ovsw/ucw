import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  SessionPatchConflictError,
  startGuideSiteRun,
  withPromptUnderstandingCandidate,
  withHardcodedUnderstandingAndComposition,
} from "../../src/guidesite-mvp/run-lifecycle.js";
import type { PromptUnderstanding } from "../../src/guidesite-mvp/types.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";
const sevenYearOldPrompt = "Is overnight camp right for my 7-year-old?";

const sevenYearOldUnderstanding: PromptUnderstanding = {
  goal: "assess_fit",
  promptType: "fit",
  fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 7-year-old Child.",
  facts: {
    child_age: {
      value: 7,
      provenance: {
        source: "explicit",
        promptText: "7-year-old",
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
};

test("canonical run commits a hardcoded Session Patch into compact Session State", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_patch",
    createRunId: () => "run_patch",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });

  const patch = buildHardcodedSessionPatch(composedRun);
  const committed = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });

  assert.equal(patch.baseRevision, 1);
  assert.equal(patch.runId, "run_patch");
  assert.deepEqual(
    patch.operations.map((operation) => operation.type),
    ["upsertFact", "upsertConcern", "upsertConcern", "setFocus", "replaceSuggestedPrompts", "updateSummary"],
  );

  assert.deepEqual(committed.session.visitorFacts.child_age, {
    value: 8,
    source: "explicit",
    sourceRunId: "run_patch",
    status: "active",
  });
  assert.deepEqual(committed.session.concerns, {
    homesickness: {
      status: "open",
      sourceRunIds: ["run_patch"],
    },
    child_readiness: {
      status: "open",
      sourceRunIds: ["run_patch"],
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

  assert.equal(committed.applied, true);
  assert.equal(committed.session.revision, 2);
  assert.equal(committed.session.updatedAt, "2026-01-01T00:03:00.000Z");
  assert.deepEqual(
    committed.session.suggestedPrompts.map((prompt) => prompt.id),
    ["prompt_prior_sleepaway_experience", "prompt_child_readiness"],
  );

  const output = renderGuideSiteRunOperatorOutput(committed.run);

  assert.match(output, /Session Patch:/);
  assert.match(output, /"baseRevision": 1/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /"revision": 2/);
  assert.notEqual(committed.session.summary, canonicalPrompt);
});

test("compact Session summaries use the correct age article for a 7-year-old child", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: sevenYearOldPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_seven_year_old",
    createRunId: () => "run_seven_year_old",
  });
  const run = withPromptUnderstandingCandidate(started.run, sevenYearOldUnderstanding, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });
  const patch = buildHardcodedSessionPatch(run);
  const committed = commitSessionPatch({
    stores,
    run,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });

  assert.equal(
    committed.session.summary,
    "Parent is assessing overnight camp Fit for a 7-year-old Child. Homesickness and Child Readiness remain open concerns; Remaining need: Prior Sleepaway Experience and Child Readiness.",
  );
});

test("follow-up Prompt Understanding rejects carried facts whose provenance text is absent from the current Prompt", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: "She has slept at her grandparents' house a few times.",
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_follow_up_provenance",
    createRunId: () => "run_follow_up_provenance",
  });

  const run = withPromptUnderstandingCandidate(
    started.run,
    {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's Child after learning about prior sleepaway experience.",
      facts: {
        child_age: {
          value: 8,
          provenance: {
            source: "explicit",
            promptText: "8-year-old",
          },
        },
        prior_sleepaway_experience: {
          value: "slept_with_grandparents",
          provenance: {
            source: "explicit",
            promptText: "She has slept at her grandparents' house a few times.",
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
      retrievalNeeds: ["overnight_readiness", "homesickness_support"],
      contextNeeds: ["child_readiness"],
    },
    { now: () => new Date("2026-01-01T00:02:00.000Z") },
  );

  assert.equal(run.status, "validation_failed");
  assert.equal(run.understanding, null);
  assert.deepEqual(run.diagnostics, [
    "prompt_understanding_fact_child_age_prompt_text_not_present_in_prompt",
  ]);
});

test("duplicate commits for the same run ID do not apply the patch twice", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_duplicate",
    createRunId: () => "run_duplicate",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });
  const patch = buildHardcodedSessionPatch(composedRun);

  const firstCommit = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
    now: () => new Date("2026-01-01T00:03:00.000Z"),
  });
  const secondCommit = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
    now: () => new Date("2026-01-01T00:04:00.000Z"),
  });

  assert.equal(firstCommit.applied, true);
  assert.equal(secondCommit.applied, false);
  assert.equal(secondCommit.session.revision, 2);
  assert.equal(secondCommit.session.updatedAt, "2026-01-01T00:03:00.000Z");
});

test("stale-revision commits fail with an explicit conflict and do not partially update Session State", () => {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_conflict",
    createRunId: () => "run_conflict",
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run, {
    now: () => new Date("2026-01-01T00:02:00.000Z"),
  });
  const patch = buildHardcodedSessionPatch(composedRun);
  const concurrentSession = stores.sessions.update({
    ...started.session,
    revision: 2,
    updatedAt: "2026-01-01T00:02:30.000Z",
    visitorFacts: {
      camp_budget: {
        value: "under_1000",
        source: "explicit",
        sourceRunId: "run_concurrent",
        status: "active",
      },
    },
    summary: "Concurrent session update.",
  });

  assert.throws(
    () =>
      commitSessionPatch({
        stores,
        run: composedRun,
        patch,
        now: () => new Date("2026-01-01T00:03:00.000Z"),
      }),
    (error) => {
      assert.ok(error instanceof SessionPatchConflictError);
      assert.equal(error.code, "SESSION_PATCH_CONFLICT");
      assert.equal(error.runId, "run_conflict");
      assert.equal(error.sessionId, "session_conflict");
      assert.equal(error.baseRevision, 1);
      assert.equal(error.liveRevision, 2);
      assert.match(error.message, /Session Patch conflict/);
      assert.match(error.message, /run run_conflict/);
      assert.match(error.message, /base revision 1/);
      assert.match(error.message, /live revision 2/);
      return true;
    },
  );

  assert.deepEqual(stores.sessions.read("session_conflict"), concurrentSession);
  assert.equal(stores.sessions.hasCommittedRun("run_conflict"), false);
});
