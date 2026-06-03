import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuideSiteMemoryStores,
  renderStartRunOperatorOutput,
  startGuideSiteRun,
} from "../../src/guidesite-mvp/run-lifecycle.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("canonical Prompt starts a GuideSite run from a newly created Session State", () => {
  const stores = createGuideSiteMemoryStores();

  const result = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_test",
    createRunId: () => "run_test",
  });

  assert.equal(result.session.schemaVersion, 1);
  assert.equal(result.session.sessionId, "session_test");
  assert.equal(result.session.revision, 1);
  assert.equal(result.session.status, "active");
  assert.deepEqual(result.session.visitorFacts, {});
  assert.deepEqual(result.session.concerns, {});
  assert.deepEqual(result.session.focus, { goal: null, contextNeeds: [] });
  assert.deepEqual(result.session.suggestedPrompts, []);
  assert.equal(result.session.summary, "");
  assert.equal(result.session.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.session.updatedAt, "2026-01-01T00:00:00.000Z");

  assert.equal(result.run.schemaVersion, 1);
  assert.equal(result.run.runId, "run_test");
  assert.equal(result.run.sessionId, "session_test");
  assert.equal(result.run.baseSessionRevision, 1);
  assert.equal(result.run.status, "started");
  assert.equal(result.run.createdAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.run.updatedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(result.run.prompt, {
    text: canonicalPrompt,
    source: "typed",
    selectedSuggestedPromptId: null,
  });
  assert.deepEqual(result.run.diagnostics, []);
});

test("Run State snapshot is a copied Session State value", () => {
  const stores = createGuideSiteMemoryStores();
  const result = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_snapshot",
    createRunId: () => "run_snapshot",
  });

  result.session.visitorFacts.child_age = {
    value: 8,
    source: "explicit",
    status: "active",
  };
  result.run.snapshot.focus.contextNeeds.push("live_mutation");
  stores.sessions.update({
    ...result.session,
    revision: 2,
    updatedAt: "2026-01-01T00:01:00.000Z",
  });

  const persistedRun = stores.runs.read("run_snapshot");

  assert.ok(persistedRun);
  assert.equal(persistedRun.baseSessionRevision, 1);
  assert.deepEqual(persistedRun.snapshot.visitorFacts, {});
  assert.deepEqual(persistedRun.snapshot.focus.contextNeeds, []);
});

test("operator output displays Start Run fields from the Run State snapshot", () => {
  const stores = createGuideSiteMemoryStores();
  const result = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_output",
    createRunId: () => "run_output",
  });

  stores.sessions.update({
    ...result.session,
    revision: 2,
    updatedAt: "2026-01-01T00:01:00.000Z",
    visitorFacts: {
      child_age: {
        value: 8,
        source: "explicit",
        status: "active",
      },
    },
  });

  const output = renderStartRunOperatorOutput(result.run);

  assert.match(output, /Prompt: Is overnight camp right for my 8-year-old\?/);
  assert.match(output, /Session ID: session_output/);
  assert.match(output, /Run ID: run_output/);
  assert.match(output, /Base Session Revision: 1/);
  assert.match(output, /"sessionId": "session_output"/);
  assert.match(output, /"revision": 1/);
  assert.match(output, /"visitorFacts": \{\}/);
  assert.doesNotMatch(output, /"child_age"/);
});
