import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  startGuideSiteRun,
  withProviderBackedUnderstandingAndComposition,
} from "./run-lifecycle.ts";
import type { GuideSiteRetrievalAdapter } from "./fixture-retrieval.ts";
import type { GuideSiteSanityRetrievalAdapterResolver } from "./sanity-retrieval.ts";
import type { GuideSiteStores, RunState } from "./types.ts";
import type { PromptUnderstandingProvider } from "./openai-prompt-understanding.ts";

export interface RunGuideSiteMvpTurnOptions {
  promptText: string;
  stores: GuideSiteStores;
  promptUnderstandingProvider: PromptUnderstandingProvider;
  retrievalAdapter?: GuideSiteRetrievalAdapter;
  sanityRetrievalAdapterResolver?: GuideSiteSanityRetrievalAdapterResolver;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
}

export async function runGuideSiteMvpTurn(options: RunGuideSiteMvpTurnOptions): Promise<RunState> {
  const { promptText, stores, promptUnderstandingProvider, retrievalAdapter, now, createSessionId, createRunId } =
    options;

  const started = startGuideSiteRun({
    promptText,
    stores,
    now,
    createSessionId,
    createRunId,
  });

  const composedRun = await withProviderBackedUnderstandingAndComposition(started.run, promptUnderstandingProvider, {
    now,
    retrievalAdapter,
    sanityRetrievalAdapterResolver: options.sanityRetrievalAdapterResolver,
  });
  const storedRun = stores.runs.update(composedRun);

  if (!storedRun.promptUnderstandingValidation?.valid) {
    return storedRun;
  }

  const answerCompositionStatus = storedRun.answerComposition?.status;
  if (answerCompositionStatus !== "needs_context" && answerCompositionStatus !== "answered") {
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
