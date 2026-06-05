import {
  mergeConcernSurfacingResultIntoRetrievalResult,
  validateConcernSurfacingResult,
} from "./concern-surfacing.ts";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";
import type { ConcernSurfacingCatalogEntry, ConcernSurfacingResult } from "./concern-surfacing-types.ts";
import type { RetrievalStrategy } from "./retrieval-strategy.ts";

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
