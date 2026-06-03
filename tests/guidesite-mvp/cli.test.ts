import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_MVP_PROMPT,
  SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS,
  parseGuideSiteMvpCliArgs,
  runGuideSiteMvpCli,
} from "../../src/guidesite-mvp/cli.js";
import type { GuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/fixture-retrieval.js";
import { PromptUnderstandingProviderError } from "../../src/guidesite-mvp/openai-prompt-understanding.js";
import {
  canonicalGuideSitePrompt,
  canonicalGuideSiteUnderstanding,
  createFakePromptUnderstandingProvider,
  homesicknessConcernUnderstanding,
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
  assert.match(output, /Session ID:/);
  assert.match(output, /Run ID:/);
  assert.match(output, /Base Revision: 1/);
  assert.match(output, /Prompt Understanding Provider:/);
  assert.match(output, /Prompt Understanding Summary:/);
  assert.match(output, /Retrieval Status: source_backed/);
  assert.match(output, /"provider": "fake"/);
  assert.match(output, /Retrieval Results:/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /Answer Composition Status: needs_context/);
  assert.match(output, /Conversational Framing:/);
  assert.match(output, /Answer Composition Sections:/);
  assert.match(output, /Suggested Prompts:/);
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

test("GuideSite MVP CLI renders a source-backed homesickness Concern answer", async () => {
  const output = await runGuideSiteMvpCli(["What happens if my child gets homesick?"], {
    promptUnderstandingProvider: createFakePromptUnderstandingProvider(homesicknessConcernUnderstanding),
  });

  assert.match(output, /Answer Composition Status: answered/);
  assert.match(output, /Homesickness Support Policy/);
  assert.match(output, /Parent Communication Policy/);
  assert.match(output, /Source ID: policy_homesickness/);
  assert.match(output, /Source ID: policy_parent_communication/);
  assert.match(output, /Raw Answer Composition JSON:/);
  assert.match(output, /Committed Session State:\nnull/);
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

test("GuideSite MVP CLI renders the safe fallback when Answer Composition validation fails locally", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-runs-"));
  try {
    const retrievalAdapter: GuideSiteRetrievalAdapter = {
      id: "invalid-answer-composition",
      label: "Invalid Answer Composition Retrieval",
      retrieve(input) {
        return {
          needs: [...input.retrievalNeeds],
          concerns: input.concerns.map((concern) => concern.key),
          results: [
            {
              sourceId: "program_overnight",
              sourceType: "campProgram",
              title: "Unsafe Secret Draft",
              rank: 1,
              fieldPath: "",
              sourceRevision: "mock_rev_program_overnight_001",
            },
            {
              sourceId: "policy_homesickness",
              sourceType: "policy",
              title: "Homesickness Support Policy",
              rank: 2,
              fieldPath: "summary",
              sourceRevision: "mock_rev_policy_homesickness_001",
            },
            {
              sourceId: "policy_parent_communication",
              sourceType: "policy",
              title: "Parent Communication Policy",
              rank: 3,
              fieldPath: "summary",
              sourceRevision: "mock_rev_policy_parent_communication_001",
            },
            {
              sourceId: "concern_homesickness",
              sourceType: "concern",
              title: "Homesickness and Child Readiness",
              rank: 4,
              fieldPath: "summary",
              sourceRevision: "mock_rev_concern_homesickness_001",
            },
          ],
          diagnostics: ["fake_invalid_answer_composition_retrieval"],
          coverage: {
            status: "source_backed",
            matchedSourceIds: ["program_overnight", "policy_homesickness", "policy_parent_communication", "concern_homesickness"],
          },
        };
      },
    };

    const output = await runGuideSiteMvpCli([], {
      runStateDirectory,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_cli_invalid_answer_composition",
      createRunId: () => "run_cli_invalid_answer_composition",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
      retrievalAdapter,
    });

    assert.match(output, /Answer Composition Validation:/);
    assert.match(output, /"valid": false/);
    assert.match(output, /I don't have enough verified information to answer that confidently\./);
    assert.match(output, /Answer Composition Status: validation_failed/);
    assert.doesNotMatch(output, /Answer Composition Status: needs_context/);
    assert.match(output, /Saved Run State:/);

    const savedRun = JSON.parse(
      readFileSync(join(runStateDirectory, "run_cli_invalid_answer_composition.json"), "utf8"),
    ) as {
      status: string;
      answerComposition: unknown;
      answerCompositionValidation: { valid: boolean; diagnostics: string[] } | null;
      rejectedAnswerComposition: { sections: Array<{ sourceRefs?: Array<{ title: string }> }> } | null;
      committedSessionState: unknown;
      diagnostics: string[];
    };
    assert.equal(savedRun.status, "validation_failed");
    assert.equal(savedRun.answerComposition, null);
    assert.equal(savedRun.answerCompositionValidation?.valid, false);
    assert.equal(savedRun.rejectedAnswerComposition?.sections[0]?.sourceRefs?.[0]?.title, "Unsafe Secret Draft");
    assert.equal(savedRun.committedSessionState, null);
    assert.deepEqual(savedRun.diagnostics, [
      "fake_invalid_answer_composition_retrieval",
      "answer_composition_section_0_source_ref_0_field_path_required",
      "answer_composition_section_5_source_ref_0_field_path_required",
    ]);
  } finally {
    rmSync(runStateDirectory, { recursive: true });
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
