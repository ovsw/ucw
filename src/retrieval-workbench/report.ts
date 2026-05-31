import { createDeterministicWorkbench } from "./deterministic-retrieval.js";
import type {
  FieldMatchReason,
  PromptRetrievalResult,
  RankedConcernMatch,
  RankedContentEntityMatch,
} from "./deterministic-retrieval.js";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import { summarizeFixture } from "./fixture-summary.js";
import type { ContentEntityDocument, ParentPromptExpectation } from "./types.js";

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
  entitiesById: Map<string, ContentEntityDocument>;
};

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function formatExpected(ids: string[], lookup: CorpusLookup): string {
  return formatList(ids.map((id) => `${lookup.titlesById.get(id) ?? id} [${id}]`));
}

function buildLookup(fixture: ParsedRetrievalWorkbenchFixture): CorpusLookup {
  const titlesById = new Map<string, string>();
  const entitiesById = new Map<string, ContentEntityDocument>();

  for (const document of fixture.documents) {
    titlesById.set(document._id, document.title);
    if (document._type !== "concern") {
      entitiesById.set(document._id, document as ContentEntityDocument);
    }
  }

  return { titlesById, entitiesById };
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

  return hits.map((hit) => `${hit.title} [${hit.id}] at #${hit.rank}`).join("; ");
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
  lines.push(`Concern hits: ${renderHits(expectedConcernHits)}`);
  lines.push(`Missing expected concerns: ${formatList(summary.missingExpectedConcernIds)}`);

  lines.push("Direct Content Entity matches:");
  lines.push(...renderEntityMatches(result.directContentEntities, 5));

  lines.push("Merged Content Entity ranking:");
  lines.push(...renderEntityMatches(result.mergedContentEntities, 8));
  lines.push(`Required content hits: ${renderHits(summary.requiredContentEntityHits)}`);
  lines.push(`Supporting content hits: ${renderHits(supportingHits)}`);
  lines.push(`Source-of-truth hits: ${renderHits(sourceOfTruthHits)}`);
  lines.push(`Missing required content: ${formatList(summary.missingRequiredContentEntityIds)}`);

  lines.push("Obvious distractors:");
  lines.push(...renderEntityMatches(distractors, 3));
  lines.push("");

  return { lines, summary };
}

export function renderRetrievalWorkbenchReport(fixture: ParsedRetrievalWorkbenchFixture): string {
  const lookup = buildLookup(fixture);
  const workbench = createDeterministicWorkbench(fixture);
  const { concernCount, nonConcernCount, contentEntityTypes } = summarizeFixture(fixture);
  const lines: string[] = [];
  const summaries: PromptReportSummary[] = [];

  lines.push("Deterministic retrieval workbench report");
  lines.push(`Fixture description: ${fixture.description}`);
  lines.push(
    `Corpus: ${concernCount} concerns, ${nonConcernCount} non-Concern Content Entities, ${fixture.goldSet.length} Parent Prompts`,
  );
  lines.push(`Content Entity types: ${contentEntityTypes.join(", ")}`);
  lines.push("");

  for (const prompt of fixture.goldSet) {
    const promptReport = renderPromptReport(prompt, workbench.evaluatePrompt(prompt.prompt), lookup);
    lines.push(...promptReport.lines);
    summaries.push(promptReport.summary);
  }

  const missingConcernCount = summaries.reduce(
    (total, summary) => total + summary.missingExpectedConcernIds.length,
    0,
  );
  const missingRequiredContentCount = summaries.reduce(
    (total, summary) => total + summary.missingRequiredContentEntityIds.length,
    0,
  );
  const requiredContentHitCount = summaries.reduce(
    (total, summary) => total + summary.requiredContentEntityHits.length,
    0,
  );
  const requiredContentExpectationCount = fixture.goldSet.reduce(
    (total, prompt) => total + prompt.requiredContentEntityIds.length,
    0,
  );

  lines.unshift(
    `Summary: ${missingConcernCount} missing expected concerns, ${missingRequiredContentCount} missing required content entities, ${requiredContentHitCount}/${requiredContentExpectationCount} required content hits`,
    "",
  );

  return lines.join("\n");
}
