import { resolve } from "node:path";
import { buildApprovedConcernCatalog } from "./concern-surfacing.ts";
import { createConcernSurfacingRetrievalStrategy } from "./concern-surfacing-strategy.ts";
import { loadFixture } from "./load-fixture.ts";
import { summarizeFixture } from "./fixture-summary.ts";
import { readSanityQueryConfig, type SanityConfigEnv, type SanityQueryConfig } from "./sanity-config.ts";
import {
  createOpenAIConcernSurfacer,
  readOpenAIConcernSurfacerConfig,
  type OpenAIConcernSurfacerEnv,
} from "./openai-concern-surfacer.ts";
import { DEFAULT_ANSWER_COMPOSER_TOP_K, validateAnswerComposerTopK } from "./answer-source-material.ts";
import {
  composeAnswerForPrompt,
  type AnswerCompositionResult,
  type RetrievalWorkbenchAnswerComposer,
} from "./answer-composition.ts";
import {
  createOpenAIAnswerComposer,
  readOpenAIAnswerComposerConfig,
  type OpenAIAnswerComposerEnv,
} from "./openai-answer-composer.ts";
import { printFixtureValidationError } from "./fixture-errors.ts";
import { createPlannedRetrievalStrategy } from "./planned-retrieval-strategy.ts";
import { createPrototypeRetrievalPlanner } from "./retrieval-planner.ts";
import { createDeterministicRetrievalStrategy } from "./retrieval-strategy.ts";
import { renderRetrievalWorkbenchReport } from "./report.ts";
import {
  buildSanityHybridQueryPlan,
  buildSanityKeywordQueryPlan,
  createSanityRetrievalStrategyFromResults,
  type SanityRetrievalQueryResult,
} from "./sanity-retrieval.ts";
import { executeSanityRetrievalQueryPlan, verifySanityFixtureParity } from "./sanity-client.ts";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";
import type { ConcernSurfacer, ConcernSurfacingResult } from "./concern-surfacing-types.ts";
import type { RetrievalStrategy } from "./retrieval-strategy.ts";

export type RetrievalWorkbenchRunMode = "deterministic-only" | "comparison";
export type RetrievalWorkbenchConcernSurfacer = "none" | "openai";
export type RetrievalWorkbenchEnv = SanityConfigEnv & OpenAIConcernSurfacerEnv & OpenAIAnswerComposerEnv;

export type RetrievalWorkbenchRunOptions = {
  fixturePath?: string;
  deterministicOnly?: boolean;
  concernSurfacer?: RetrievalWorkbenchConcernSurfacer;
  answerComposer?: RetrievalWorkbenchAnswerComposer;
  answerComposerTopK?: number;
  env?: RetrievalWorkbenchEnv;
  fetchImpl?: typeof fetch;
};

export type RetrievalWorkbenchRunResult = {
  fixturePath: string;
  mode: RetrievalWorkbenchRunMode;
  summaryLines: string[];
  report: string;
  answerCompositionResults?: AnswerCompositionResult[];
};

type SanityResultsByPrompt = Map<string, SanityRetrievalQueryResult>;

function formatSummaryLines(fixture: ParsedRetrievalWorkbenchFixture, fixturePath: string): string[] {
  const { concernCount, nonConcernCount, contentEntityTypes } = summarizeFixture(fixture);

  return [
    "Retrieval workbench fixture loaded",
    `Fixture: ${fixturePath}`,
    `Concerns: ${concernCount}`,
    `Non-Concern Content Entities: ${nonConcernCount}`,
    `Gold-set Parent Prompts: ${fixture.goldSet.length}`,
    `Content Entity types: ${contentEntityTypes.join(", ")}`,
  ];
}

function formatParityFailure(parity: Awaited<ReturnType<typeof verifySanityFixtureParity>>): string {
  const parts: string[] = [];

  if (parity.missingDocumentIds.length > 0) {
    parts.push(`Missing documents: ${parity.missingDocumentIds.join(", ")}`);
  }

  if (parity.extraDocumentIds.length > 0) {
    parts.push(`Extra documents: ${parity.extraDocumentIds.join(", ")}`);
  }

  if (parity.typeMismatches.length > 0) {
    parts.push(
      `Type mismatches: ${parity.typeMismatches
        .map((mismatch) => `${mismatch.id} expected ${mismatch.expectedType} but found ${mismatch.actualType}`)
        .join(", ")}`,
    );
  }

  return parts.length > 0 ? parts.join("; ") : "Sanity fixture parity check failed.";
}

async function buildSanityComparisonStrategies(
  fixture: ParsedRetrievalWorkbenchFixture,
  config: SanityQueryConfig,
  fetchImpl: typeof fetch,
  concernSurfacer?: ConcernSurfacer,
): Promise<RetrievalStrategy[]> {
  const retrievalPlanner = createPrototypeRetrievalPlanner();
  const keywordResults: SanityResultsByPrompt = new Map();
  const hybridResults: SanityResultsByPrompt = new Map();

  await Promise.all(
    fixture.goldSet.map(async ({ prompt }) => {
      const [keywordResult, hybridResult] = await Promise.all([
        executeSanityRetrievalQueryPlan(buildSanityKeywordQueryPlan(prompt), config, fetchImpl),
        executeSanityRetrievalQueryPlan(buildSanityHybridQueryPlan(prompt), config, fetchImpl),
      ]);

      keywordResults.set(prompt, keywordResult);
      hybridResults.set(prompt, hybridResult);
    }),
  );

  const plannedHybridQueries = new Set<string>();
  for (const { prompt } of fixture.goldSet) {
    for (const query of retrievalPlanner.planPrompt(prompt).queries) {
      plannedHybridQueries.add(query.searchText);
    }
  }

  await Promise.all(
    [...plannedHybridQueries]
      .filter((searchText) => !hybridResults.has(searchText))
      .map(async (searchText) => {
        hybridResults.set(
          searchText,
          await executeSanityRetrievalQueryPlan(buildSanityHybridQueryPlan(searchText), config, fetchImpl),
        );
      }),
  );

  const sanityHybridStrategy = createSanityRetrievalStrategyFromResults(
    "sanityHybrid",
    "Sanity Hybrid",
    hybridResults,
  );
  const strategies: RetrievalStrategy[] = [
    createDeterministicRetrievalStrategy(fixture),
    createSanityRetrievalStrategyFromResults("sanityKeyword", "Sanity Keyword", keywordResults),
    sanityHybridStrategy,
    createPlannedRetrievalStrategy(sanityHybridStrategy, retrievalPlanner),
  ];

  if (concernSurfacer) {
    const catalog = buildApprovedConcernCatalog(fixture);
    const surfacingResultsByPrompt = new Map<string, ConcernSurfacingResult>();

    await Promise.all(
      fixture.goldSet.map(async ({ prompt }) => {
        surfacingResultsByPrompt.set(prompt, await concernSurfacer.surfaceConcerns(prompt, catalog));
      }),
    );

    strategies.push(
      createConcernSurfacingRetrievalStrategy(
        fixture,
        sanityHybridStrategy,
        surfacingResultsByPrompt,
        catalog,
      ),
    );
  }

  return strategies;
}

function selectAnswerComposerSourceStrategy(
  strategies: RetrievalStrategy[],
  concernSurfacerSelection: RetrievalWorkbenchConcernSurfacer,
): RetrievalStrategy {
  const strategyId =
    concernSurfacerSelection === "openai" ? "sanityHybridOpenAIConcernSurfacing" : "sanityHybrid";
  const strategy = strategies.find((candidate) => candidate.id === strategyId);

  if (!strategy) {
    throw new Error(`Answer Composer source strategy was not available: ${strategyId}`);
  }

  return strategy;
}

export async function runRetrievalWorkbench(
  options: RetrievalWorkbenchRunOptions = {},
): Promise<RetrievalWorkbenchRunResult> {
  const fixturePath = resolve(options.fixturePath ?? "fixtures/retrieval-workbench/seed.json");
  const fixture = await loadFixture(fixturePath);
  const summaryLines = formatSummaryLines(fixture, fixturePath);
  const fetchImpl = options.fetchImpl ?? fetch;
  const concernSurfacerSelection = options.concernSurfacer ?? "none";
  const answerComposerSelection = options.answerComposer ?? "none";

  if (options.deterministicOnly) {
    if (concernSurfacerSelection === "openai") {
      throw new Error("OpenAI Concern Surfacing requires comparison mode; remove --deterministic-only.");
    }

    if (answerComposerSelection === "openai") {
      throw new Error("OpenAI Answer Composer requires comparison mode; remove --deterministic-only.");
    }

    return {
      fixturePath,
      mode: "deterministic-only",
      summaryLines: [...summaryLines, "", "Workbench mode: deterministic-only"],
      report: renderRetrievalWorkbenchReport(fixture, [createDeterministicRetrievalStrategy(fixture)]),
    };
  }

  const concernSurfacer =
    concernSurfacerSelection === "openai"
      ? createOpenAIConcernSurfacer(readOpenAIConcernSurfacerConfig(options.env), fetchImpl)
      : undefined;
  const answerComposer =
    answerComposerSelection === "openai"
      ? createOpenAIAnswerComposer(readOpenAIAnswerComposerConfig(options.env), fetchImpl)
      : undefined;
  const answerComposerTopK =
    answerComposerSelection === "openai"
      ? validateAnswerComposerTopK(options.answerComposerTopK ?? DEFAULT_ANSWER_COMPOSER_TOP_K)
      : undefined;
  const config = readSanityQueryConfig(options.env);
  const parity = await verifySanityFixtureParity(fixture, config, fetchImpl);

  if (!parity.isExactMatch) {
    throw new Error(`Sanity fixture parity check failed: ${formatParityFailure(parity)}`);
  }

  const strategies = await buildSanityComparisonStrategies(fixture, config, fetchImpl, concernSurfacer);
  const answerCompositionResults = answerComposer
    ? await Promise.all(
        fixture.goldSet.map((prompt) => {
          const strategy = selectAnswerComposerSourceStrategy(strategies, concernSurfacerSelection);

          return composeAnswerForPrompt({
            fixture,
            prompt,
            retrievalResult: strategy.evaluatePrompt(prompt.prompt),
            sourceStrategy: {
              id: strategy.id,
              label: strategy.label,
            },
            topK: answerComposerTopK,
            composer: answerComposer,
          });
        }),
      )
    : undefined;

  return {
    fixturePath,
    mode: "comparison",
    summaryLines,
    report: renderRetrievalWorkbenchReport(fixture, strategies, answerCompositionResults),
    answerCompositionResults,
  };
}

export function printRetrievalWorkbenchFailure(error: unknown): void {
  printFixtureValidationError("Retrieval workbench comparison failed", error);
}
