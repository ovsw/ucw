import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  startGuideSiteRun,
  withProviderBackedUnderstandingAndComposition,
} from "./run-lifecycle.js";
import type { GuideSiteStores, RunState } from "./types.js";
import type { PromptUnderstandingProvider } from "./openai-prompt-understanding.js";

export interface RunGuideSiteMvpTurnOptions {
  promptText: string;
  stores: GuideSiteStores;
  promptUnderstandingProvider: PromptUnderstandingProvider;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
}

export async function runGuideSiteMvpTurn(options: RunGuideSiteMvpTurnOptions): Promise<RunState> {
  const started = startGuideSiteRun({
    promptText: options.promptText,
    stores: options.stores,
    now: options.now,
    createSessionId: options.createSessionId,
    createRunId: options.createRunId,
  });

  const composedRun = await withProviderBackedUnderstandingAndComposition(started.run, options.promptUnderstandingProvider, {
    now: options.now,
  });
  const storedRun = options.stores.runs.update(composedRun);

  if (storedRun.answerComposition?.status !== "needs_context") {
    return storedRun;
  }

  const patch = buildHardcodedSessionPatch(storedRun);
  const committed = commitSessionPatch({
    stores: options.stores,
    run: storedRun,
    patch,
    now: options.now,
  });

  return committed.run;
}
