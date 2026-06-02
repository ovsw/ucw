import { createDeterministicRetrievalStrategy } from "./retrieval-strategy.js";
import {
  buildApprovedConcernCatalog,
  formatMissingConcernCandidateForReport,
  formatSurfacedConcernForReport,
} from "./concern-surfacing.js";
import type {
  FieldMatchReason,
  PromptRetrievalResult,
  RankedConcernMatch,
  RankedContentEntityMatch,
} from "./deterministic-retrieval.js";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import { summarizeFixture } from "./fixture-summary.js";
import type { ParentPromptExpectation } from "./types.js";
import type { RetrievalStrategy } from "./retrieval-strategy.js";
import type { AnswerCompositionCoverageFailure, AnswerCompositionResult } from "./answer-composition.js";
import type { AnswerSourceSnippet } from "./answer-source-material.js";

type Hit = {
  id: string;
  rank: number;
  title: string;
};

type PromptReportSummary = {
  promptId: string;
  missingExpectedConcernIds: string[];
  missingRequiredContentEntityIds: string[];
  requiredContentEntityHits: Hit[];
};

type CorpusLookup = {
  titlesById: Map<string, string>;
  concernCatalog: ReturnType<typeof buildApprovedConcernCatalog>;
};

type StrategyReport = {
  strategy: RetrievalStrategy;
  lines: string[];
  summaries: PromptReportSummary[];
  requiredRanksByPrompt: Map<string, Map<string, number>>;
};

type StrategyAggregateSummary = {
  missingExpectedConcernCount: number;
  missingRequiredContentCount: number;
  requiredContentExpectationCount: number;
  requiredContentHitCount: number;
  topFiveRequiredContentHitCount: number;
  topTenRequiredContentHitCount: number;
  averageRequiredContentRank: number | null;
  improvementCount: number | null;
  regressionCount: number | null;
  tieCount: number | null;
};

type StrategySummaryContext = {
  baselineReport: StrategyReport | null;
  comparisonStrategy: RetrievalStrategy | null;
};

type ConcernSurfacingImpact = {
  changedTopSourcePromptIds: string[];
  requiredRankImprovements: number;
  requiredRankRegressions: number;
  requiredRankTies: number;
};

type RankUsefulness = "usable" | "diagnostic" | "weak";

const USABLE_RANK_THRESHOLD = 5;
const DIAGNOSTIC_RANK_THRESHOLD = 10;

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatRank(rank: number | null): string {
  return rank === null ? "n/a" : rank.toFixed(2);
}

function classifyRank(rank: number): RankUsefulness {
  if (rank <= USABLE_RANK_THRESHOLD) {
    return "usable";
  }

  if (rank <= DIAGNOSTIC_RANK_THRESHOLD) {
    return "diagnostic";
  }

  return "weak";
}

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function formatRankBandSummary(hits: Hit[], expectedCount: number, missingCount: number): string {
  const rankBandCounts: Record<RankUsefulness, number> = {
    usable: 0,
    diagnostic: 0,
    weak: 0,
  };

  for (const hit of hits) {
    rankBandCounts[classifyRank(hit.rank)] += 1;
  }

  return `usable: ${rankBandCounts.usable}/${expectedCount}, diagnostic: ${rankBandCounts.diagnostic}/${expectedCount}, weak: ${rankBandCounts.weak}/${expectedCount}, missing: ${missingCount}`;
}

function formatExpected(ids: string[], lookup: CorpusLookup): string {
  return formatList(ids.map((id) => `${lookup.titlesById.get(id) ?? id} [${id}]`));
}

function buildLookup(fixture: ParsedRetrievalWorkbenchFixture): CorpusLookup {
  const titlesById = new Map<string, string>();

  for (const document of fixture.documents) {
    titlesById.set(document._id, document.title);
  }

  return { titlesById, concernCatalog: buildApprovedConcernCatalog(fixture) };
}

function findHits(ids: string[], matches: Array<{ _id: string; rank: number; title: string }>): Hit[] {
  const idsToFind = new Set(ids);
  return matches
    .filter((match) => idsToFind.has(match._id))
    .map((match) => ({
      id: match._id,
      rank: match.rank,
      title: match.title,
    }));
}

function findMissing(ids: string[], matches: Array<{ _id: string }>): string[] {
  const matchedIds = new Set(matches.map((match) => match._id));
  return ids.filter((id) => !matchedIds.has(id));
}

function formatFieldReason(reason: FieldMatchReason): string {
  return `${reason.field}:${reason.matchedTerms.join("+")} x${reason.fieldBoost}`;
}

function formatConcernReasons(match: RankedConcernMatch): string {
  const reasons = match.reasons.map(formatFieldReason);
  return reasons.length === 0 ? "no field reasons" : reasons.join("; ");
}

function formatEntityReasons(match: RankedContentEntityMatch): string {
  const reasons = match.reasons.map((reason) => {
    if (reason.kind === "fieldMatch") {
      return formatFieldReason(reason);
    }

    return `relatedConcern:${reason.concernTitle} +${formatScore(reason.scoreContribution)}`;
  });

  return reasons.length === 0 ? "no reasons" : reasons.join("; ");
}

function formatSources(match: RankedContentEntityMatch): string {
  return match.sources
    .map((source) => {
      if (source.kind === "direct") {
        return `direct #${source.rank}`;
      }

      return `concern #${source.rank} ${source.concernTitle}`;
    })
    .join(", ");
}

function renderConcernMatches(matches: RankedConcernMatch[]): string[] {
  if (matches.length === 0) {
    return ["- none"];
  }

  return matches.slice(0, 5).map((match) => {
    return `- #${match.rank} ${match.title} [${match._id}] score ${formatScore(match.score)}; fields ${formatConcernReasons(
      match,
    )}`;
  });
}

function renderEntityMatches(matches: RankedContentEntityMatch[], limit: number): string[] {
  if (matches.length === 0) {
    return ["- none"];
  }

  return matches.slice(0, limit).map((match) => {
    return `- #${match.rank} ${match.title} [${match._id}] score ${formatScore(match.score)}; via ${formatSources(
      match,
    )}; reasons ${formatEntityReasons(match)}`;
  });
}

function renderHits(hits: Hit[]): string {
  if (hits.length === 0) {
    return "none";
  }

  return hits.map((hit) => `${hit.title} [${hit.id}] at #${hit.rank} (${classifyRank(hit.rank)})`).join("; ");
}

function renderRetrievalPlan(result: PromptRetrievalResult): string[] {
  if (!result.retrievalPlan) {
    return [];
  }

  const lines = ["Retrieval plan:"];

  for (const need of result.retrievalPlan.needs) {
    const queries = result.retrievalPlan.queries
      .filter((query) => query.needId === need.id)
      .map((query) => query.searchText);

    lines.push(`- ${need.kind}: ${need.description}; queries: ${formatList(queries)}`);
  }

  return lines;
}

function renderConcernSurfacing(result: PromptRetrievalResult, lookup: CorpusLookup): string[] {
  if (!result.concernSurfacing) {
    return [];
  }

  const lines = ["Concern surfacing:"];

  lines.push("Surfaced approved concerns:");
  if (result.concernSurfacing.surfacedConcerns.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...result.concernSurfacing.surfacedConcerns.map((concern) =>
        `- ${formatSurfacedConcernForReport(concern, lookup.concernCatalog)}`,
      ),
    );
  }

  lines.push("Missing Concern candidates:");
  if (result.concernSurfacing.missingConcernCandidates.length === 0) {
    lines.push("- none");
  } else {
    lines.push(
      ...result.concernSurfacing.missingConcernCandidates.map((candidate) =>
        `- ${formatMissingConcernCandidateForReport(candidate)}`,
      ),
    );
  }

  return lines;
}

function findDistractors(
  prompt: ParentPromptExpectation,
  result: PromptRetrievalResult,
): RankedContentEntityMatch[] {
  const expectedIds = new Set([
    ...prompt.requiredContentEntityIds,
    ...(prompt.supportingContentEntityIds ?? []),
    ...(prompt.requiredSourceOfTruthIds ?? []),
  ]);

  return result.mergedContentEntities.filter((match) => !expectedIds.has(match._id)).slice(0, 3);
}

function hasWeakRequiredContentRanks(summary: PromptReportSummary, weakRankThreshold: number): boolean {
  return summary.requiredContentEntityHits.some((hit) => hit.rank > weakRankThreshold);
}

function shouldSurfaceEvaluationNotes(
  prompt: ParentPromptExpectation,
  summary: PromptReportSummary,
  weakRankThreshold: number,
): boolean {
  if ((prompt.evaluationNotes?.length ?? 0) === 0) {
    return false;
  }

  return (
    summary.missingExpectedConcernIds.length > 0 ||
    summary.missingRequiredContentEntityIds.length > 0 ||
    hasWeakRequiredContentRanks(summary, weakRankThreshold)
  );
}

function summarizePrompt(
  prompt: ParentPromptExpectation,
  result: PromptRetrievalResult,
): PromptReportSummary {
  return {
    promptId: prompt._id,
    missingExpectedConcernIds: findMissing(prompt.expectedConcernIds, result.matchedConcerns),
    missingRequiredContentEntityIds: findMissing(prompt.requiredContentEntityIds, result.mergedContentEntities),
    requiredContentEntityHits: findHits(prompt.requiredContentEntityIds, result.mergedContentEntities),
  };
}

function buildStrategyAggregateSummary(
  fixture: ParsedRetrievalWorkbenchFixture,
  strategyReport: StrategyReport,
  baselineReport: StrategyReport | null,
): StrategyAggregateSummary {
  const missingExpectedConcernCount = strategyReport.summaries.reduce(
    (total, summary) => total + summary.missingExpectedConcernIds.length,
    0,
  );
  const missingRequiredContentCount = strategyReport.summaries.reduce(
    (total, summary) => total + summary.missingRequiredContentEntityIds.length,
    0,
  );
  const requiredContentExpectationCount = fixture.goldSet.reduce(
    (total, prompt) => total + prompt.requiredContentEntityIds.length,
    0,
  );
  const requiredContentHits = strategyReport.summaries.flatMap((summary) => summary.requiredContentEntityHits);
  const topFiveRequiredContentHitCount = requiredContentHits.filter((hit) => hit.rank <= 5).length;
  const topTenRequiredContentHitCount = requiredContentHits.filter((hit) => hit.rank <= 10).length;
  const averageRequiredContentRank =
    requiredContentHits.length === 0
      ? null
      : requiredContentHits.reduce((total, hit) => total + hit.rank, 0) / requiredContentHits.length;
  const requiredContentHitCount = requiredContentHits.length;

  if (!baselineReport || baselineReport.strategy.id === strategyReport.strategy.id) {
    return {
      missingExpectedConcernCount,
      missingRequiredContentCount,
      requiredContentExpectationCount,
      requiredContentHitCount,
      topFiveRequiredContentHitCount,
      topTenRequiredContentHitCount,
      averageRequiredContentRank,
      improvementCount: null,
      regressionCount: null,
      tieCount: null,
    };
  }

  let improvementCount = 0;
  let regressionCount = 0;
  let tieCount = 0;

  for (const prompt of fixture.goldSet) {
    const baselineRanks = baselineReport.requiredRanksByPrompt.get(prompt._id) ?? new Map<string, number>();
    const currentRanks = strategyReport.requiredRanksByPrompt.get(prompt._id) ?? new Map<string, number>();

    for (const requiredContentEntityId of prompt.requiredContentEntityIds) {
      const baselineRank = baselineRanks.get(requiredContentEntityId);
      const currentRank = currentRanks.get(requiredContentEntityId);

      if (baselineRank === undefined || currentRank === undefined) {
        if (baselineRank === undefined && currentRank === undefined) {
          tieCount += 1;
        } else if (baselineRank === undefined) {
          improvementCount += 1;
        } else {
          regressionCount += 1;
        }

        continue;
      }

      if (currentRank < baselineRank) {
        improvementCount += 1;
      } else if (currentRank > baselineRank) {
        regressionCount += 1;
      } else {
        tieCount += 1;
      }
    }
  }

  return {
    missingExpectedConcernCount,
    missingRequiredContentCount,
    requiredContentExpectationCount,
    requiredContentHitCount,
    topFiveRequiredContentHitCount,
    topTenRequiredContentHitCount,
    averageRequiredContentRank,
    improvementCount,
    regressionCount,
    tieCount,
  };
}

function renderStrategySummaryLine(
  strategy: RetrievalStrategy,
  aggregate: StrategyAggregateSummary,
  comparisonStrategy: RetrievalStrategy | null,
): string {
  const summaryParts = [
    `missing expected concerns: ${aggregate.missingExpectedConcernCount}`,
    `missing required content: ${aggregate.missingRequiredContentCount}`,
    `top 5 required content hits: ${aggregate.topFiveRequiredContentHitCount}/${aggregate.requiredContentExpectationCount}`,
    `top 10 required content hits: ${aggregate.topTenRequiredContentHitCount}/${aggregate.requiredContentExpectationCount}`,
    `weak required content hits: ${aggregate.requiredContentHitCount - aggregate.topTenRequiredContentHitCount}/${aggregate.requiredContentExpectationCount}`,
    `average required rank: ${formatRank(aggregate.averageRequiredContentRank)}`,
  ];

  if (comparisonStrategy && comparisonStrategy.id !== strategy.id) {
    summaryParts.push(`improvements: ${aggregate.improvementCount ?? 0}`);
    summaryParts.push(`regressions: ${aggregate.regressionCount ?? 0}`);
    summaryParts.push(`ties: ${aggregate.tieCount ?? 0}`);
  }

  const comparisonLabel =
    comparisonStrategy && comparisonStrategy.id !== strategy.id ? ` vs ${comparisonStrategy.label}` : " (baseline)";

  return `- ${strategy.label}${comparisonLabel}: ${summaryParts.join(", ")}`;
}

function topSourceIds(strategy: RetrievalStrategy, prompt: ParentPromptExpectation, topK: number): string[] {
  return strategy
    .evaluatePrompt(prompt.prompt)
    .mergedContentEntities.slice(0, topK)
    .map((match) => match._id);
}

function sameSourceIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function buildConcernSurfacingImpact(
  fixture: ParsedRetrievalWorkbenchFixture,
  baseReport: StrategyReport,
  concernSurfacingReport: StrategyReport,
): ConcernSurfacingImpact {
  const changedTopSourcePromptIds: string[] = [];
  let requiredRankImprovements = 0;
  let requiredRankRegressions = 0;
  let requiredRankTies = 0;

  for (const prompt of fixture.goldSet) {
    const baseTopSourceIds = topSourceIds(baseReport.strategy, prompt, USABLE_RANK_THRESHOLD);
    const concernSurfacingTopSourceIds = topSourceIds(
      concernSurfacingReport.strategy,
      prompt,
      USABLE_RANK_THRESHOLD,
    );

    if (!sameSourceIds(baseTopSourceIds, concernSurfacingTopSourceIds)) {
      changedTopSourcePromptIds.push(prompt._id);
    }

    const baseRanks = baseReport.requiredRanksByPrompt.get(prompt._id) ?? new Map<string, number>();
    const concernSurfacingRanks = concernSurfacingReport.requiredRanksByPrompt.get(prompt._id) ?? new Map<string, number>();

    for (const requiredContentEntityId of prompt.requiredContentEntityIds) {
      const baseRank = baseRanks.get(requiredContentEntityId);
      const concernSurfacingRank = concernSurfacingRanks.get(requiredContentEntityId);

      if (baseRank === undefined || concernSurfacingRank === undefined) {
        if (baseRank === undefined && concernSurfacingRank === undefined) {
          requiredRankTies += 1;
        } else if (baseRank === undefined) {
          requiredRankImprovements += 1;
        } else {
          requiredRankRegressions += 1;
        }

        continue;
      }

      if (concernSurfacingRank < baseRank) {
        requiredRankImprovements += 1;
      } else if (concernSurfacingRank > baseRank) {
        requiredRankRegressions += 1;
      } else {
        requiredRankTies += 1;
      }
    }
  }

  return {
    changedTopSourcePromptIds,
    requiredRankImprovements,
    requiredRankRegressions,
    requiredRankTies,
  };
}

function renderConcernSurfacingSourceSelectionImpact(
  fixture: ParsedRetrievalWorkbenchFixture,
  strategyReports: StrategyReport[],
): string[] {
  const baseReport = strategyReports.find((strategyReport) => strategyReport.strategy.id === "sanityHybrid");
  const concernSurfacingReport = strategyReports.find(
    (strategyReport) => strategyReport.strategy.id === "sanityHybridOpenAIConcernSurfacing",
  );

  if (!baseReport || !concernSurfacingReport) {
    return [];
  }

  const impact = buildConcernSurfacingImpact(fixture, baseReport, concernSurfacingReport);
  const lines = ["Concern Surfacing source-selection impact:"];

  lines.push(
    `- ${concernSurfacingReport.strategy.label} vs ${baseReport.strategy.label} (top ${USABLE_RANK_THRESHOLD}): changed prompt source sets: ${impact.changedTopSourcePromptIds.length}/${fixture.goldSet.length}, required rank improvements: ${impact.requiredRankImprovements}, regressions: ${impact.requiredRankRegressions}, ties: ${impact.requiredRankTies}`,
  );
  lines.push(`- Prompts with changed top ${USABLE_RANK_THRESHOLD} sources: ${formatList(impact.changedTopSourcePromptIds)}`);

  if (impact.changedTopSourcePromptIds.length === 0 && impact.requiredRankImprovements === 0) {
    lines.push(
      "- No source-selection improvement observed; treat OpenAI Concern Surfacing as diagnostic until evaluation fixtures show source-selection gains.",
    );
  }

  lines.push("");

  return lines;
}

function renderPromptReport(
  prompt: ParentPromptExpectation,
  result: PromptRetrievalResult,
  lookup: CorpusLookup,
): { lines: string[]; summary: PromptReportSummary } {
  const lines: string[] = [];
  const summary = summarizePrompt(prompt, result);
  const expectedConcernHits = findHits(prompt.expectedConcernIds, result.matchedConcerns);
  const supportingHits = findHits(prompt.supportingContentEntityIds ?? [], result.mergedContentEntities);
  const sourceOfTruthHits = findHits(prompt.requiredSourceOfTruthIds ?? [], result.mergedContentEntities);
  const distractors = findDistractors(prompt, result);

  lines.push(`## ${prompt._id}`);
  lines.push(`Parent Prompt: ${prompt.prompt}`);
  lines.push(...renderRetrievalPlan(result));
  lines.push(...renderConcernSurfacing(result, lookup));
  lines.push(`Expected concerns: ${formatExpected(prompt.expectedConcernIds, lookup)}`);
  lines.push(`Expected required content: ${formatExpected(prompt.requiredContentEntityIds, lookup)}`);
  if (prompt.supportingContentEntityIds?.length) {
    lines.push(`Expected supporting content: ${formatExpected(prompt.supportingContentEntityIds, lookup)}`);
  }
  if (prompt.requiredSourceOfTruthIds?.length) {
    lines.push(`Expected source-of-truth content: ${formatExpected(prompt.requiredSourceOfTruthIds, lookup)}`);
  }

  lines.push("Matched concerns:");
  lines.push(...renderConcernMatches(result.matchedConcerns));
  lines.push(`Concern status: ${formatRankBandSummary(expectedConcernHits, prompt.expectedConcernIds.length, summary.missingExpectedConcernIds.length)}`);
  lines.push(`Concern hits: ${renderHits(expectedConcernHits)}`);
  lines.push(`Missing expected concerns: ${formatList(summary.missingExpectedConcernIds)}`);

  lines.push("Direct Content Entity matches:");
  lines.push(...renderEntityMatches(result.directContentEntities, 5));

  lines.push("Merged Content Entity ranking:");
  lines.push(...renderEntityMatches(result.mergedContentEntities, 8));
  lines.push(
    `Required content status: ${formatRankBandSummary(
      summary.requiredContentEntityHits,
      prompt.requiredContentEntityIds.length,
      summary.missingRequiredContentEntityIds.length,
    )}`,
  );
  lines.push(`Required content hits: ${renderHits(summary.requiredContentEntityHits)}`);
  lines.push(`Supporting content hits: ${renderHits(supportingHits)}`);
  lines.push(`Source-of-truth hits: ${renderHits(sourceOfTruthHits)}`);
  lines.push(`Missing required content: ${formatList(summary.missingRequiredContentEntityIds)}`);
  if (shouldSurfaceEvaluationNotes(prompt, summary, DIAGNOSTIC_RANK_THRESHOLD)) {
    lines.push(`Evaluation notes: ${formatList(prompt.evaluationNotes ?? [])}`);
  }

  lines.push("Obvious distractors:");
  lines.push(...renderEntityMatches(distractors, 3));
  lines.push("");

  return { lines, summary };
}

function renderStrategyReport(
  fixture: ParsedRetrievalWorkbenchFixture,
  lookup: CorpusLookup,
  strategy: RetrievalStrategy,
): StrategyReport {
  const lines: string[] = [];
  const summaries: PromptReportSummary[] = [];
  const requiredRanksByPrompt = new Map<string, Map<string, number>>();
  lines.push(`## Strategy: ${strategy.label}`);

  for (const prompt of fixture.goldSet) {
    const promptReport = renderPromptReport(prompt, strategy.evaluatePrompt(prompt.prompt), lookup);
    lines.push(...promptReport.lines);
    summaries.push(promptReport.summary);
    requiredRanksByPrompt.set(
      prompt._id,
      new Map(promptReport.summary.requiredContentEntityHits.map((hit) => [hit.id, hit.rank])),
    );
  }

  return { strategy, lines, summaries, requiredRanksByPrompt };
}

function formatCoverageFailure(failure: AnswerCompositionCoverageFailure, topK: number): string {
  const label =
    failure.kind === "requiredContent"
      ? "Missing required Content Entities"
      : "Missing required source-of-truth Content Entities";

  return `${label} in top ${topK}: ${formatList(failure.missingIds)}`;
}

function buildAnswerSnippetLookup(result: AnswerCompositionResult): Map<string, AnswerSourceSnippet> {
  return new Map(result.sourceMaterials.flatMap((material) => material.snippets.map((snippet) => [snippet.snippetId, snippet])));
}

function renderSelectedAnswerSourceMaterials(result: AnswerCompositionResult): string[] {
  if (result.sourceMaterials.length === 0) {
    return ["- none"];
  }

  return result.sourceMaterials.map((material) => {
    const snippetIds = material.snippets.map((snippet) => snippet.snippetId);

    return `- #${material.rank} ${material.title} [${material.sourceId}] snippets: ${formatList(snippetIds)}`;
  });
}

function renderCitedAnswerSourceSnippets(result: AnswerCompositionResult): string[] {
  if (result.citedSources.length === 0) {
    return ["- none"];
  }

  const snippetsById = buildAnswerSnippetLookup(result);

  return result.citedSources.map((citation) => {
    const snippet = snippetsById.get(citation.snippetId);
    const snippetText = snippet ? `${snippet.field}: ${snippet.text}` : "missing snippet";

    return `- ${citation.sourceId}#${citation.snippetId} (${formatList(citation.claimIds)}): ${snippetText}`;
  });
}

function renderClaimCoverage(result: AnswerCompositionResult): string[] {
  if (result.claims.length === 0) {
    return ["- none"];
  }

  return result.claims.map((claim) => {
    const evidence = claim.evidence.map((reference) => `${reference.sourceId}#${reference.snippetId}`);

    return `- ${claim.claimId}: ${claim.text}; evidence: ${formatList(evidence)}`;
  });
}

function renderUnsupportedClaims(result: AnswerCompositionResult): string[] {
  if (result.diagnostics.unsupportedClaims.length === 0) {
    return ["- none"];
  }

  return result.diagnostics.unsupportedClaims.map((claim) => `- ${claim.text}: ${claim.reason}`);
}

function renderMissingSourceOfTruthDiagnostics(result: AnswerCompositionResult): string[] {
  if (result.diagnostics.missingSourceOfTruth.length === 0) {
    return ["- none"];
  }

  return result.diagnostics.missingSourceOfTruth.map((diagnostic) => `- ${diagnostic}`);
}

function renderCitationValidationDiagnostics(result: AnswerCompositionResult): string[] {
  if (result.diagnostics.citationFailures.length === 0) {
    return ["- none"];
  }

  return result.diagnostics.citationFailures.map((diagnostic) => `- ${diagnostic}`);
}

function renderFollowUpQuestions(result: AnswerCompositionResult): string[] {
  if (result.diagnostics.followUpQuestions.length === 0) {
    return ["- none"];
  }

  return result.diagnostics.followUpQuestions.map((question) => `- ${question}`);
}

function renderUnsafeCompositionReasons(result: AnswerCompositionResult): string[] {
  const reasons = result.diagnostics.coverageFailures.map((failure) => `- ${formatCoverageFailure(failure, result.topK)}`);

  if (result.diagnostics.coverageFailures.length === 0) {
    reasons.push(
      ...result.diagnostics.missingSourceOfTruth.map(
        (diagnostic) => `- Provider reported missing source-of-truth: ${diagnostic}`,
      ),
    );
  }

  reasons.push(...result.diagnostics.citationFailures.map((diagnostic) => `- Citation validation: ${diagnostic}`));

  return reasons.length > 0 ? reasons : ["- none"];
}

function renderAnswerCompositionResult(result: AnswerCompositionResult): string[] {
  const lines: string[] = [];

  lines.push(`## Answer Composer: ${result.promptId}`);
  lines.push(`Parent Prompt: ${result.parentPrompt}`);
  lines.push(`Source strategy: ${result.sourceStrategy.label} [${result.sourceStrategy.id}]`);
  lines.push(`Top-k source materials: ${result.topK}`);
  lines.push(`Composition status: ${result.status}`);

  if (result.status === "unsafe") {
    lines.push("Unsafe composition reasons:");
    lines.push(...renderUnsafeCompositionReasons(result));
    const draftDisposition =
      result.diagnostics.coverageFailures.length > 0
        ? "Draft: none (provider call skipped)"
        : "Draft: none (provider output withheld)";
    lines.push(draftDisposition);
  } else {
    lines.push("Draft:");
    lines.push(result.draft ?? "none");
  }

  lines.push("Selected source materials:");
  lines.push(...renderSelectedAnswerSourceMaterials(result));
  lines.push("Cited source snippets:");
  lines.push(...renderCitedAnswerSourceSnippets(result));
  lines.push("Citation validation diagnostics:");
  lines.push(...renderCitationValidationDiagnostics(result));
  lines.push("Claim coverage:");
  lines.push(...renderClaimCoverage(result));
  lines.push("Unsupported claims:");
  lines.push(...renderUnsupportedClaims(result));
  lines.push("Missing source-of-truth diagnostics:");
  lines.push(...renderMissingSourceOfTruthDiagnostics(result));
  lines.push("Follow-up questions:");
  lines.push(...renderFollowUpQuestions(result));
  lines.push("");

  return lines;
}

function renderAnswerCompositionReport(results: AnswerCompositionResult[]): string[] {
  if (results.length === 0) {
    return [];
  }

  const lines = ["Answer Composer Harness (report-only)", ""];

  for (const result of results) {
    lines.push(...renderAnswerCompositionResult(result));
  }

  return lines;
}

function buildStrategySummaryContext(strategyReports: StrategyReport[]): StrategySummaryContext {
  const baselineReport = strategyReports.find((strategyReport) => strategyReport.strategy.id === "deterministic") ?? null;
  const comparisonStrategy = baselineReport?.strategy ?? strategyReports[0]?.strategy ?? null;

  return { baselineReport, comparisonStrategy };
}

export function renderRetrievalWorkbenchReport(
  fixture: ParsedRetrievalWorkbenchFixture,
  strategies: RetrievalStrategy[] = [createDeterministicRetrievalStrategy(fixture)],
  answerCompositionResults: AnswerCompositionResult[] = [],
): string {
  const lookup = buildLookup(fixture);
  const { concernCount, nonConcernCount, contentEntityTypes } = summarizeFixture(fixture);
  const lines: string[] = [];
  const strategyReports = strategies.map((strategy) => renderStrategyReport(fixture, lookup, strategy));
  const { baselineReport, comparisonStrategy } = buildStrategySummaryContext(strategyReports);
  const strategySummaries = strategyReports.map((strategyReport) => ({
    strategy: strategyReport.strategy,
    aggregate: buildStrategyAggregateSummary(fixture, strategyReport, baselineReport),
  }));
  const reportTitle =
    strategies.length === 1 ? "Deterministic retrieval workbench report" : "Retrieval strategy comparison report";

  lines.push(reportTitle);
  lines.push(`Fixture description: ${fixture.description}`);
  lines.push(
    `Corpus: ${concernCount} concerns, ${nonConcernCount} non-Concern Content Entities, ${fixture.goldSet.length} Parent Prompts`,
  );
  lines.push(`Content Entity types: ${contentEntityTypes.join(", ")}`);
  lines.push("");
  lines.push("Strategy summary:");
  for (const { strategy, aggregate } of strategySummaries) {
    lines.push(renderStrategySummaryLine(strategy, aggregate, comparisonStrategy));
  }
  lines.push("");
  lines.push(...renderConcernSurfacingSourceSelectionImpact(fixture, strategyReports));

  lines.push(...renderAnswerCompositionReport(answerCompositionResults));

  for (const strategyReport of strategyReports) {
    lines.push(...strategyReport.lines);
  }

  return lines.join("\n");
}
