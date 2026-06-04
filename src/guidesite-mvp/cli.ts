import { pathToFileURL } from "node:url";
import {
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
} from "./run-lifecycle.js";
import {
  createFixtureGuideSiteRetrievalAdapter,
  type GuideSiteRetrievalAdapter,
} from "./fixture-retrieval.js";
import { createGuideSiteFileRunStore } from "./run-store.js";
import {
  createOpenAIPromptUnderstandingProvider,
  readOpenAIPromptUnderstandingConfig,
  type PromptUnderstandingProvider,
} from "./openai-prompt-understanding.js";
import { mergeGuideSiteMvpEnv, type GuideSiteMvpEnv } from "./env.js";
import { readSanityQueryConfig } from "../retrieval-workbench/sanity-config.js";
import {
  createSanityGuideSiteRetrievalAdapterResolver,
  type GuideSiteSanityRetrievalAdapterResolver,
} from "./sanity-retrieval.js";
import { runGuideSiteMvpTurn } from "./turn.js";

export const DEFAULT_GUIDESITE_MVP_PROMPT = "Is overnight camp right for my 8-year-old?";
export const SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS = [
  "Is overnight camp right for my 8-year-old?",
  "My child is shy and has never slept away from home.",
  "What happens if my son gets homesick?",
  "Show me dates and prices.",
  "Can I trust your staff?",
];

export type GuideSiteRetrievalMode = "fixture" | "sanity";

export type ParsedGuideSiteMvpCliArgs = {
  promptText: string;
  runStateDirectory: string | null;
  samplePrompts: boolean;
  retrievalMode: GuideSiteRetrievalMode;
  turnPrompts: string[];
};

export type RunGuideSiteMvpCliOptions = {
  runStateDirectory?: string;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
  env?: GuideSiteMvpEnv;
  envFilePath?: string;
  fetchImpl?: typeof fetch;
  promptUnderstandingProvider?: PromptUnderstandingProvider;
  retrievalAdapter?: GuideSiteRetrievalAdapter;
  sanityRetrievalAdapter?: GuideSiteRetrievalAdapter;
  sanityRetrievalAdapterResolver?: GuideSiteSanityRetrievalAdapterResolver;
  retrievalMode?: GuideSiteRetrievalMode;
};

function parseGuideSiteRetrievalMode(value: string): GuideSiteRetrievalMode {
  if (value === "fixture" || value === "sanity") {
    return value;
  }

  throw new Error(`Unknown GuideSite retrieval mode: ${value}. Use fixture or sanity.`);
}

export function parseGuideSiteMvpCliArgs(args: string[]): ParsedGuideSiteMvpCliArgs {
  const promptParts: string[] = [];
  let runStateDirectory: string | null = null;
  let samplePrompts = false;
  let retrievalMode: GuideSiteRetrievalMode = "fixture";
  const turnPrompts: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--sample-prompts") {
      samplePrompts = true;
      continue;
    }

    if (arg === "--run-state-dir") {
      const value = args[index + 1]?.trim();
      if (!value) {
        throw new Error("--run-state-dir requires a directory path");
      }
      runStateDirectory = value;
      index += 1;
      continue;
    }

    if (arg === "--turn") {
      const value = args[index + 1]?.trim();
      if (!value) {
        throw new Error("--turn requires a prompt");
      }
      turnPrompts.push(value);
      index += 1;
      continue;
    }

    if (arg === "--retrieval" || arg.startsWith("--retrieval=")) {
      const value = arg === "--retrieval" ? args[index + 1]?.trim() : arg.split("=", 2)[1]?.trim();
      if (!value) {
        throw new Error("--retrieval requires fixture or sanity");
      }

      retrievalMode = parseGuideSiteRetrievalMode(value);

      if (arg === "--retrieval") {
        index += 1;
      }

      continue;
    }

    promptParts.push(arg);
  }

  const promptText = promptParts.join(" ").trim();

  return {
    promptText: promptText || DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory,
    samplePrompts,
    retrievalMode,
    turnPrompts,
  };
}

function renderGuideSiteMvpCliOutput(run: Parameters<typeof renderGuideSiteRunOperatorOutput>[0], savedRunPath?: string): string {
  const lines = [renderGuideSiteRunOperatorOutput(run)];

  if (savedRunPath) {
    lines.push(`Saved Run State: ${savedRunPath}`);
  }

  return lines.join("\n");
}

function createGuideSiteMvpStores(runStateDirectory?: string) {
  const runStore = runStateDirectory ? createGuideSiteFileRunStore(runStateDirectory) : undefined;
  return createGuideSiteMemoryStores(runStore ? { runs: runStore } : undefined);
}

async function runSingleGuideSiteMvpPrompt(
  promptText: string,
  options: RunGuideSiteMvpCliOptions,
  promptUnderstandingProvider: PromptUnderstandingProvider,
): Promise<string> {
  const stores = createGuideSiteMvpStores(options.runStateDirectory);
  const run = await runGuideSiteMvpTurn({
    promptText,
    stores,
    promptUnderstandingProvider,
    retrievalAdapter: options.retrievalAdapter,
    sanityRetrievalAdapterResolver: options.sanityRetrievalAdapterResolver,
    now: options.now,
    createSessionId: options.createSessionId,
    createRunId: options.createRunId,
  });

  return renderGuideSiteMvpCliOutput(run, stores.runs.inspect?.(run.runId)?.path);
}

function resolveGuideSiteRetrievalConfiguration(
  parsedArgs: ParsedGuideSiteMvpCliArgs,
  options: RunGuideSiteMvpCliOptions,
): {
  retrievalAdapter?: GuideSiteRetrievalAdapter;
  sanityRetrievalAdapterResolver?: GuideSiteSanityRetrievalAdapterResolver;
} {
  const retrievalMode = options.retrievalMode ?? parsedArgs.retrievalMode;

  if (retrievalMode === "sanity") {
    const mergedEnv = mergeGuideSiteMvpEnv({
      env: options.env,
      envFilePath: options.envFilePath,
    });
    const sanityQueryConfig = readSanityQueryConfig(mergedEnv);

    const sanityRetrievalAdapter = options.sanityRetrievalAdapter ?? options.retrievalAdapter;
    if (!sanityRetrievalAdapter) {
      return {
        sanityRetrievalAdapterResolver:
          options.sanityRetrievalAdapterResolver ??
          createSanityGuideSiteRetrievalAdapterResolver(sanityQueryConfig, options.fetchImpl),
      };
    }

    return {
      retrievalAdapter: sanityRetrievalAdapter,
    };
  }

  return {
    retrievalAdapter: options.retrievalAdapter ?? createFixtureGuideSiteRetrievalAdapter(),
  };
}

async function runMultiTurnGuideSiteMvpSession(
  promptTexts: string[],
  options: RunGuideSiteMvpCliOptions,
  promptUnderstandingProvider: PromptUnderstandingProvider,
): Promise<string> {
  const stores = createGuideSiteMvpStores(options.runStateDirectory);
  const sessionId = options.createSessionId?.() ?? `session_${crypto.randomUUID()}`;
  const runIdPrefix = options.createRunId?.() ?? `run_${crypto.randomUUID()}`;
  const outputs: string[] = [];

  for (const [index, promptText] of promptTexts.entries()) {
    const run = await runGuideSiteMvpTurn({
      promptText,
      stores,
      promptUnderstandingProvider,
      retrievalAdapter: options.retrievalAdapter,
      sanityRetrievalAdapterResolver: options.sanityRetrievalAdapterResolver,
      now: options.now,
      createSessionId: () => sessionId,
      createRunId: () => `${runIdPrefix}_${index + 1}`,
    });

    outputs.push(
      [
        `Turn ${index + 1}/${promptTexts.length}`,
        renderGuideSiteMvpCliOutput(run, stores.runs.inspect?.(run.runId)?.path),
      ].join("\n"),
    );
  }

  return ["GuideSite Multi-Turn Session Run", ...outputs].join("\n\n");
}

export async function runGuideSiteMvpCli(args: string[], options: RunGuideSiteMvpCliOptions = {}): Promise<string> {
  const parsedArgs = parseGuideSiteMvpCliArgs(args);
  const retrievalConfiguration = resolveGuideSiteRetrievalConfiguration(parsedArgs, options);
  const runOptions = {
    ...options,
    runStateDirectory: options.runStateDirectory ?? parsedArgs.runStateDirectory ?? undefined,
    retrievalAdapter: retrievalConfiguration.retrievalAdapter,
    sanityRetrievalAdapterResolver: retrievalConfiguration.sanityRetrievalAdapterResolver,
  } satisfies RunGuideSiteMvpCliOptions;
  const promptUnderstandingProvider =
    runOptions.promptUnderstandingProvider ??
    createOpenAIPromptUnderstandingProvider(
      readOpenAIPromptUnderstandingConfig(
        mergeGuideSiteMvpEnv({
          env: runOptions.env,
          envFilePath: runOptions.envFilePath,
        }),
      ),
      runOptions.fetchImpl,
    );

  if (parsedArgs.samplePrompts) {
    const outputs: string[] = [];
    for (const [index, promptText] of SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.entries()) {
      outputs.push(
        [
          `Sample Prompt ${index + 1}/${SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS.length}`,
          await runSingleGuideSiteMvpPrompt(promptText, runOptions, promptUnderstandingProvider),
        ].join("\n"),
      );
    }

    return ["GuideSite Sprint 3 Sample Prompt Runs", ...outputs].join("\n\n");
  }

  if (parsedArgs.turnPrompts.length > 0) {
    const promptTexts = [parsedArgs.promptText, ...parsedArgs.turnPrompts];
    return runMultiTurnGuideSiteMvpSession(promptTexts, runOptions, promptUnderstandingProvider);
  }

  return runSingleGuideSiteMvpPrompt(parsedArgs.promptText, runOptions, promptUnderstandingProvider);
}

export async function main(cliArgs = process.argv.slice(2)): Promise<void> {
  try {
    console.log(await runGuideSiteMvpCli(cliArgs));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
