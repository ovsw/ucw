import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import { createDeterministicWorkbench } from "./deterministic-retrieval.js";
import type { PromptRetrievalResult } from "./deterministic-retrieval.js";

export type { PromptRetrievalResult } from "./deterministic-retrieval.js";

export type RetrievalStrategy = {
  id: string;
  label: string;
  evaluatePrompt(prompt: string): PromptRetrievalResult;
};

export function createDeterministicRetrievalStrategy(
  fixture: ParsedRetrievalWorkbenchFixture,
): RetrievalStrategy {
  const workbench = createDeterministicWorkbench(fixture);

  return {
    id: "deterministic",
    label: "Deterministic",
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      return workbench.evaluatePrompt(prompt);
    },
  };
}
