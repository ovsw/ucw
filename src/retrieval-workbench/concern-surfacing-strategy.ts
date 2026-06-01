import {
  mergeConcernSurfacingResultIntoRetrievalResult,
  validateConcernSurfacingResult,
} from "./concern-surfacing.js";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import type { ConcernSurfacingCatalogEntry, ConcernSurfacingResult } from "./concern-surfacing-types.js";
import type { RetrievalStrategy } from "./retrieval-strategy.js";

export function createConcernSurfacingRetrievalStrategy(
  fixture: ParsedRetrievalWorkbenchFixture,
  baseStrategy: RetrievalStrategy,
  surfacingResultsByPrompt: Map<string, ConcernSurfacingResult>,
  catalog: ConcernSurfacingCatalogEntry[],
): RetrievalStrategy {
  return {
    id: `${baseStrategy.id}OpenAIConcernSurfacing`,
    label: `${baseStrategy.label} + OpenAI Concern Surfacing`,
    evaluatePrompt(prompt: string) {
      const surfacingResult = surfacingResultsByPrompt.get(prompt);

      if (!surfacingResult) {
        throw new Error(`Missing OpenAI Concern Surfacing result for prompt: ${prompt}`);
      }

      return mergeConcernSurfacingResultIntoRetrievalResult(
        fixture,
        baseStrategy.evaluatePrompt(prompt),
        validateConcernSurfacingResult(surfacingResult, catalog),
      );
    },
  };
}
