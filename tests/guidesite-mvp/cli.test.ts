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
import {
  PromptUnderstandingProviderError,
  type PromptUnderstandingProvider,
} from "../../src/guidesite-mvp/openai-prompt-understanding.js";
import type { PromptUnderstanding } from "../../src/guidesite-mvp/types.js";

const canonicalUnderstanding: PromptUnderstanding = {
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
};

function createFakePromptUnderstandingProvider(
  understanding: PromptUnderstanding = canonicalUnderstanding,
): PromptUnderstandingProvider {
  return {
    async understandPrompt() {
      return {
        understanding,
        trace: {
          provider: "fake",
          model: "fake-guidesite-prompt-understanding",
          rawOutput: JSON.stringify(understanding),
          parsedOutput: understanding,
          diagnostics: [],
        },
      };
    },
  };
}

test("GuideSite MVP CLI requires OpenAI provider configuration for normal runs", async () => {
  await assert.rejects(
    () => runGuideSiteMvpCli([], { env: {} }),
    /Missing required OpenAI config for GuideSite Prompt Understanding: OPENAI_API_KEY/,
  );
});

test("GuideSite MVP CLI defaults to the canonical Prompt and commits the walking skeleton", async () => {
  const output = await runGuideSiteMvpCli([], {
    promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
  });

  assert.match(output, new RegExp(`Prompt: ${DEFAULT_GUIDESITE_MVP_PROMPT.replace("?", "\\?")}`));
  assert.match(output, /Prompt Understanding Provider:/);
  assert.match(output, /"provider": "fake"/);
  assert.match(output, /Prompt Understanding:/);
  assert.match(output, /"goal": "assess_fit"/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /"status": "needs_context"/);
  assert.match(output, /Session Patch:/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /"revision": 2/);
  assert.match(output, /Has your child slept away from home before\?/);
});

test("GuideSite MVP CLI accepts a typed Prompt and still requires provider-backed understanding", async () => {
  const output = await runGuideSiteMvpCli(["Is", "camp", "right", "for", "my", "8-year-old?"], {
    promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
  });

  assert.match(output, /Prompt: Is camp right for my 8-year-old\?/);
  assert.match(output, /"provider": "fake"/);
  assert.match(output, /"valid": true/);
  assert.match(output, /Committed Session State:/);
});

test("GuideSite MVP CLI saves provider failures as inspectable Run State without Session State commits", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const output = await runGuideSiteMvpCli(["Can", "you", "plan", "my", "whole", "summer?"], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_fallback",
      createRunId: () => "run_cli_fallback",
      promptUnderstandingProvider: {
        async understandPrompt() {
          throw new Error("provider unavailable");
        },
      },
    });

    const savedRunPath = join(runStateDirectory, "run_cli_fallback.json");
    assert.match(output, new RegExp(`Saved Run State: ${savedRunPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "prompt_understanding_failed");
    assert.equal(savedRun.prompt.text, "Can you plan my whole summer?");
    assert.match(output, /prompt_understanding_provider_failed/);
    assert.deepEqual(savedRun.diagnostics, ["prompt_understanding_provider_failed: Prompt Understanding provider failed: provider unavailable"]);
    assert.equal(savedRun.understanding, null);
    assert.equal(savedRun.patch, null);
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI preserves failed provider raw and parsed output in Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  const invalidProviderOutput = {
    goal: "unknown",
    promptType: "fit",
    fitQuestion: "",
    facts: {},
    concerns: [],
    retrievalNeeds: [],
    contextNeeds: [],
  };
  try {
    await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_provider_invalid",
      createRunId: () => "run_cli_provider_invalid",
      promptUnderstandingProvider: {
        async understandPrompt() {
          throw new PromptUnderstandingProviderError("provider schema rejected", {
            rawOutput: JSON.stringify(invalidProviderOutput),
            parsedOutput: invalidProviderOutput,
            diagnostics: ["goal: unknown is not valid for this Prompt"],
          });
        },
      },
    });

    const savedRun = JSON.parse(await readFile(join(runStateDirectory, "run_cli_provider_invalid.json"), "utf8"));
    assert.equal(savedRun.status, "prompt_understanding_failed");
    assert.equal(savedRun.promptUnderstandingProvider.rawOutput, JSON.stringify(invalidProviderOutput));
    assert.deepEqual(savedRun.promptUnderstandingProvider.parsedOutput, invalidProviderOutput);
    assert.deepEqual(savedRun.promptUnderstandingProvider.diagnostics, [
      "prompt_understanding_provider_failed: goal: unknown is not valid for this Prompt",
    ]);
    assert.equal(savedRun.understanding, null);
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI saves successful Prompt Understanding validation diagnostics as inspectable JSON", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const output = await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_valid",
      createRunId: () => "run_cli_valid",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
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
    assert.equal(savedRun.promptUnderstandingProvider.provider, "fake");
    assert.equal(savedRun.promptUnderstandingProvider.rawOutput, JSON.stringify(canonicalUnderstanding));
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
