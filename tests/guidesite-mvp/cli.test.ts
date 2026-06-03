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
import type { PromptUnderstanding } from "../../src/guidesite-mvp/types.js";
import type { PromptUnderstandingProvider } from "../../src/guidesite-mvp/openai-prompt-understanding.js";

function createProviderJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}

function createMultiTurnPromptUnderstandingProvider(): PromptUnderstandingProvider {
  const followUpPrompt = "She has slept at her grandparents' house a few times.";
  const followUpUnderstanding: PromptUnderstanding = {
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
      prior_sleepaway_experience: {
        value: "slept_with_grandparents",
        provenance: {
          source: "explicit",
          promptText: followUpPrompt,
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
    contextNeeds: ["child_readiness"],
  };

  return {
    async understandPrompt(promptText: string) {
      const understanding = promptText === canonicalGuideSitePrompt ? canonicalGuideSiteUnderstanding : followUpUnderstanding;

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
  assert.match(output, /Session Revision: 1/);
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

test("GuideSite MVP CLI runs multiple prompts in one session", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-cli-multi-turn-"));
  try {
    const output = await runGuideSiteMvpCli(["--run-state-dir", runStateDirectory, "--turn", "She has slept at her grandparents' house a few times."], {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_multi_turn",
      createRunId: () => "run_multi_turn",
      promptUnderstandingProvider: createMultiTurnPromptUnderstandingProvider(),
    });

    assert.match(output, /GuideSite Multi-Turn Session Run/);
    assert.match(output, /Turn 1\/2/);
    assert.match(output, /Turn 2\/2/);
    assert.match(output, /Session ID: session_multi_turn/);
    assert.match(output, /Session Revision: 1/);
    assert.match(output, /Session Revision: 2/);
    assert.match(output, /Base Revision: 2/);
    assert.match(output, /"sourceRunId": "run_multi_turn_1"/);
    assert.match(output, /"sourceRunId": "run_multi_turn_2"/);

    const turn1Run = JSON.parse(readFileSync(join(runStateDirectory, "run_multi_turn_1.json"), "utf8")) as {
      baseSessionRevision: number;
      committedSessionState: { revision: number } | null;
      snapshot: { revision: number };
    };
    const turn2Run = JSON.parse(readFileSync(join(runStateDirectory, "run_multi_turn_2.json"), "utf8")) as {
      baseSessionRevision: number;
      committedSessionState: { revision: number } | null;
      snapshot: { revision: number };
    };

    assert.equal(turn1Run.baseSessionRevision, 1);
    assert.equal(turn1Run.committedSessionState?.revision, 2);
    assert.equal(turn2Run.baseSessionRevision, 2);
    assert.equal(turn2Run.snapshot.revision, 2);
    assert.equal(turn2Run.committedSessionState?.revision, 3);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
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
      "answer_composition_citation_program_overnight_unsupported_source_ref",
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
    turnPrompts: [],
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["  "]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
    samplePrompts: false,
    turnPrompts: [],
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: null,
    samplePrompts: false,
    turnPrompts: [],
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--run-state-dir", ".guidesite-runs", "Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
    runStateDirectory: ".guidesite-runs",
    samplePrompts: false,
    turnPrompts: [],
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--sample-prompts", "--run-state-dir", ".guidesite-runs"]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: ".guidesite-runs",
    samplePrompts: true,
    turnPrompts: [],
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["--turn", "She has slept at her grandparents' house a few times."]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory: null,
    samplePrompts: false,
    turnPrompts: ["She has slept at her grandparents' house a few times."],
  });
});
