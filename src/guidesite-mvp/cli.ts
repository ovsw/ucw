import { pathToFileURL } from "node:url";
import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  startGuideSiteRun,
  withProviderBackedUnderstandingAndComposition,
} from "./run-lifecycle.js";
import { createGuideSiteFileRunStore } from "./run-store.js";
import {
  createOpenAIPromptUnderstandingProvider,
  readOpenAIPromptUnderstandingConfig,
  type OpenAIPromptUnderstandingEnv,
  type PromptUnderstandingProvider,
} from "./openai-prompt-understanding.js";

export const DEFAULT_GUIDESITE_MVP_PROMPT = "Is overnight camp right for my 8-year-old?";

export type ParsedGuideSiteMvpCliArgs = {
  promptText: string;
  runStateDirectory: string | null;
};

export type RunGuideSiteMvpCliOptions = {
  runStateDirectory?: string;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
  env?: OpenAIPromptUnderstandingEnv;
  fetchImpl?: typeof fetch;
  promptUnderstandingProvider?: PromptUnderstandingProvider;
};

export function parseGuideSiteMvpCliArgs(args: string[]): ParsedGuideSiteMvpCliArgs {
  const promptParts: string[] = [];
  let runStateDirectory: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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
  };
}

function renderGuideSiteMvpCliOutput(run: Parameters<typeof renderGuideSiteRunOperatorOutput>[0], savedRunPath?: string): string {
  return [renderGuideSiteRunOperatorOutput(run), savedRunPath ? `Saved Run State: ${savedRunPath}` : null]
    .filter((line) => line !== null)
    .join("\n");
}

export async function runGuideSiteMvpCli(args: string[], options: RunGuideSiteMvpCliOptions = {}): Promise<string> {
  const parsedArgs = parseGuideSiteMvpCliArgs(args);
  const runStateDirectory = options.runStateDirectory ?? parsedArgs.runStateDirectory;
  const promptUnderstandingProvider =
    options.promptUnderstandingProvider ??
    createOpenAIPromptUnderstandingProvider(
      readOpenAIPromptUnderstandingConfig(options.env),
      options.fetchImpl,
    );
  const stores = createGuideSiteMemoryStores(
    runStateDirectory
      ? {
          runs: createGuideSiteFileRunStore(runStateDirectory),
        }
      : undefined,
  );
  const started = startGuideSiteRun({
    promptText: parsedArgs.promptText,
    stores,
    now: options.now,
    createSessionId: options.createSessionId,
    createRunId: options.createRunId,
  });
  const composedRun = stores.runs.update(
    await withProviderBackedUnderstandingAndComposition(started.run, promptUnderstandingProvider, { now: options.now }),
  );

  if (composedRun.answerComposition?.status !== "needs_context") {
    return renderGuideSiteMvpCliOutput(composedRun, stores.runs.inspect?.(composedRun.runId)?.path);
  }

  const patch = buildHardcodedSessionPatch(composedRun);
  const committed = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
    now: options.now,
  });

  return renderGuideSiteMvpCliOutput(committed.run, stores.runs.inspect?.(committed.run.runId)?.path);
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
