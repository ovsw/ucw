import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_MVP_PROMPT,
  parseGuideSiteMvpCliArgs,
  runGuideSiteMvpCli,
} from "../../src/guidesite-mvp/cli.js";

test("GuideSite MVP CLI defaults to the canonical Prompt and commits the walking skeleton", () => {
  const output = runGuideSiteMvpCli([]);

  assert.match(output, new RegExp(`Prompt: ${DEFAULT_GUIDESITE_MVP_PROMPT.replace("?", "\\?")}`));
  assert.match(output, /Prompt Understanding:/);
  assert.match(output, /"goal": "assess_fit"/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /"status": "needs_context"/);
  assert.match(output, /Session Patch:/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /"revision": 2/);
  assert.match(output, /Has your child slept away from home before\?/);
});

test("GuideSite MVP CLI accepts a typed Prompt and shows the fallback path", () => {
  const output = runGuideSiteMvpCli(["Can", "you", "plan", "my", "whole", "summer?"]);

  assert.match(output, /Prompt: Can you plan my whole summer\?/);
  assert.match(output, /"status": "fallback"/);
  assert.match(output, /unknown_prompt_fallback/);
  assert.match(output, /Session Patch:\nnull/);
  assert.match(output, /Committed Session State:\nnull/);
});

test("GuideSite MVP CLI saves fallback Run State diagnostics as inspectable JSON", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const output = runGuideSiteMvpCli(["Can", "you", "plan", "my", "whole", "summer?"], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_fallback",
      createRunId: () => "run_cli_fallback",
    });

    const savedRunPath = join(runStateDirectory, "run_cli_fallback.json");
    assert.match(output, new RegExp(`Saved Run State: ${savedRunPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "fallback");
    assert.equal(savedRun.prompt.text, "Can you plan my whole summer?");
    assert.deepEqual(savedRun.diagnostics, ["unknown_prompt_fallback"]);
    assert.equal(savedRun.patch, null);
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI saves successful Prompt Understanding validation diagnostics as inspectable JSON", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const output = runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_valid",
      createRunId: () => "run_cli_valid",
    });

    const savedRunPath = join(runStateDirectory, "run_cli_valid.json");
    assert.match(output, /Prompt Understanding Validation:/);
    assert.match(output, /"valid": true/);
    assert.match(output, new RegExp(`Saved Run State: ${savedRunPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "committed");
    assert.deepEqual(savedRun.promptUnderstandingValidation, {
      valid: true,
      diagnostics: [],
    });
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI argument parsing joins unquoted Prompt text and defaults when empty", () => {
  assert.deepEqual(parseGuideSiteMvpCliArgs([]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["  "]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: null,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--run-state-dir", ".guidesite-runs", "Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: ".guidesite-runs",
  });
});
