import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_MVP_PROMPT,
  SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS,
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
        return createProviderJsonResponse({ output_text: JSON.stringify(canonicalUnderstanding) });
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
        return createProviderJsonResponse({ output_text: JSON.stringify(canonicalUnderstanding) });
      },
    });

    const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as { model?: string };
    assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer process-key");
    assert.equal(requestBody.model, "process-model");
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
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

test("GuideSite MVP CLI retrieves canonical fixture sources after validated Prompt Understanding", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const output = await runGuideSiteMvpCli([DEFAULT_GUIDESITE_MVP_PROMPT], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_retrieval",
      createRunId: () => "run_cli_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
    });

    const savedRunPath = join(runStateDirectory, "run_cli_retrieval.json");
    assert.match(output, /Prompt Understanding:/);
    assert.match(output, /Retrieval Results:/);
    assert.match(output, /Source ID: program_overnight/);
    assert.match(output, /Source Type: campProgram/);
    assert.match(output, /Title: Overnight Camp Program/);
    assert.match(output, /Rank: 1/);
    assert.match(output, /Field Path: summary/);
    assert.match(output, /Source Revision: mock_rev_program_overnight_001/);
    assert.match(output, /Source ID: policy_homesickness/);
    assert.match(output, /Source ID: policy_parent_communication/);
    assert.match(output, /Answer Composition Source Refs:/);
    assert.match(output, /Section: Known Context/);
    assert.match(output, /Source Title: Overnight Camp Program/);
    assert.match(output, /Source ID: program_overnight/);
    assert.match(output, /Source Type: campProgram/);
    assert.match(output, /Field Path: summary/);
    assert.match(output, /Source Revision: mock_rev_program_overnight_001/);
    assert.match(output, /Section: Open Concerns/);
    assert.match(output, /Source Title: Homesickness Support Policy/);
    assert.match(output, /Source ID: policy_homesickness/);
    assert.match(output, /Source Title: Parent Communication Policy/);
    assert.match(output, /Source ID: policy_parent_communication/);

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "committed");
    assert.deepEqual(savedRun.retrieval.needs, ["overnight_readiness", "homesickness_support"]);
    assert.deepEqual(
      savedRun.retrieval.results.map((result: { sourceId: string; rank: number }) => ({
        sourceId: result.sourceId,
        rank: result.rank,
      })),
      [
        { sourceId: "program_overnight", rank: 1 },
        { sourceId: "policy_homesickness", rank: 2 },
        { sourceId: "policy_parent_communication", rank: 3 },
      ],
    );
    assert.equal(savedRun.retrieval.results[0].fieldPath, "summary");
    assert.equal(savedRun.retrieval.results[0].sourceRevision, "mock_rev_program_overnight_001");

    const retrievalSourceIds = new Set(savedRun.retrieval.results.map((result: { sourceId: string }) => result.sourceId));
    const sourceRefs = savedRun.answerComposition.sections.flatMap(
      (section: { sourceRefs?: { sourceId: string }[] }) => section.sourceRefs ?? [],
    );
    assert.deepEqual(
      sourceRefs.map((sourceRef: { sourceId: string }) => sourceRef.sourceId),
      ["program_overnight", "policy_homesickness", "policy_parent_communication"],
    );
    assert.equal(sourceRefs.every((sourceRef: { sourceId: string }) => retrievalSourceIds.has(sourceRef.sourceId)), true);
    assert.match(JSON.stringify(savedRun.answerComposition, null, 2), /"sourceRefs"/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI persists insufficient-source diagnostics for empty fixture retrieval", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  const unsupportedUnderstanding: PromptUnderstanding = {
    ...canonicalUnderstanding,
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
  };

  try {
    const output = await runGuideSiteMvpCli(["Do", "you", "offer", "camp", "bus", "pickup?"], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_empty_retrieval",
      createRunId: () => "run_cli_empty_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(unsupportedUnderstanding),
    });

    const savedRunPath = join(runStateDirectory, "run_cli_empty_retrieval.json");
    assert.match(output, /Retrieval Results:/);
    assert.match(output, /Needs: bus_schedule/);
    assert.match(output, /Concerns: transportation/);
    assert.match(output, /No fixture sources matched the validated Prompt Understanding/);
    assert.match(output, /insufficient_fixture_sources/);
    assert.doesNotMatch(output, /Source ID:/);
    assert.doesNotMatch(output, /Source Type:/);
    assert.doesNotMatch(output, /Committed Session State:\n\{/);

    const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
    assert.equal(savedRun.status, "fallback");
    assert.deepEqual(savedRun.retrieval.needs, ["bus_schedule"]);
    assert.deepEqual(savedRun.retrieval.concerns, ["transportation"]);
    assert.deepEqual(savedRun.retrieval.results, []);
    assert.deepEqual(savedRun.retrieval.diagnostics, [
      "insufficient_fixture_sources: no approved fixture sources matched retrieval needs bus_schedule or concerns transportation",
    ]);
    assert.deepEqual(savedRun.diagnostics, savedRun.retrieval.diagnostics);
    assert.equal(savedRun.patch, null);
    assert.equal(savedRun.committedSessionState, null);
    assert.equal(savedRun.answerComposition.status, "fallback");
    assert.deepEqual(savedRun.answerComposition.citations, []);
    assert.deepEqual(savedRun.answerComposition.suggestedPrompts, []);
    assert.deepEqual(savedRun.answerComposition.diagnostics, savedRun.retrieval.diagnostics);
    assert.equal(savedRun.answerComposition.sections.some((section: { kind: string }) => section.kind === "sources"), false);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI runs the Sprint 3 sample Prompt set with inspectable Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-sample-runs-"));
  const promptsSeen: string[] = [];
  try {
    const output = await runGuideSiteMvpCli(["--sample-prompts", "--run-state-dir", runStateDirectory], {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => `session_sample_${promptsSeen.length + 1}`,
      createRunId: () => `run_sample_${promptsSeen.length + 1}`,
      promptUnderstandingProvider: {
        async understandPrompt(promptText) {
          promptsSeen.push(promptText);
          const understanding: PromptUnderstanding = {
            ...canonicalUnderstanding,
            fitQuestion: `Understand sample Prompt: ${promptText}`,
            retrievalNeeds: [`retrieval_need_${promptsSeen.length}`],
            contextNeeds: [`context_need_${promptsSeen.length}`],
          };

          return {
            understanding,
            trace: {
              provider: "fake",
              model: "fake-guidesite-prompt-understanding",
              rawOutput: JSON.stringify(understanding),
              parsedOutput: understanding,
              diagnostics: [`diagnostic_${promptsSeen.length}`],
            },
          };
        },
      },
    });

    assert.deepEqual(promptsSeen, SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS);
    assert.match(output, /GuideSite Sprint 3 Sample Prompt Runs/);

    for (const [index, promptText] of SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.entries()) {
      const runNumber = index + 1;
      const savedRunPath = join(runStateDirectory, `run_sample_${runNumber}.json`);
      assert.match(output, new RegExp(`Sample Prompt ${runNumber}/${SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.length}`));
      assert.match(output, new RegExp(`Prompt: ${promptText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      assert.match(output, new RegExp(`"retrieval_need_${runNumber}"`));
      assert.match(output, new RegExp(`"context_need_${runNumber}"`));
      assert.match(output, new RegExp(`"diagnostic_${runNumber}"`));
      assert.match(output, new RegExp(`Saved Run State: ${savedRunPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

      const savedRun = JSON.parse(await readFile(savedRunPath, "utf8"));
      assert.equal(savedRun.prompt.text, promptText);
      assert.deepEqual(savedRun.promptUnderstandingProvider.diagnostics, [`diagnostic_${runNumber}`]);
      assert.deepEqual(savedRun.promptUnderstandingValidation, {
        valid: true,
        diagnostics: [],
      });
      assert.equal(savedRun.understanding.fitQuestion, `Understand sample Prompt: ${promptText}`);
    }
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite MVP CLI sample Prompt runs continue and surface invalid provider output", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-sample-runs-"));
  let runNumber = 0;
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
    const output = await runGuideSiteMvpCli(["--sample-prompts"], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => `session_sample_invalid_${runNumber + 1}`,
      createRunId: () => {
        runNumber += 1;
        return `run_sample_invalid_${runNumber}`;
      },
      promptUnderstandingProvider: {
        async understandPrompt(promptText) {
          if (promptText === SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS[2]) {
            throw new PromptUnderstandingProviderError("provider schema rejected", {
              rawOutput: JSON.stringify(invalidProviderOutput),
              parsedOutput: invalidProviderOutput,
              diagnostics: ["goal: unknown is not valid for this Prompt"],
            });
          }

          return {
            understanding: canonicalUnderstanding,
            trace: {
              provider: "fake",
              model: "fake-guidesite-prompt-understanding",
              rawOutput: JSON.stringify(canonicalUnderstanding),
              parsedOutput: canonicalUnderstanding,
              diagnostics: [],
            },
          };
        },
      },
    });

    assert.match(output, /Sample Prompt 3\/5/);
    assert.match(output, /Prompt: What happens if my son gets homesick\?/);
    assert.match(output, /prompt_understanding_provider_failed: goal: unknown is not valid for this Prompt/);
    assert.match(output, /Sample Prompt 5\/5/);
    assert.match(output, /Prompt: Can I trust your staff\?/);

    const savedRun = JSON.parse(await readFile(join(runStateDirectory, "run_sample_invalid_3.json"), "utf8"));
    assert.equal(savedRun.status, "prompt_understanding_failed");
    assert.deepEqual(savedRun.promptUnderstandingProvider.parsedOutput, invalidProviderOutput);
    assert.equal(savedRun.understanding, null);
    assert.equal(savedRun.committedSessionState, null);
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
