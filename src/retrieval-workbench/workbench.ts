import { resolve } from "node:path";
import { loadFixture } from "./load-fixture.js";
import { summarizeFixture } from "./fixture-summary.js";
import { readSanityQueryConfig, type SanityConfigEnv, type SanityQueryConfig } from "./sanity-config.js";
import { printFixtureValidationError } from "./fixture-errors.js";
import { createDeterministicRetrievalStrategy } from "./retrieval-strategy.js";
import { renderRetrievalWorkbenchReport } from "./report.js";
import { buildSanityHybridQueryPlan, buildSanityKeywordQueryPlan, createSanityRetrievalStrategyFromResults } from "./sanity-retrieval.js";
import { executeSanityRetrievalQueryPlan, verifySanityFixtureParity } from "./sanity-client.js";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import type { RetrievalStrategy } from "./retrieval-strategy.js";

export type RetrievalWorkbenchRunMode = "deterministic-only" | "comparison";

export type RetrievalWorkbenchRunOptions = {
  fixturePath?: string;
  deterministicOnly?: boolean;
  env?: SanityConfigEnv;
  fetchImpl?: typeof fetch;
};

export type RetrievalWorkbenchRunResult = {
  fixturePath: string;
  mode: RetrievalWorkbenchRunMode;
  summaryLines: string[];
  report: string;
};

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
): Promise<RetrievalStrategy[]> {
  const keywordResults = new Map<string, Awaited<ReturnType<typeof executeSanityRetrievalQueryPlan>>>();
  const hybridResults = new Map<string, Awaited<ReturnType<typeof executeSanityRetrievalQueryPlan>>>();

  await Promise.all(
    fixture.goldSet.map(async (prompt) => {
      const [keywordResult, hybridResult] = await Promise.all([
        executeSanityRetrievalQueryPlan(buildSanityKeywordQueryPlan(prompt.prompt), config, fetchImpl),
        executeSanityRetrievalQueryPlan(buildSanityHybridQueryPlan(prompt.prompt), config, fetchImpl),
      ]);

      keywordResults.set(prompt.prompt, keywordResult);
      hybridResults.set(prompt.prompt, hybridResult);
    }),
  );

  return [
    createDeterministicRetrievalStrategy(fixture),
    createSanityRetrievalStrategyFromResults("sanityKeyword", "Sanity Keyword", keywordResults),
    createSanityRetrievalStrategyFromResults("sanityHybrid", "Sanity Hybrid", hybridResults),
  ];
}

export async function runRetrievalWorkbench(
  options: RetrievalWorkbenchRunOptions = {},
): Promise<RetrievalWorkbenchRunResult> {
  const fixturePath = resolve(options.fixturePath ?? "fixtures/retrieval-workbench/seed.json");
  const fixture = await loadFixture(fixturePath);
  const summaryLines = formatSummaryLines(fixture, fixturePath);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (options.deterministicOnly) {
    return {
      fixturePath,
      mode: "deterministic-only",
      summaryLines: [...summaryLines, "", "Workbench mode: deterministic-only"],
      report: renderRetrievalWorkbenchReport(fixture, [createDeterministicRetrievalStrategy(fixture)]),
    };
  }

  const config = readSanityQueryConfig(options.env);
  const parity = await verifySanityFixtureParity(fixture, config, fetchImpl);

  if (!parity.isExactMatch) {
    throw new Error(`Sanity fixture parity check failed: ${formatParityFailure(parity)}`);
  }

  const strategies = await buildSanityComparisonStrategies(fixture, config, fetchImpl);

  return {
    fixturePath,
    mode: "comparison",
    summaryLines,
    report: renderRetrievalWorkbenchReport(fixture, strategies),
  };
}

export function printRetrievalWorkbenchFailure(error: unknown): void {
  printFixtureValidationError("Retrieval workbench comparison failed", error);
}
