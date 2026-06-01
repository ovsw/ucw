import MiniSearch from "minisearch";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import { processIndexedSearchTerm, processQuerySearchTerm } from "./search-query-shaping.js";
import type { RetrievalPlan } from "./retrieval-planner.js";
import type { ConcernSurfacingResult } from "./concern-surfacing-types.js";
import type { ConcernDocument, ContentEntityDocument, ParentPromptExpectation } from "./types.js";

type SearchMatch = Record<string, string[]>;
type SearchResultWithMatch = {
  id: string | number;
  score: number;
  match: SearchMatch;
  queryTerms: string[];
};

export type FieldMatchReason = {
  kind: "fieldMatch";
  field: string;
  matchedTerms: string[];
  fieldBoost: number;
  estimatedScoreShare: number;
};

export type ConcernMatchReason = {
  kind: "relatedConcern";
  concernId: string;
  concernTitle: string;
  matchedConcernScore: number;
  scoreContribution: number;
};

export type RetrievalSource =
  | {
      kind: "direct";
      score: number;
      rank: number;
      matchedTerms: string[];
    }
  | {
      kind: "concernExpansion";
      concernId: string;
      concernTitle: string;
      matchedConcernScore: number;
      score: number;
      rank: number;
    };

export type RankedConcernMatch = {
  _id: string;
  _type: "concern";
  title: string;
  score: number;
  rank: number;
  reasons: FieldMatchReason[];
};

export type RankedContentEntityMatch = {
  _id: string;
  _type: string;
  title: string;
  score: number;
  rank: number;
  reasons: Array<FieldMatchReason | ConcernMatchReason>;
  sources: RetrievalSource[];
};

export type PromptRetrievalResult = {
  prompt: string;
  retrievalPlan?: RetrievalPlan;
  concernSurfacing?: ConcernSurfacingResult;
  matchedConcerns: RankedConcernMatch[];
  directContentEntities: RankedContentEntityMatch[];
  mergedContentEntities: RankedContentEntityMatch[];
};

export type DeterministicWorkbench = {
  evaluatePrompt(prompt: string): PromptRetrievalResult;
  evaluateGoldSet(): Array<{ promptId: string; result: PromptRetrievalResult }>;
};

type IndexedConcernDocument = ConcernDocument & {
  concernArea: string;
  parentSignals: string[];
};

type IndexedContentEntityDocument = ContentEntityDocument & {
  relatedConcernTitles: string;
  claimSourcesText?: string;
  ageRange?: string;
  priceCad?: number;
  origin?: string;
};

const CONCERN_FIELDS = ["title", "contentMap", "concernArea", "parentSignals"] as const;
const ENTITY_FIELDS = [
  "relatedConcernTitles",
  "contentMap",
  "title",
  "_type",
  "ageRange",
  "priceCad",
  "origin",
  "claimSourcesText",
] as const;

const CONCERN_FIELD_BOOSTS: Record<string, number> = {
  title: 3,
  contentMap: 2.5,
  concernArea: 1.5,
  parentSignals: 2,
};

const ENTITY_FIELD_BOOSTS: Record<string, number> = {
  relatedConcernTitles: 4,
  contentMap: 3,
  title: 4,
  ageRange: 1.5,
  priceCad: 1.5,
  origin: 1.5,
  claimSourcesText: 0.75,
  _type: 0.25,
};

const CONCERN_EXPANSION_WEIGHT = 0.35;
const MAX_EXPANSION_CONCERNS = 3;
const MIN_EXPANSION_SCORE_RATIO = 0.1;

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

function cloneRetrievalSource(source: RetrievalSource): RetrievalSource {
  if (source.kind === "direct") {
    return {
      ...source,
      matchedTerms: [...source.matchedTerms],
    };
  }

  return { ...source };
}

function cloneRankedContentEntityMatch(candidate: RankedContentEntityMatch): RankedContentEntityMatch {
  return {
    ...candidate,
    reasons: candidate.reasons.map((reason) =>
      reason.kind === "fieldMatch"
        ? {
            ...reason,
            matchedTerms: [...reason.matchedTerms],
          }
        : { ...reason },
    ),
    sources: candidate.sources.map(cloneRetrievalSource),
  };
}

function createConcernMatch(
  result: SearchResultWithMatch,
  concernById: Map<string, IndexedConcernDocument>,
  rank: number,
): RankedConcernMatch {
  const concern = concernById.get(String(result.id));
  if (!concern) {
    throw new Error(`Concern search returned missing concern id: ${String(result.id)}`);
  }

  return {
    _id: concern._id,
    _type: concern._type,
    title: concern.title,
    score: result.score,
    rank,
    reasons: groupMatchReasons(result.match, CONCERN_FIELD_BOOSTS),
  };
}

function createDirectContentEntityMatch(
  result: SearchResultWithMatch,
  entityById: Map<string, IndexedContentEntityDocument>,
  rank: number,
): RankedContentEntityMatch {
  const entity = entityById.get(String(result.id));
  if (!entity) {
    throw new Error(`Entity search returned missing entity id: ${String(result.id)}`);
  }

  return {
    _id: entity._id,
    _type: entity._type,
    title: entity.title,
    score: result.score,
    rank,
    reasons: groupMatchReasons(result.match, ENTITY_FIELD_BOOSTS),
    sources: [
      {
        kind: "direct",
        score: result.score,
        rank,
        matchedTerms: [...result.queryTerms],
      },
    ],
  };
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

function buildConcernIndex(fixture: ParsedRetrievalWorkbenchFixture): {
  index: MiniSearch<IndexedConcernDocument>;
  concernById: Map<string, IndexedConcernDocument>;
} {
  const concernById = new Map<string, IndexedConcernDocument>();
  const concernDocuments = fixture.documents.filter(
    (document): document is IndexedConcernDocument => document._type === "concern",
  );

  for (const concern of concernDocuments) {
    concernById.set(concern._id, concern);
  }

  const index = new MiniSearch<IndexedConcernDocument>({
    idField: "_id",
    fields: [...CONCERN_FIELDS],
    processTerm: processIndexedSearchTerm,
    storeFields: ["_id", "_type", "title", "contentMap", "concernArea", "parentSignals"],
    searchOptions: {
      combineWith: "OR",
      prefix: true,
      processTerm: processQuerySearchTerm,
      boost: CONCERN_FIELD_BOOSTS,
    },
  });

  index.addAll(concernDocuments);

  return { index, concernById };
}

function buildDocumentLookup(fixture: ParsedRetrievalWorkbenchFixture): Map<string, ContentEntityDocument | ConcernDocument> {
  const lookup = new Map<string, ContentEntityDocument | ConcernDocument>();

  for (const document of fixture.documents) {
    lookup.set(document._id, document);
  }

  return lookup;
}

function buildClaimSourcesText(
  document: ContentEntityDocument,
  documentById: Map<string, ContentEntityDocument | ConcernDocument>,
): string | undefined {
  if (document._type !== "claim") {
    return undefined;
  }

  const claimSources = document.claimSources;
  if (!Array.isArray(claimSources)) {
    return undefined;
  }

  const terms: string[] = [];
  for (const claimSource of claimSources as Array<{ _ref?: string }>) {
    if (!claimSource || typeof claimSource._ref !== "string") {
      continue;
    }

    const sourceDocument = documentById.get(claimSource._ref);
    if (sourceDocument) {
      terms.push(sourceDocument.title, sourceDocument._id);
    } else {
      terms.push(claimSource._ref);
    }
  }

  return terms.length > 0 ? terms.join(" ") : undefined;
}

function buildEntityDocument(
  document: ContentEntityDocument,
  concernById: Map<string, IndexedConcernDocument>,
  documentById: Map<string, ContentEntityDocument | ConcernDocument>,
): IndexedContentEntityDocument {
  const relatedConcernTitles = document.relatedConcerns
    .map((reference) => concernById.get(reference._ref)?.title)
    .filter((title): title is string => Boolean(title))
    .join(" ");

  const searchable: IndexedContentEntityDocument = {
    ...document,
    relatedConcernTitles,
  };

  if ("ageRange" in document && typeof document.ageRange === "string") {
    searchable.ageRange = document.ageRange;
  }

  if ("priceCad" in document && typeof document.priceCad === "number") {
    searchable.priceCad = document.priceCad;
  }

  if ("origin" in document && typeof document.origin === "string") {
    searchable.origin = document.origin;
  }

  const claimSourcesText = buildClaimSourcesText(document, documentById);
  if (claimSourcesText) {
    searchable.claimSourcesText = claimSourcesText;
  }

  return searchable;
}

function buildEntityIdsByConcernId(entityDocuments: ContentEntityDocument[]): Map<string, string[]> {
  const entityIdsByConcernId = new Map<string, string[]>();

  for (const entity of entityDocuments) {
    for (const reference of entity.relatedConcerns) {
      const relatedEntityIds = entityIdsByConcernId.get(reference._ref) ?? [];
      relatedEntityIds.push(entity._id);
      entityIdsByConcernId.set(reference._ref, relatedEntityIds);
    }
  }

  return entityIdsByConcernId;
}

function buildEntityIndex(fixture: ParsedRetrievalWorkbenchFixture, concernById: Map<string, IndexedConcernDocument>): {
  index: MiniSearch<IndexedContentEntityDocument>;
  entityById: Map<string, IndexedContentEntityDocument>;
  entityIdsByConcernId: Map<string, string[]>;
} {
  const documentById = buildDocumentLookup(fixture);
  const entityDocuments = fixture.documents.filter(
    (document): document is ContentEntityDocument => document._type !== "concern",
  );
  const entityById = new Map<string, IndexedContentEntityDocument>();

  for (const entity of entityDocuments) {
    const indexedEntity = buildEntityDocument(entity, concernById, documentById);
    entityById.set(indexedEntity._id, indexedEntity);
  }

  const index = new MiniSearch<IndexedContentEntityDocument>({
    idField: "_id",
    fields: [...ENTITY_FIELDS],
    processTerm: processIndexedSearchTerm,
    storeFields: [
      "_id",
      "_type",
      "title",
      "contentMap",
      "relatedConcernTitles",
      "ageRange",
      "priceCad",
      "origin",
      "claimSourcesText",
    ],
    searchOptions: {
      combineWith: "OR",
      prefix: true,
      processTerm: processQuerySearchTerm,
      boost: ENTITY_FIELD_BOOSTS,
    },
  });

  index.addAll([...entityById.values()]);

  return {
    index,
    entityById,
    entityIdsByConcernId: buildEntityIdsByConcernId(entityDocuments),
  };
}

function groupMatchReasons(match: SearchMatch, fieldBoosts: Record<string, number>): FieldMatchReason[] {
  const reasons = new Map<string, { matchedTerms: string[]; fieldBoost: number }>();

  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      const current = reasons.get(field) ?? { matchedTerms: [], fieldBoost: fieldBoosts[field] ?? 1 };
      current.matchedTerms.push(term);
      reasons.set(field, current);
    }
  }

  return [...reasons.entries()]
    .map(([field, reason]) => ({
      kind: "fieldMatch" as const,
      field,
      matchedTerms: [...new Set(reason.matchedTerms)],
      fieldBoost: reason.fieldBoost,
      estimatedScoreShare: reason.matchedTerms.length * reason.fieldBoost,
    }))
    .sort((left, right) => {
      if (right.fieldBoost !== left.fieldBoost) {
        return right.fieldBoost - left.fieldBoost;
      }

      return left.field.localeCompare(right.field);
    });
}

export function createDeterministicWorkbench(fixture: ParsedRetrievalWorkbenchFixture): DeterministicWorkbench {
  const { index: concernIndex, concernById } = buildConcernIndex(fixture);
  const { index: entityIndex, entityById, entityIdsByConcernId } = buildEntityIndex(fixture, concernById);

  function evaluatePrompt(prompt: string): PromptRetrievalResult {
    const matchedConcerns = concernIndex.search(prompt).map((result, index) =>
      createConcernMatch(result as SearchResultWithMatch, concernById, index + 1),
    );

    const directContentEntities = entityIndex.search(prompt).map((result, index) =>
      createDirectContentEntityMatch(result as SearchResultWithMatch, entityById, index + 1),
    );

    const mergedCandidates = new Map<string, RankedContentEntityMatch>();
    const strongestConcernScore = matchedConcerns[0]?.score ?? 0;
    const expansionConcerns = matchedConcerns
      .slice(0, MAX_EXPANSION_CONCERNS)
      .filter((concern) => concern.score >= strongestConcernScore * MIN_EXPANSION_SCORE_RATIO);

    for (const directCandidate of directContentEntities) {
      mergedCandidates.set(directCandidate._id, cloneRankedContentEntityMatch(directCandidate));
    }

    for (const matchedConcern of expansionConcerns) {
      const relatedEntityIds = [...new Set(entityIdsByConcernId.get(matchedConcern._id) ?? [])];

      for (const entityId of relatedEntityIds) {
        const entity = entityById.get(entityId);
        if (!entity) {
          continue;
        }

        const scoreContribution = matchedConcern.score * CONCERN_EXPANSION_WEIGHT;
        const existing = mergedCandidates.get(entityId);
        const concernReason = createConcernExpansionReason(matchedConcern, scoreContribution);
        const concernSource = createConcernExpansionSource(matchedConcern, scoreContribution);

        if (existing) {
          existing.score += scoreContribution;
          existing.reasons.push(concernReason);
          existing.sources.push(concernSource);
          continue;
        }

        mergedCandidates.set(entityId, {
          _id: entity._id,
          _type: entity._type,
          title: entity.title,
          score: scoreContribution,
          rank: 0,
          reasons: [concernReason],
          sources: [concernSource],
        });
      }
    }

    const mergedContentEntities = [...mergedCandidates.values()].sort(sortContentEntities).map((candidate, rank) => ({
      ...candidate,
      rank: rank + 1,
      sources: [...candidate.sources].sort(compareRetrievalSources),
    }));

    return {
      prompt,
      matchedConcerns,
      directContentEntities,
      mergedContentEntities,
    };
  }

  function evaluateGoldSet(): Array<{ promptId: string; result: PromptRetrievalResult }> {
    return fixture.goldSet.map((prompt) => ({
      promptId: prompt._id,
      result: evaluatePrompt(prompt.prompt),
    }));
  }

  return {
    evaluatePrompt,
    evaluateGoldSet,
  };
}

export function evaluateDeterministicRetrieval(
  fixture: ParsedRetrievalWorkbenchFixture,
  prompt: ParentPromptExpectation,
): PromptRetrievalResult {
  return createDeterministicWorkbench(fixture).evaluatePrompt(prompt.prompt);
}
