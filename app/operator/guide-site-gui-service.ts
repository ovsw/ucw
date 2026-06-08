import { createFixtureGuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/fixture-retrieval.ts";
import { readGuideSiteGuiRuntimeConfig, type GuideSiteGuiRuntimeConfig, type GuideSiteGuiRuntimeEnv } from "../../src/guidesite-mvp/gui-runtime.ts";
import { createOpenAIPromptUnderstandingProvider, type PromptUnderstandingProvider } from "../../src/guidesite-mvp/openai-prompt-understanding.ts";
import { createGuideSiteLoadingPresentation, createGuideSiteTechnicalFailurePresentation, mapGuideSiteRunStateToPresentation, type GuideSitePresentation } from "../../src/guidesite-mvp/presentation-dto.ts";
import { buildHardcodedSessionPatch, commitSessionPatch, createGuideSiteMemoryStores, startGuideSiteRun, withProviderBackedUnderstandingAndComposition } from "../../src/guidesite-mvp/run-lifecycle.ts";
import { createGuideSiteFileRunStore } from "../../src/guidesite-mvp/run-store.ts";
import { createGuideSiteFileSessionStore } from "../../src/guidesite-mvp/session-store.ts";
import { createSanityGuideSiteRetrievalAdapterResolver } from "../../src/guidesite-mvp/sanity-retrieval.ts";

import type { GuideSiteStores, PromptUnderstanding, PromptUnderstandingSessionContext, RunState } from "../../src/guidesite-mvp/types.ts";

export const DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT = "Is overnight camp right for my 8-year-old?";
export const DEFAULT_GUIDESITE_GUI_SESSION_STORE_DIRECTORY = ".guidesite/operator-demo-sessions";
export const DEFAULT_GUIDESITE_GUI_RUN_STORE_DIRECTORY = ".guidesite/operator-demo-runs";

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

export type GuideSiteGuiStartDemoRequest = Omit<GuideSiteGuiTurnRequest, "promptText" | "sessionId">;
export type GuideSiteGuiRestoreRequest = Omit<GuideSiteGuiTurnRequest, "promptText">;

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

  return createGuideSiteTechnicalFailurePresentation([message]);
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

const DEFAULT_REQUIRED_CONTEXT_NEEDS = ["prior_sleepaway_experience", "child_readiness"] as const;
const REQUIRED_CONTEXT_RETRIEVAL_NEEDS = ["overnight_readiness", "homesickness_support"] as const;
const VAGUE_REQUIRED_CONTEXT_MARKERS = [
  "i don't know",
  "i do not know",
  "idk",
  "not sure",
  "unsure",
  "maybe",
  "maybe so",
  "sometimes",
  "kind of",
  "sort of",
  "i think",
  "i guess",
  "a little",
  "somewhat",
] as const;
const WITHHELD_REQUIRED_CONTEXT_MARKERS = [
  "prefer not to say",
  "rather not say",
  "don't want to say",
  "do not want to say",
  "don't want to answer",
  "do not want to answer",
  "skip",
  "pass",
  "withhold",
  "no comment",
] as const;
const PRECISE_SLEEPAWAY_MARKERS = [
  "grandparent",
  "grandparents",
  "slept away",
  "sleepaway",
  "away from home",
  "overnight at",
] as const;
const NO_PRIOR_SLEEPAWAY_MARKERS = [
  "has not slept away",
  "hasn't slept away",
  "not slept away",
  "never slept away",
  "no prior sleepaway",
] as const;
const PRECISE_CHILD_READINESS_MARKERS = [
  "handles new routines",
  "new routines",
  "time away",
  "asks adults",
  "asks for help",
  "does great",
  "did great",
  "does well",
  "separation",
  "independent",
  "ready",
] as const;
const CONCERNING_CHILD_READINESS_MARKERS = [
  "struggles",
  "struggle",
  "anxious",
  "cries",
  "not ready",
  "doesn't handle",
  "does not handle",
  "needs more readiness support",
  "needs more support",
] as const;

function createRequiredContextConcerns(): PromptUnderstanding["concerns"] {
  return [
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
  ];
}

function includesAnyMarker(normalizedPromptText: string, markers: readonly string[]): boolean {
  return markers.some((marker) => normalizedPromptText.includes(marker));
}

function getPendingContextNeeds(context?: PromptUnderstandingSessionContext): string[] {
  const contextNeeds = context?.session.focus.contextNeeds;
  const pendingContextNeeds = contextNeeds && contextNeeds.length > 0 ? contextNeeds : DEFAULT_REQUIRED_CONTEXT_NEEDS;
  return [...new Set(pendingContextNeeds)];
}

function createVagueRequiredContextUnderstanding(
  context?: PromptUnderstandingSessionContext,
): PromptUnderstanding {
  return {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's Child after clarifying the missing context.",
    facts: {},
    concerns: createRequiredContextConcerns(),
    retrievalNeeds: [...REQUIRED_CONTEXT_RETRIEVAL_NEEDS],
    contextNeeds: getPendingContextNeeds(context),
  };
}

function createPriorSleepawayExperienceFactValue(normalizedPromptText: string): string {
  return includesAnyMarker(normalizedPromptText, NO_PRIOR_SLEEPAWAY_MARKERS)
    ? "no_prior_sleepaway_experience"
    : "slept_with_grandparents";
}

function createChildReadinessFactValue(normalizedPromptText: string): string {
  return includesAnyMarker(normalizedPromptText, CONCERNING_CHILD_READINESS_MARKERS)
    ? "needs_more_readiness_support"
    : "handles_new_routines_well";
}

function createPreciseRequiredContextUnderstanding(
  promptText: string,
  normalizedPromptText: string,
  context?: PromptUnderstandingSessionContext,
): PromptUnderstanding {
  const pendingContextNeeds = getPendingContextNeeds(context);
  const facts: PromptUnderstanding["facts"] = {};
  const answeredContextNeeds = new Set<string>();

  if (pendingContextNeeds.includes("prior_sleepaway_experience") && looksPreciseSleepawayReply(normalizedPromptText)) {
    facts.prior_sleepaway_experience = {
      value: createPriorSleepawayExperienceFactValue(normalizedPromptText),
      provenance: {
        source: "explicit",
        promptText,
      },
    };
    answeredContextNeeds.add("prior_sleepaway_experience");
  }

  if (pendingContextNeeds.includes("child_readiness") && looksPreciseChildReadinessReply(normalizedPromptText)) {
    facts.child_readiness = {
      value: createChildReadinessFactValue(normalizedPromptText),
      provenance: {
        source: "explicit",
        promptText,
      },
    };
    answeredContextNeeds.add("child_readiness");
  }

  return {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's Child after learning required Visitor Context.",
    facts,
    concerns: createRequiredContextConcerns(),
    retrievalNeeds: [...REQUIRED_CONTEXT_RETRIEVAL_NEEDS],
    contextNeeds: pendingContextNeeds.filter((need) => !answeredContextNeeds.has(need)),
  };
}

function createWithheldRequiredContextUnderstanding(): PromptUnderstanding {
  return {
    goal: "gather_context",
    promptType: "factual",
    fitQuestion: null,
    facts: {},
    concerns: [],
    retrievalNeeds: [],
    contextNeeds: [],
  };
}

function looksVagueRequiredContextReply(normalizedPromptText: string): boolean {
  return includesAnyMarker(normalizedPromptText, VAGUE_REQUIRED_CONTEXT_MARKERS);
}

function looksWithheldRequiredContextReply(normalizedPromptText: string): boolean {
  return includesAnyMarker(normalizedPromptText, WITHHELD_REQUIRED_CONTEXT_MARKERS);
}

function looksPreciseSleepawayReply(normalizedPromptText: string): boolean {
  return includesAnyMarker(normalizedPromptText, PRECISE_SLEEPAWAY_MARKERS);
}

function looksPreciseChildReadinessReply(normalizedPromptText: string): boolean {
  return includesAnyMarker(normalizedPromptText, PRECISE_CHILD_READINESS_MARKERS);
}

function looksPreciseRequiredContextReply(normalizedPromptText: string): boolean {
  return looksPreciseSleepawayReply(normalizedPromptText) || looksPreciseChildReadinessReply(normalizedPromptText);
}

function createFixturePromptUnderstandingProvider(): PromptUnderstandingProvider {
  return {
    async understandPrompt(promptText, context) {
      const trimmedPromptText = promptText.trim();
      const normalizedPromptText = trimmedPromptText.toLowerCase();
      let understanding: PromptUnderstanding;

      if (trimmedPromptText === DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT) {
        understanding = createCanonicalFixturePromptUnderstanding();
      } else if (looksWithheldRequiredContextReply(normalizedPromptText)) {
        understanding = createWithheldRequiredContextUnderstanding();
      } else if (looksPreciseRequiredContextReply(normalizedPromptText)) {
        understanding = createPreciseRequiredContextUnderstanding(trimmedPromptText, normalizedPromptText, context);
      } else if (looksVagueRequiredContextReply(normalizedPromptText)) {
        understanding = createVagueRequiredContextUnderstanding(context);
      } else {
        understanding = {
          goal: "unknown" as const,
          promptType: "unknown" as const,
          fitQuestion: null,
          facts: {},
          concerns: [],
          retrievalNeeds: [],
          contextNeeds: [],
        };
      }

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
    runs: createGuideSiteFileRunStore(DEFAULT_GUIDESITE_GUI_RUN_STORE_DIRECTORY),
  });
}

function isRestorableGuideSiteGuiRun(run: RunState, sessionId: string): boolean {
  return run.sessionId === sessionId && run.promptUnderstandingValidation?.valid === true && run.answerComposition !== null;
}

function readLatestRestorableGuideSiteGuiRun(stores: GuideSiteStores, sessionId: string | undefined): RunState | null {
  if (!sessionId) {
    return null;
  }

  const session = stores.sessions.read(sessionId);
  const latestPrompt = session?.promptHistory?.at(-1);
  if (!session || !latestPrompt) {
    return null;
  }

  const run = stores.runs.read(latestPrompt.runId);
  if (!run || !isRestorableGuideSiteGuiRun(run, session.sessionId)) {
    return null;
  }

  return {
    ...run,
    committedSessionState: run.committedSessionState ?? session,
  };
}

function createNewDemoRequest(options: GuideSiteGuiRestoreRequest | GuideSiteGuiStartDemoRequest = {}): GuideSiteGuiStartDemoRequest {
  const { sessionId: _sessionId, ...newDemoRequest } = options as GuideSiteGuiRestoreRequest;
  return newDemoRequest;
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

  const composed = await withProviderBackedUnderstandingAndComposition(started.run, promptUnderstandingProvider, {
    now: request.now,
    retrievalAdapter,
    sanityRetrievalAdapterResolver,
  });

  if (
    composed.promptUnderstandingValidation?.valid &&
    (composed.answerComposition?.status === "needs_context" || composed.answerComposition?.status === "answered")
  ) {
    const patch = buildHardcodedSessionPatch(composed);
    return commitSessionPatch({
      stores: request.stores,
      run: composed,
      patch,
      now: request.now,
    }).run;
  }

  return composed;
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
    startDemo(options: GuideSiteGuiStartDemoRequest = {}) {
      return executePrompt(DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT, createNewDemoRequest(options));
    },
    async restoreDemo(options: GuideSiteGuiRestoreRequest = {}) {
      try {
        const restoredRun = readLatestRestorableGuideSiteGuiRun(stores, options.sessionId);
        if (restoredRun) {
          return {
            promptText: restoredRun.prompt.text,
            presentation: mapGuideSiteRunStateToPresentation(restoredRun),
          };
        }
      } catch (error) {
        return {
          promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
          presentation: createGuideSiteGuiTechnicalFailurePresentation(error),
        };
      }

      return executePrompt(DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT, createNewDemoRequest(options));
    },
    submitPrompt(options: GuideSiteGuiTurnRequest) {
      return executePrompt(options.promptText, options);
    },
  };
}
