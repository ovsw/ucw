import { z } from "zod";
import type {
  ConcernMatchReason,
  FieldMatchReason,
  PromptRetrievalResult,
  RankedConcernMatch,
  RankedContentEntityMatch,
  RetrievalSource,
} from "./deterministic-retrieval.js";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import type {
  ConcernSurfacingCatalogEntry,
  ConcernSurfacingResult,
  MissingConcernCandidate,
  SurfacedConcern,
} from "./concern-surfacing-types.js";
import type { ConcernDocument } from "./types.js";

export const concernSurfacingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["surfacedConcerns", "missingConcernCandidates"],
  properties: {
    surfacedConcerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concernId", "rationale"],
        properties: {
          concernId: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    missingConcernCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "rationale"],
        properties: {
          description: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;

const surfacedConcernSchema = z
  .object({
    concernId: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();

const missingConcernCandidateSchema = z
  .object({
    description: z.string().min(1),
    rationale: z.string().min(1),
  })
  .strict();

export const concernSurfacingResultSchema = z
  .object({
    surfacedConcerns: z.array(surfacedConcernSchema),
    missingConcernCandidates: z.array(missingConcernCandidateSchema),
  })
  .strict();

const CONCERN_EXPANSION_WEIGHT = 0.35;
const SURFACED_CONCERN_SCORE_RATIO = 0.95;

function isConcernDocument(document: ParsedRetrievalWorkbenchFixture["documents"][number]): document is ConcernDocument {
  return document._type === "concern";
}

function cloneConcernSurfacingResult(result: ConcernSurfacingResult): ConcernSurfacingResult {
  return {
    surfacedConcerns: result.surfacedConcerns.map((concern) => ({ ...concern })),
    missingConcernCandidates: result.missingConcernCandidates.map((candidate) => ({ ...candidate })),
  };
}

function cloneFieldReason(reason: FieldMatchReason): FieldMatchReason {
  return {
    ...reason,
    matchedTerms: [...reason.matchedTerms],
  };
}

function cloneConcernMatch(match: RankedConcernMatch): RankedConcernMatch {
  return {
    ...match,
    reasons: match.reasons.map(cloneFieldReason),
  };
}

function cloneRetrievalSource(source: RetrievalSource): RetrievalSource {
  if (source.kind === "direct") {
    return {
      ...source,
      matchedTerms: [...source.matchedTerms],
    };
  }

  return { ...source };
}

function cloneContentEntityReason(
  reason: RankedContentEntityMatch["reasons"][number],
): FieldMatchReason | ConcernMatchReason {
  if (reason.kind === "fieldMatch") {
    return cloneFieldReason(reason);
  }

  return { ...reason };
}

function cloneContentEntityMatch(match: RankedContentEntityMatch): RankedContentEntityMatch {
  return {
    ...match,
    reasons: match.reasons.map(cloneContentEntityReason),
    sources: match.sources.map(cloneRetrievalSource),
  };
}

function compareConcernMatches(left: RankedConcernMatch, right: RankedConcernMatch): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.title !== right.title) {
    return left.title.localeCompare(right.title);
  }

  return left._id.localeCompare(right._id);
}

function compareRetrievalSources(left: RetrievalSource, right: RetrievalSource): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }

  if (left.kind === "concernExpansion" && right.kind === "concernExpansion") {
    return left.concernId.localeCompare(right.concernId);
  }

  return 0;
}

function sortContentEntities(left: RankedContentEntityMatch, right: RankedContentEntityMatch): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (right.sources.length !== left.sources.length) {
    return right.sources.length - left.sources.length;
  }

  if (left.title !== right.title) {
    return left.title.localeCompare(right.title);
  }

  return left._id.localeCompare(right._id);
}

function createConcernExpansionReason(
  matchedConcern: RankedConcernMatch,
  scoreContribution: number,
): ConcernMatchReason {
  return {
    kind: "relatedConcern",
    concernId: matchedConcern._id,
    concernTitle: matchedConcern.title,
    matchedConcernScore: matchedConcern.score,
    scoreContribution,
  };
}

function createConcernExpansionSource(matchedConcern: RankedConcernMatch, scoreContribution: number): RetrievalSource {
  return {
    kind: "concernExpansion",
    concernId: matchedConcern._id,
    concernTitle: matchedConcern.title,
    matchedConcernScore: matchedConcern.score,
    score: scoreContribution,
    rank: matchedConcern.rank,
  };
}

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function findDuplicateIds(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

export function buildApprovedConcernCatalog(
  fixture: ParsedRetrievalWorkbenchFixture,
): ConcernSurfacingCatalogEntry[] {
  return fixture.documents
    .filter(isConcernDocument)
    .map((document) => ({
      _id: document._id,
      title: document.title,
      contentMap: document.contentMap,
    }));
}

export function validateConcernSurfacingResult(
  rawResult: unknown,
  catalog: ConcernSurfacingCatalogEntry[],
): ConcernSurfacingResult {
  const result = concernSurfacingResultSchema.parse(rawResult);
  const validConcernIds = new Set(catalog.map((entry) => entry._id));
  const surfacedConcernIds = result.surfacedConcerns.map((concern) => concern.concernId);
  const unknownConcernIds = surfacedConcernIds.filter((concernId) => !validConcernIds.has(concernId));
  const duplicateConcernIds = findDuplicateIds(surfacedConcernIds);

  if (unknownConcernIds.length > 0) {
    throw new Error(`Concern Surfacing returned unknown approved Concern ids: ${formatList(unknownConcernIds)}`);
  }

  if (duplicateConcernIds.length > 0) {
    throw new Error(`Concern Surfacing returned duplicate approved Concern ids: ${formatList(duplicateConcernIds)}`);
  }

  return result;
}

function buildConcernMatches(
  fixture: ParsedRetrievalWorkbenchFixture,
  result: PromptRetrievalResult,
  surfacedConcerns: SurfacedConcern[],
): RankedConcernMatch[] {
  const concernById = new Map(
    fixture.documents.filter(isConcernDocument).map((document) => [document._id, document]),
  );
  const existingConcernIds = new Set(result.matchedConcerns.map((concern) => concern._id));
  const strongestExistingScore = Math.max(1, ...result.matchedConcerns.map((concern) => concern.score));
  const mergedConcerns = result.matchedConcerns.map(cloneConcernMatch);
  let surfacedIndex = 0;

  for (const surfacedConcern of surfacedConcerns) {
    if (existingConcernIds.has(surfacedConcern.concernId)) {
      continue;
    }

    const concern = concernById.get(surfacedConcern.concernId);
    if (!concern) {
      throw new Error(`Concern Surfacing referenced a Concern outside the fixture: ${surfacedConcern.concernId}`);
    }

    mergedConcerns.push({
      _id: concern._id,
      _type: "concern",
      title: concern.title,
      score: strongestExistingScore * Math.max(0.01, SURFACED_CONCERN_SCORE_RATIO - surfacedIndex * 0.01),
      rank: 0,
      reasons: [],
    });
    surfacedIndex += 1;
  }

  return mergedConcerns.sort(compareConcernMatches).map((match, index) => ({
    ...match,
    rank: index + 1,
  }));
}

function mergeSurfacedConcernExpansions(
  fixture: ParsedRetrievalWorkbenchFixture,
  result: PromptRetrievalResult,
  matchedConcerns: RankedConcernMatch[],
  surfacedConcerns: SurfacedConcern[],
): RankedContentEntityMatch[] {
  const matchedConcernById = new Map(matchedConcerns.map((concern) => [concern._id, concern]));
  const mergedContentEntities = new Map(
    result.mergedContentEntities.map((match) => [match._id, cloneContentEntityMatch(match)]),
  );

  for (const surfacedConcern of surfacedConcerns) {
    const matchedConcern = matchedConcernById.get(surfacedConcern.concernId);
    if (!matchedConcern) {
      continue;
    }

    const scoreContribution = matchedConcern.score * CONCERN_EXPANSION_WEIGHT;

    for (const document of fixture.documents) {
      if (isConcernDocument(document)) {
        continue;
      }

      if (!document.relatedConcerns.some((reference) => reference._ref === surfacedConcern.concernId)) {
        continue;
      }

      const existing = mergedContentEntities.get(document._id);
      const alreadyExpandedFromConcern =
        existing?.sources.some(
          (source) => source.kind === "concernExpansion" && source.concernId === surfacedConcern.concernId,
        ) ?? false;

      if (alreadyExpandedFromConcern) {
        continue;
      }

      const reason = createConcernExpansionReason(matchedConcern, scoreContribution);
      const source = createConcernExpansionSource(matchedConcern, scoreContribution);

      if (existing) {
        existing.score += scoreContribution;
        existing.reasons.push(reason);
        existing.sources.push(source);
        continue;
      }

      mergedContentEntities.set(document._id, {
        _id: document._id,
        _type: document._type,
        title: document.title,
        score: scoreContribution,
        rank: 0,
        reasons: [reason],
        sources: [source],
      });
    }
  }

  return [...mergedContentEntities.values()].sort(sortContentEntities).map((match, index) => ({
    ...match,
    rank: index + 1,
    sources: [...match.sources].sort(compareRetrievalSources),
  }));
}

export function mergeConcernSurfacingResultIntoRetrievalResult(
  fixture: ParsedRetrievalWorkbenchFixture,
  result: PromptRetrievalResult,
  concernSurfacing: ConcernSurfacingResult,
): PromptRetrievalResult {
  const matchedConcerns = buildConcernMatches(fixture, result, concernSurfacing.surfacedConcerns);

  return {
    ...result,
    matchedConcerns,
    directContentEntities: result.directContentEntities.map(cloneContentEntityMatch),
    mergedContentEntities: mergeSurfacedConcernExpansions(
      fixture,
      result,
      matchedConcerns,
      concernSurfacing.surfacedConcerns,
    ),
    concernSurfacing: cloneConcernSurfacingResult(concernSurfacing),
  };
}

export function formatSurfacedConcernForReport(
  concern: SurfacedConcern,
  catalog: ConcernSurfacingCatalogEntry[],
): string {
  const catalogEntry = catalog.find((entry) => entry._id === concern.concernId);
  const label = catalogEntry ? `${catalogEntry.title} [${catalogEntry._id}]` : concern.concernId;

  return `${label}: ${concern.rationale}`;
}

export function formatMissingConcernCandidateForReport(candidate: MissingConcernCandidate): string {
  return `${candidate.description}: ${candidate.rationale}`;
}
