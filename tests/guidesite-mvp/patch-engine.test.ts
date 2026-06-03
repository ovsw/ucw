import assert from "node:assert/strict";
import test from "node:test";
import { applySessionPatchOperations } from "../../src/guidesite-mvp/patch-engine.js";
import type { SessionPatchOperation, SessionState } from "../../src/guidesite-mvp/types.js";

function createSessionState(): SessionState {
  return {
    schemaVersion: 1,
    sessionId: "session_patch_engine",
    revision: 1,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    visitorFacts: {},
    concerns: {},
    focus: {
      goal: null,
      contextNeeds: [],
    },
    suggestedPrompts: [],
    summary: "",
  };
}

test("upsertFact operation records Visitor Context without mutating the input Session State", () => {
  const session = createSessionState();
  const operations: SessionPatchOperation[] = [
    {
      type: "upsertFact",
      key: "child_age",
      fact: {
        value: 8,
        source: "explicit",
        sourceRunId: "run_patch_engine",
        status: "active",
      },
    },
  ];

  const patched = applySessionPatchOperations(session, operations);

  assert.deepEqual(patched.visitorFacts, {
    child_age: {
      value: 8,
      source: "explicit",
      sourceRunId: "run_patch_engine",
      status: "active",
    },
  });
  assert.deepEqual(session.visitorFacts, {});
  assert.notEqual(patched, session);
});

test("upsertConcern operation records Concern state without sharing nested arrays", () => {
  const session = createSessionState();
  const operations: SessionPatchOperation[] = [
    {
      type: "upsertConcern",
      key: "homesickness",
      concern: {
        status: "open",
        sourceRunIds: ["run_patch_engine"],
      },
    },
  ];

  const patched = applySessionPatchOperations(session, operations);

  assert.deepEqual(patched.concerns, {
    homesickness: {
      status: "open",
      sourceRunIds: ["run_patch_engine"],
    },
  });
  operations[0].type === "upsertConcern" && operations[0].concern.sourceRunIds.push("mutated_later");
  assert.deepEqual(patched.concerns.homesickness.sourceRunIds, ["run_patch_engine"]);
  assert.deepEqual(session.concerns, {});
});

test("setFocus operation replaces the Session focus", () => {
  const session = createSessionState();
  const operations: SessionPatchOperation[] = [
    {
      type: "setFocus",
      focus: {
        goal: "assess_fit",
        contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
      },
    },
  ];

  const patched = applySessionPatchOperations(session, operations);

  assert.deepEqual(patched.focus, {
    goal: "assess_fit",
    contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
  });
  assert.deepEqual(session.focus, {
    goal: null,
    contextNeeds: [],
  });
});

test("replaceSuggestedPrompts operation replaces current Suggested Prompts", () => {
  const session = {
    ...createSessionState(),
    suggestedPrompts: [
      {
        id: "old_prompt",
        text: "Old prompt?",
        purpose: "gather_fit_context",
        contextNeeds: ["old_context"],
        concerns: [],
        templateId: "old_template",
      },
    ],
  } satisfies SessionState;
  const operations: SessionPatchOperation[] = [
    {
      type: "replaceSuggestedPrompts",
      suggestedPrompts: [
        {
          id: "prompt_prior_sleepaway_experience",
          text: "Has your child slept away from home before?",
          purpose: "gather_fit_context",
          contextNeeds: ["prior_sleepaway_experience"],
          concerns: ["homesickness"],
          templateId: "ask_sleepaway_experience",
        },
      ],
    },
  ];

  const patched = applySessionPatchOperations(session, operations);

  assert.deepEqual(
    patched.suggestedPrompts.map((prompt) => prompt.id),
    ["prompt_prior_sleepaway_experience"],
  );
  operations[0].type === "replaceSuggestedPrompts" &&
    operations[0].suggestedPrompts[0]?.contextNeeds.push("mutated_later");
  assert.deepEqual(patched.suggestedPrompts[0]?.contextNeeds, ["prior_sleepaway_experience"]);
  assert.deepEqual(
    session.suggestedPrompts.map((prompt) => prompt.id),
    ["old_prompt"],
  );
});

test("updateSummary operation replaces the compact Session summary", () => {
  const session = {
    ...createSessionState(),
    summary: "Old summary.",
  };
  const operations: SessionPatchOperation[] = [
    {
      type: "updateSummary",
      summary: "Parent is assessing overnight camp Fit for an 8-year-old Child.",
    },
  ];

  const patched = applySessionPatchOperations(session, operations);

  assert.equal(patched.summary, "Parent is assessing overnight camp Fit for an 8-year-old Child.");
  assert.equal(session.summary, "Old summary.");
});

test("invalid patch operations fail validation with explicit errors", () => {
  const session = createSessionState();
  const operations = [
    {
      type: "upsertFact",
      key: "",
      fact: {
        value: 8,
        source: "explicit",
        status: "active",
      },
    },
  ];

  assert.throws(
    () => applySessionPatchOperations(session, operations as SessionPatchOperation[]),
    /Invalid Session Patch operation 0: upsertFact key is required/,
  );
  assert.deepEqual(session.visitorFacts, {});
});
