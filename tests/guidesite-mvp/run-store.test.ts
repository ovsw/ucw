import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  createGuideSiteMemoryStores,
  startGuideSiteRun,
  withPromptUnderstandingCandidate,
  withHardcodedUnderstandingAndComposition,
} from "../../src/guidesite-mvp/run-lifecycle.js";
import { createGuideSiteFileRunStore } from "../../src/guidesite-mvp/run-store.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("file Run Store persists committed canonical Run State as inspectable JSON", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-run-store-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const started = startGuideSiteRun({
      promptText: canonicalPrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_persisted",
      createRunId: () => "run_persisted",
    });
    const composedRun = stores.runs.update(
      withHardcodedUnderstandingAndComposition(started.run, {
        now: () => new Date("2026-01-01T00:02:00.000Z"),
      }),
    );
    const patch = buildHardcodedSessionPatch(composedRun);

    commitSessionPatch({
      stores,
      run: composedRun,
      patch,
      now: () => new Date("2026-01-01T00:03:00.000Z"),
    });

    const inspection = stores.runs.inspect?.("run_persisted");
    assert.ok(inspection);
    const savedRunPath = inspection.path;
    assert.equal(savedRunPath, join(runStateDirectory, "run_persisted.json"));

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "committed");
    assert.equal(savedRun.prompt.text, canonicalPrompt);
    assert.equal(savedRun.snapshot.sessionId, "session_persisted");
    assert.equal(savedRun.understanding.goal, "assess_fit");
    assert.equal(savedRun.answerComposition.status, "needs_context");
    assert.equal(savedRun.patch.baseRevision, 1);
    assert.deepEqual(savedRun.diagnostics, []);
    assert.equal(savedRun.committedSessionState.revision, 2);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("file Run Store persists Prompt Understanding validation failures without committed Session State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-run-store-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const started = startGuideSiteRun({
      promptText: canonicalPrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_persisted_invalid",
      createRunId: () => "run_persisted_invalid",
    });

    stores.runs.update(
      withPromptUnderstandingCandidate(
        started.run,
        {
          goal: "unknown",
          promptType: "unknown",
          fitQuestion: null,
          facts: {
            child_age: {
              value: 8,
              provenance: {
                source: "inferred",
                promptText: "",
              },
            },
          },
          concerns: [],
          retrievalNeeds: [""],
          contextNeeds: [""],
        },
        { now: () => new Date("2026-01-01T00:02:00.000Z") },
      ),
    );

    const savedRunPath = join(runStateDirectory, "run_persisted_invalid.json");
    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "validation_failed");
    assert.equal(savedRun.understanding, null);
    assert.equal(savedRun.answerComposition, null);
    assert.equal(savedRun.patch, null);
    assert.equal(savedRun.committedSessionState, null);
    assert.equal(savedRun.promptUnderstandingValidation.valid, false);
    assert.deepEqual(savedRun.diagnostics, savedRun.promptUnderstandingValidation.diagnostics);
    assert.deepEqual(stores.sessions.read("session_persisted_invalid"), started.session);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});
