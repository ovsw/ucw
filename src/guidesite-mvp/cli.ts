import { pathToFileURL } from "node:url";
import {
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
} from "./run-lifecycle.js";
import { createGuideSiteFileRunStore } from "./run-store.js";
import {
  createOpenAIPromptUnderstandingProvider,
  readOpenAIPromptUnderstandingConfig,
  type OpenAIPromptUnderstandingEnv,
  type PromptUnderstandingProvider,
} from "./openai-prompt-understanding.js";
import { mergeGuideSiteMvpOpenAIEnv } from "./env.js";
import { runGuideSiteMvpTurn } from "./turn.js";

export const DEFAULT_GUIDESITE_MVP_PROMPT = "Is overnight camp right for my 8-year-old?";
export const SPRINT_3_GUIDESITE_MVP_SAMPLE_PROMPTS = [
  "Is overnight camp right for my 8-year-old?",
  "My child is shy and has never slept away from home.",
  "What happens if my son gets homesick?",
  "Show me dates and prices.",
  "Can I trust your staff?",
];

export type ParsedGuideSiteMvpCliArgs = {
  promptText: string;
  runStateDirectory: string | null;
  samplePrompts: boolean;
};

export type RunGuideSiteMvpCliOptions = {
  runStateDirectory?: string;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
  env?: OpenAIPromptUnderstandingEnv;
  envFilePath?: string;
  fetchImpl?: typeof fetch;
  promptUnderstandingProvider?: PromptUnderstandingProvider;
};

export function parseGuideSiteMvpCliArgs(args: string[]): ParsedGuideSiteMvpCliArgs {
  const promptParts: string[] = [];
  let runStateDirectory: string | null = null;
  let samplePrompts = false;

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

    promptParts.push(arg);
  }

  const promptText = promptParts.join(" ").trim();

  return {
    promptText: promptText || DEFAULT_GUIDESITE_MVP_PROMPT,
    runStateDirectory,
    samplePrompts,
  };
}

function renderGuideSiteMvpCliOutput(run: Parameters<typeof renderGuideSiteRunOperatorOutput>[0], savedRunPath?: string): string {
  return [renderGuideSiteRunOperatorOutput(run), savedRunPath ? `Saved Run State: ${savedRunPath}` : null]
    .filter((line) => line !== null)
    .join("\n");
}

async function runSingleGuideSiteMvpPrompt(
  promptText: string,
  options: RunGuideSiteMvpCliOptions,
  promptUnderstandingProvider: PromptUnderstandingProvider,
): Promise<string> {
  const runStateDirectory = options.runStateDirectory;
  const runStore = runStateDirectory ? createGuideSiteFileRunStore(runStateDirectory) : undefined;
  const stores = createGuideSiteMemoryStores(runStore ? { runs: runStore } : undefined);
  const run = await runGuideSiteMvpTurn({
    promptText,
    stores,
    promptUnderstandingProvider,
    now: options.now,
    createSessionId: options.createSessionId,
    createRunId: options.createRunId,
  });

  return renderGuideSiteMvpCliOutput(run, stores.runs.inspect?.(run.runId)?.path);
}

export async function runGuideSiteMvpCli(args: string[], options: RunGuideSiteMvpCliOptions = {}): Promise<string> {
  const parsedArgs = parseGuideSiteMvpCliArgs(args);
  const runOptions = {
    ...options,
    runStateDirectory: options.runStateDirectory ?? parsedArgs.runStateDirectory ?? undefined,
  } satisfies RunGuideSiteMvpCliOptions;
  const promptUnderstandingProvider =
    runOptions.promptUnderstandingProvider ??
    createOpenAIPromptUnderstandingProvider(
      readOpenAIPromptUnderstandingConfig(
        mergeGuideSiteMvpOpenAIEnv({
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
