import {
  DEFAULT_ANSWER_COMPOSER_TOP_K,
  buildAnswerSourceMaterials,
  validateAnswerComposerTopK,
  type AnswerSourceMaterial,
} from "./answer-source-material.ts";
import type {
  AnswerComposerCitedSource,
  AnswerComposerClaim,
  AnswerComposerDiagnostics,
  AnswerComposerValidatedProviderResult,
} from "./answer-composer-contract.ts";
import type { PromptRetrievalResult } from "./retrieval-strategy.ts";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";
import type { ParentPromptExpectation } from "./types.ts";

export type RetrievalWorkbenchAnswerComposer = "none" | "openai";

export type AnswerCompositionSourceStrategy = {
  id: string;
  label: string;
};

export type AnswerComposerInput = {
  promptId: string;
  parentPrompt: string;
  requiredContentEntityIds: string[];
  requiredSourceOfTruthIds: string[];
  sourceStrategy: AnswerCompositionSourceStrategy;
  sourceMaterials: AnswerSourceMaterial[];
};

export type AnswerComposer = {
  compose(input: AnswerComposerInput): Promise<AnswerComposerValidatedProviderResult>;
};

export type AnswerCompositionCoverageFailure = {
  kind: "requiredContent" | "requiredSourceOfTruth";
  missingIds: string[];
};

export type AnswerCompositionDiagnostics = AnswerComposerDiagnostics & {
  coverageFailures: AnswerCompositionCoverageFailure[];
  citationFailures: string[];
};

export type AnswerCompositionResult = {
  status: "composed" | "unsafe";
  promptId: string;
  parentPrompt: string;
  sourceStrategy: AnswerCompositionSourceStrategy;
  topK: number;
  sourceMaterials: AnswerSourceMaterial[];
  draft: string | null;
  citedSources: AnswerComposerCitedSource[];
  claims: AnswerComposerClaim[];
  diagnostics: AnswerCompositionDiagnostics;
};

export type ComposeAnswerForPromptOptions = {
  fixture: ParsedRetrievalWorkbenchFixture;
  prompt: ParentPromptExpectation;
  retrievalResult: PromptRetrievalResult;
  sourceStrategy: AnswerCompositionSourceStrategy;
  composer: AnswerComposer;
  topK?: number;
};

function findMissingIds(requiredIds: string[], selectedIds: Set<string>): string[] {
  return requiredIds.filter((id) => !selectedIds.has(id));
}

export function checkAnswerCompositionCoverage(
  prompt: ParentPromptExpectation,
  sourceMaterials: AnswerSourceMaterial[],
): AnswerCompositionCoverageFailure[] {
  const selectedSourceIds = new Set(sourceMaterials.map((material) => material.sourceId));
  const missingRequiredContentIds = findMissingIds(prompt.requiredContentEntityIds, selectedSourceIds);
  const missingRequiredSourceOfTruthIds = findMissingIds(prompt.requiredSourceOfTruthIds ?? [], selectedSourceIds);
  const failures: AnswerCompositionCoverageFailure[] = [];

  if (missingRequiredContentIds.length > 0) {
    failures.push({
      kind: "requiredContent",
      missingIds: missingRequiredContentIds,
    });
  }

  if (missingRequiredSourceOfTruthIds.length > 0) {
    failures.push({
      kind: "requiredSourceOfTruth",
      missingIds: missingRequiredSourceOfTruthIds,
    });
  }

  return failures;
}

function formatMissingSourceOfTruthDiagnostics(
  topK: number,
  failures: AnswerCompositionCoverageFailure[],
): string[] {
  return failures
    .filter((failure) => failure.kind === "requiredSourceOfTruth")
    .map(
      (failure) =>
        `Missing required source-of-truth Content Entities in top ${topK}: ${failure.missingIds.join(", ")}`,
    );
}

function buildUnsafeResult(
  prompt: ParentPromptExpectation,
  sourceStrategy: AnswerCompositionSourceStrategy,
  topK: number,
  sourceMaterials: AnswerSourceMaterial[],
  coverageFailures: AnswerCompositionCoverageFailure[],
): AnswerCompositionResult {
  return {
    status: "unsafe",
    promptId: prompt._id,
    parentPrompt: prompt.prompt,
    sourceStrategy,
    topK,
    sourceMaterials,
    draft: null,
    citedSources: [],
    claims: [],
    diagnostics: {
      coverageFailures,
      citationFailures: [],
      unsupportedClaims: [],
      missingSourceOfTruth: formatMissingSourceOfTruthDiagnostics(topK, coverageFailures),
      followUpQuestions: [],
    },
  };
}

function buildComposedResult(
  prompt: ParentPromptExpectation,
  sourceStrategy: AnswerCompositionSourceStrategy,
  topK: number,
  sourceMaterials: AnswerSourceMaterial[],
  providerResult: AnswerComposerValidatedProviderResult,
): AnswerCompositionResult {
  return {
    status: providerResult.status,
    promptId: prompt._id,
    parentPrompt: prompt.prompt,
    sourceStrategy,
    topK,
    sourceMaterials,
    draft: providerResult.draft,
    citedSources: providerResult.citedSources,
    claims: providerResult.claims,
    diagnostics: {
      ...providerResult.diagnostics,
      coverageFailures: [],
      citationFailures: providerResult.citationDiagnostics ?? [],
    },
  };
}

function buildUnsafeProviderDiagnosticResult(
  prompt: ParentPromptExpectation,
  sourceStrategy: AnswerCompositionSourceStrategy,
  topK: number,
  sourceMaterials: AnswerSourceMaterial[],
  providerResult: AnswerComposerValidatedProviderResult,
): AnswerCompositionResult {
  return {
    status: "unsafe",
    promptId: prompt._id,
    parentPrompt: prompt.prompt,
    sourceStrategy,
    topK,
    sourceMaterials,
    draft: null,
    citedSources: [],
    claims: [],
    diagnostics: {
      ...providerResult.diagnostics,
      coverageFailures: [],
      citationFailures: providerResult.citationDiagnostics ?? [],
    },
  };
}

export async function composeAnswerForPrompt({
  fixture,
  prompt,
  retrievalResult,
  sourceStrategy,
  composer,
  topK = DEFAULT_ANSWER_COMPOSER_TOP_K,
}: ComposeAnswerForPromptOptions): Promise<AnswerCompositionResult> {
  const normalizedTopK = validateAnswerComposerTopK(topK);
  const sourceMaterials = buildAnswerSourceMaterials(fixture, retrievalResult, normalizedTopK);
  const coverageFailures = checkAnswerCompositionCoverage(prompt, sourceMaterials);

  if (coverageFailures.length > 0) {
    return buildUnsafeResult(prompt, sourceStrategy, normalizedTopK, sourceMaterials, coverageFailures);
  }

  const providerResult = await composer.compose({
    promptId: prompt._id,
    parentPrompt: prompt.prompt,
    requiredContentEntityIds: prompt.requiredContentEntityIds,
    requiredSourceOfTruthIds: prompt.requiredSourceOfTruthIds ?? [],
    sourceStrategy,
    sourceMaterials,
  });

  if (providerResult.diagnostics.missingSourceOfTruth.length > 0) {
    return buildUnsafeProviderDiagnosticResult(prompt, sourceStrategy, normalizedTopK, sourceMaterials, providerResult);
  }

  return buildComposedResult(prompt, sourceStrategy, normalizedTopK, sourceMaterials, providerResult);
}
