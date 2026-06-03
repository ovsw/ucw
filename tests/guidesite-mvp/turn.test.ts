import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGuideSiteMemoryStores } from "../../src/guidesite-mvp/run-lifecycle.js";
import { createGuideSiteFileRunStore } from "../../src/guidesite-mvp/run-store.js";
import { runGuideSiteMvpTurn } from "../../src/guidesite-mvp/turn.js";
import type { GuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/fixture-retrieval.js";
import {
  canonicalGuideSitePrompt,
  canonicalGuideSiteUnderstanding,
  createFakePromptUnderstandingProvider,
} from "./test-helpers.js";

test("GuideSite turn commits the canonical Prompt into inspectable Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_canonical",
      createRunId: () => "run_turn_canonical",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
    });

    assert.equal(run.status, "committed");
    assert.equal(run.runId, "run_turn_canonical");
    assert.equal(run.promptUnderstandingProvider?.provider, "fake");
    assert.equal(run.promptUnderstandingValidation?.valid, true);
    assert.equal(run.retrieval?.coverage.status, "source_backed");
    assert.equal(run.answerComposition?.status, "needs_context");
    assert.equal(
      run.answerComposition?.conversationalFraming,
      "Age 8 is relevant, but the GuideSite needs more Visitor Context before it can honestly assess Fit.",
    );
    assert.deepEqual(run.answerComposition?.citations, [
      "program_overnight",
      "policy_homesickness",
      "policy_parent_communication",
    ]);
    assert.ok(run.patch);
    assert.ok(run.committedSessionState);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_canonical.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "committed");
    assert.equal(savedRun.committedSessionState?.revision, 2);
    assert.equal(savedRun.patch?.baseRevision, 1);
    assert.deepEqual(savedRun.diagnostics, []);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves provider failures as inspectable Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "Can you plan my whole summer?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_failure",
      createRunId: () => "run_turn_failure",
      promptUnderstandingProvider: {
        async understandPrompt() {
          throw new Error("provider unavailable");
        },
      },
    });

    assert.equal(run.status, "prompt_understanding_failed");
    assert.equal(run.answerComposition, null);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["prompt_understanding_provider_failed: Prompt Understanding provider failed: provider unavailable"]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_failure.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "prompt_understanding_failed");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves invalid Prompt Understanding diagnostics without composition or commit", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_invalid",
      createRunId: () => "run_turn_invalid",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider({
        goal: "unknown",
        promptType: "unknown",
        fitQuestion: null,
        facts: {},
        concerns: [],
        retrievalNeeds: [],
        contextNeeds: [],
      }),
    });

    assert.equal(run.status, "validation_failed");
    assert.equal(run.understanding, null);
    assert.equal(run.answerComposition, null);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, [
      "prompt_understanding_goal_required",
      "prompt_understanding_prompt_type_required",
    ]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_invalid.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "validation_failed");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves insufficient source material as fallback Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "Do you offer camp bus pickup?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_empty_retrieval",
      createRunId: () => "run_turn_empty_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider({
        ...canonicalGuideSiteUnderstanding,
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
      }),
    });

    assert.equal(run.status, "fallback");
    assert.equal(run.answerComposition?.status, "fallback");
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, [
      "insufficient_fixture_sources: no approved fixture sources matched retrieval needs bus_schedule or concerns transportation",
    ]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_empty_retrieval.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "fallback");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn uses the supplied Retrieval Strategy adapter", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const retrievalAdapter: GuideSiteRetrievalAdapter = {
      id: "fake-empty",
      label: "Fake Empty Retrieval",
      retrieve(input) {
        return {
          needs: [...input.retrievalNeeds],
          concerns: input.concerns.map((concern) => concern.key),
          results: [],
          diagnostics: ["fake_retrieval_adapter_empty"],
          coverage: {
            status: "empty_retrieval",
            matchedSourceIds: [],
          },
        };
      },
    };

    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_adapter_empty_retrieval",
      createRunId: () => "run_turn_adapter_empty_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
      retrievalAdapter,
    });

    assert.equal(run.status, "fallback");
    assert.equal(run.retrieval?.coverage.status, "empty_retrieval");
    assert.equal(run.answerComposition?.status, "fallback");
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["fake_retrieval_adapter_empty"]);

    const savedRun = JSON.parse(
      readFileSync(join(runStateDirectory, "run_turn_adapter_empty_retrieval.json"), "utf8"),
    ) as typeof run;
    assert.equal(savedRun.status, "fallback");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});
