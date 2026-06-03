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
  const { promptText, stores, promptUnderstandingProvider, now, createSessionId, createRunId } = options;

  const started = startGuideSiteRun({
    promptText,
    stores,
    now,
    createSessionId,
    createRunId,
  });

  const composedRun = await withProviderBackedUnderstandingAndComposition(started.run, promptUnderstandingProvider, {
    now,
  });
  const storedRun = stores.runs.update(composedRun);

  if (storedRun.answerComposition?.status !== "needs_context") {
    return storedRun;
  }

  const patch = buildHardcodedSessionPatch(storedRun);
  const committed = commitSessionPatch({
    stores,
    run: storedRun,
    patch,
    now,
  });

  return committed.run;
}
