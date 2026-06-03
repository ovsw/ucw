import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_MVP_PROMPT,
  SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS,
  parseGuideSiteMvpCliArgs,
  runGuideSiteMvpCli,
} from "../../src/guidesite-mvp/cli.js";
import { PromptUnderstandingProviderError } from "../../src/guidesite-mvp/openai-prompt-understanding.js";
import {
  canonicalGuideSitePrompt,
  canonicalGuideSiteUnderstanding,
  createFakePromptUnderstandingProvider,
} from "./test-helpers.js";

function createProviderJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("GuideSite MVP CLI requires OpenAI provider configuration for normal runs", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-env-"));
  await assert.rejects(
    () => runGuideSiteMvpCli([], { env: {}, envFilePath: join(runStateDirectory, ".env") }),
    /Missing required OpenAI config for GuideSite Prompt Understanding: OPENAI_API_KEY/,
  );
  rmSync(runStateDirectory, { recursive: true, force: true });
});

test("GuideSite MVP CLI reads OpenAI provider configuration from the repo-root .env file", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-env-"));
  const envFilePath = join(runStateDirectory, ".env");
  let capturedInit: RequestInit | undefined;
  try {
    writeFileSync(envFilePath, "OPENAI_API_KEY=dotenv-key\nOPENAI_PROMPT_UNDERSTANDING_MODEL=dotenv-model\n");

    await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      env: {},
      envFilePath,
      fetchImpl: async (_input, init) => {
        capturedInit = init;
        return createProviderJsonResponse({ output_text: JSON.stringify(canonicalGuideSiteUnderstanding) });
      },
    });

    const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as { model?: string };
    assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer dotenv-key");
    assert.equal(requestBody.model, "dotenv-model");
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI lets process env override the repo-root .env file", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-env-"));
  const envFilePath = join(runStateDirectory, ".env");
  let capturedInit: RequestInit | undefined;
  try {
    writeFileSync(envFilePath, "OPENAI_API_KEY=dotenv-key\nOPENAI_PROMPT_UNDERSTANDING_MODEL=dotenv-model\n");

    await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      env: {
        OPENAI_API_KEY: "process-key",
        OPENAI_PROMPT_UNDERSTANDING_MODEL: "process-model",
      },
      envFilePath,
      fetchImpl: async (_input, init) => {
        capturedInit = init;
        return createProviderJsonResponse({ output_text: JSON.stringify(canonicalGuideSiteUnderstanding) });
      },
    });

    const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as { model?: string };
    assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer process-key");
    assert.equal(requestBody.model, "process-model");
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI renders the canonical Prompt turn output", async () => {
  const output = await runGuideSiteMvpCli([], {
    promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
  });

  assert.match(output, new RegExp(`Prompt: ${canonicalGuideSitePrompt.replace("?", "\\?")}`));
  assert.match(output, /Prompt Understanding Provider:/);
  assert.match(output, /"provider": "fake"/);
  assert.match(output, /Retrieval Results:/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /Session Patch:/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /Has your child slept away from home before\?/);
});

test("GuideSite MVP CLI renders typed Prompt output with provider-backed understanding", async () => {
  const output = await runGuideSiteMvpCli(["Is", "camp", "right", "for", "my", "8-year-old?"], {
    promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
  });

  assert.match(output, /Prompt: Is camp right for my 8-year-old\?/);
  assert.match(output, /"provider": "fake"/);
  assert.match(output, /"valid": true/);
  assert.match(output, /Committed Session State:/);
});

test("GuideSite MVP CLI renders sample Prompt runs", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-sample-runs-"));
  try {
    const output = await runGuideSiteMvpCli(["--sample-prompts", "--run-state-dir", runStateDirectory], {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
    });

    assert.match(output, /GuideSite Sprint 3 Sample Prompt Runs/);
    for (const [index, promptText] of SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.entries()) {
      assert.match(output, new RegExp(`Sample Prompt ${index + 1}/${SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.length}`));
      assert.match(output, new RegExp(`Prompt: ${promptText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
    assert.match(output, /Saved Run State:/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI preserves failed provider output in the rendered Run State", async () => {
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

    assert.match(output, /prompt_understanding_provider_failed/);
    assert.match(output, /Saved Run State:/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI preserves invalid provider output in the rendered Run State", async () => {
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
    const output = await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
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

    assert.match(output, /prompt_understanding_provider_failed: goal: unknown is not valid for this Prompt/);
    assert.match(output, /Saved Run State:/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI argument parsing joins unquoted Prompt text and defaults when empty", () => {
  assert.deepEqual(parseGuideSiteMvpCliArgs([]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
    samplePrompts: false,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["  "]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
    samplePrompts: false,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: null,
    samplePrompts: false,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--run-state-dir", ".guidesite-runs", "Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: ".guidesite-runs",
    samplePrompts: false,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--sample-prompts", "--run-state-dir", ".guidesite-runs"]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: ".guidesite-runs",
    samplePrompts: true,
  });
});
