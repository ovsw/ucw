import { createFixtureGuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/fixture-retrieval.ts";
import { readGuideSiteGuiRuntimeConfig, type GuideSiteGuiRuntimeConfig, type GuideSiteGuiRuntimeEnv } from "../../src/guidesite-mvp/gui-runtime.ts";
import { createOpenAIPromptUnderstandingProvider, type PromptUnderstandingProvider } from "../../src/guidesite-mvp/openai-prompt-understanding.ts";
import { createGuideSiteLoadingPresentation, mapGuideSiteRunStateToPresentation, type GuideSitePresentation } from "../../src/guidesite-mvp/presentation-dto.ts";
import { createGuideSiteMemoryStores, startGuideSiteRun, withProviderBackedUnderstandingAndComposition } from "../../src/guidesite-mvp/run-lifecycle.ts";
import { createGuideSiteFileSessionStore } from "../../src/guidesite-mvp/session-store.ts";
import { createSanityGuideSiteRetrievalAdapterResolver } from "../../src/guidesite-mvp/sanity-retrieval.ts";

import type { GuideSiteStores, RunState } from "../../src/guidesite-mvp/types.ts";

export const DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT = "Is overnight camp right for my 8-year-old?";
export const DEFAULT_GUIDESITE_GUI_SESSION_STORE_DIRECTORY = ".guidesite/operator-demo-sessions";

export type GuideSiteGuiActionResult = {
  promptText: string;
  presentation: GuideSitePresentation;
};

export type GuideSiteGuiTurnRequest = {
  promptText: string;
  sessionId?: string;
  env?: GuideSiteGuiRuntimeEnv;
  envFilePath?: string;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
};

export type GuideSiteGuiRuntimeReader = (options?: {
  env?: GuideSiteGuiRuntimeEnv;
  envFilePath?: string;
}) => GuideSiteGuiRuntimeConfig;

export type GuideSiteGuiTurnExecutor = (request: GuideSiteGuiTurnRequest & {
  runtimeConfig: GuideSiteGuiRuntimeConfig;
}) => Promise<RunState>;

export interface GuideSiteGuiServiceDependencies {
  readRuntimeConfig?: GuideSiteGuiRuntimeReader;
  runTurn?: GuideSiteGuiTurnExecutor;
  createStores?: () => GuideSiteStores;
}

function normalizePromptText(promptText: string): string {
  const trimmed = promptText.trim();

  if (trimmed.length === 0) {
    throw new Error("GuideSite GUI prompt text is required.");
  }

  return trimmed;
}

function createGuideSiteGuiTechnicalFailurePresentation(error: unknown): GuideSitePresentation {
  const message = error instanceof Error ? error.message : String(error);

  return {
    camp: {
      campId: "ultimate-camp-website",
      campName: "Ultimate Camp Website",
      answerAccent: "amber",
      surfaceTone: "warm-sand",
      operatorChrome: "slate",
    },
    answer: {
      status: "technical_failure",
      title: "Technical failure",
      message: "The GuideSite turn failed before a product answer could be rendered.",
    },
    operatorDiagnostics: {
      runId: null,
      sessionId: null,
      runStatus: "loading",
      provider: null,
      model: null,
      diagnostics: [message],
    },
  };
}

function createCanonicalFixturePromptUnderstanding() {
  return {
    goal: "assess_fit" as const,
    promptType: "fit" as const,
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
    facts: {
      child_age: {
        value: 8,
        provenance: {
          source: "explicit" as const,
          promptText: "8-year-old",
        },
      },
    },
    concerns: [
      {
        key: "homesickness",
        label: "Homesickness",
        status: "open" as const,
        provenance: "implied" as const,
      },
      {
        key: "child_readiness",
        label: "Child Readiness",
        status: "open" as const,
        provenance: "implied" as const,
      },
    ],
    retrievalNeeds: ["overnight_readiness", "homesickness_support"],
    contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
  };
}

function createFixturePromptUnderstandingProvider(): PromptUnderstandingProvider {
  return {
    async understandPrompt(promptText) {
      const understanding =
        promptText.trim() === DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT
          ? createCanonicalFixturePromptUnderstanding()
          : {
              goal: "unknown" as const,
              promptType: "unknown" as const,
              fitQuestion: null,
              facts: {},
              concerns: [],
              retrievalNeeds: [],
              contextNeeds: [],
            };

      return {
        understanding,
        trace: {
          provider: "fake",
          model: "fixture-guidesite-gui-prompt-understanding",
          rawOutput: JSON.stringify(understanding),
          parsedOutput: understanding,
          diagnostics: [],
        },
      };
    },
  };
}

function createDefaultGuideSiteGuiStores(): GuideSiteStores {
  return createGuideSiteMemoryStores({
    sessions: createGuideSiteFileSessionStore(DEFAULT_GUIDESITE_GUI_SESSION_STORE_DIRECTORY),
  });
}

async function executeGuideSiteGuiTurn(
  request: GuideSiteGuiTurnRequest & {
    runtimeConfig: GuideSiteGuiRuntimeConfig;
    stores: GuideSiteStores;
  },
): Promise<RunState> {
  const promptUnderstandingProvider =
    request.runtimeConfig.runtimeMode === "fixture"
      ? createFixturePromptUnderstandingProvider()
      : createOpenAIPromptUnderstandingProvider(request.runtimeConfig.promptUnderstandingConfig);

  const retrievalAdapter =
    request.runtimeConfig.retrievalMode === "fixture" ? createFixtureGuideSiteRetrievalAdapter() : undefined;
  const sanityRetrievalAdapterResolver =
    request.runtimeConfig.retrievalMode === "sanity"
      ? createSanityGuideSiteRetrievalAdapterResolver(request.runtimeConfig.sanityQueryConfig)
      : undefined;

  const started = startGuideSiteRun({
    promptText: request.promptText,
    stores: request.stores,
    sessionId: request.sessionId,
    now: request.now,
    createSessionId: request.createSessionId,
    createRunId: request.createRunId,
  });

  return withProviderBackedUnderstandingAndComposition(started.run, promptUnderstandingProvider, {
    now: request.now,
    retrievalAdapter,
    sanityRetrievalAdapterResolver,
  });
}

export function createGuideSiteGuiService(dependencies: GuideSiteGuiServiceDependencies = {}) {
  const readRuntimeConfig = dependencies.readRuntimeConfig ?? readGuideSiteGuiRuntimeConfig;
  const createStores = dependencies.createStores ?? createDefaultGuideSiteGuiStores;
  const stores = createStores();
  const runTurn =
    dependencies.runTurn ??
    ((request: GuideSiteGuiTurnRequest & { runtimeConfig: GuideSiteGuiRuntimeConfig }) =>
      executeGuideSiteGuiTurn({
        ...request,
        stores,
      }));

  async function executePrompt(
    promptText: string,
    options: Omit<GuideSiteGuiTurnRequest, "promptText"> = {},
  ): Promise<GuideSiteGuiActionResult> {
    try {
      const normalizedPromptText = normalizePromptText(promptText);
      const runtimeConfig = readRuntimeConfig({
        env: options.env,
        envFilePath: options.envFilePath,
      });
      const run = await runTurn({
        ...options,
        promptText: normalizedPromptText,
        runtimeConfig,
      });

      return {
        promptText: normalizedPromptText,
        presentation: mapGuideSiteRunStateToPresentation(run),
      };
    } catch (error) {
      return {
        promptText,
        presentation: createGuideSiteGuiTechnicalFailurePresentation(error),
      };
    }
  }

  return {
    createInitialPresentation: () => createGuideSiteLoadingPresentation(),
    readRuntimeConfig,
    startDemo(options: Omit<GuideSiteGuiTurnRequest, "promptText"> = {}) {
      return executePrompt(DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT, options);
    },
    submitPrompt(options: GuideSiteGuiTurnRequest) {
      return executePrompt(options.promptText, options);
    },
  };
}
