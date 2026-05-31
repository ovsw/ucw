import type { PromptRetrievalResult, RetrievalStrategy } from "./retrieval-strategy.js";

export type SanityRetrievalMode = "sanityKeyword" | "sanityHybrid";

export type SanitySearchHit = {
  _id: string;
  _type: string;
  title: string;
  _score?: number;
};

export type SanityRetrievalQueryPlan = {
  kind: SanityRetrievalMode;
  prompt: string;
  searchQuery: string;
  limit: number;
  concernQuery: string;
  contentEntityQuery: string;
};

export type SanityRetrievalQueryResult = {
  matchedConcerns: SanitySearchHit[];
  directContentEntities: SanitySearchHit[];
  mergedContentEntities: SanitySearchHit[];
};

export type SanityRetrievalQueryRunner = (plan: SanityRetrievalQueryPlan) => SanityRetrievalQueryResult;

const DEFAULT_LIMIT = 10;

function escapeGroqString(value: string): string {
  return JSON.stringify(value);
}

function buildSearchClause(fields: string[]): string {
  return `[${fields.join(", ")}] match text::query($searchQuery)`;
}

function buildScoreClause(searchClause: string, includeSemanticSimilarity: boolean): string {
  const scoreTerms = [`boost(${searchClause}, 2)`];

  if (includeSemanticSimilarity) {
    scoreTerms.push("boost(text::semanticSimilarity($searchQuery), 1)");
  }

  return scoreTerms.join(",\n      ");
}

function buildDocumentQuery(
  documentFilterExpression: string,
  searchFields: string[],
  includeSemanticSimilarity: boolean,
): string {
  const searchClause = buildSearchClause(searchFields);

  return `*[${documentFilterExpression} && ${searchClause}]
  | score(
      ${buildScoreClause(searchClause, includeSemanticSimilarity)}
    )
  | order(_score desc, _id asc)[0...$limit]{
      _id,
      _type,
      title,
      _score
    }`;
}

function buildQueryPlan(kind: SanityRetrievalMode, prompt: string): SanityRetrievalQueryPlan {
  const searchQuery = prompt;
  const includeSemanticSimilarity = kind === "sanityHybrid";

  return {
    kind,
    prompt,
    searchQuery,
    limit: DEFAULT_LIMIT,
    concernQuery: buildDocumentQuery(
      `_type == ${escapeGroqString("concern")}`,
      ["title", "contentMap", "parentSignals"],
      includeSemanticSimilarity,
    ),
    contentEntityQuery: buildDocumentQuery(
      `_type != ${escapeGroqString("concern")}`,
      ["title", "contentMap", "relatedConcerns[]->title"],
      includeSemanticSimilarity,
    ),
  };
}

function cloneContentEntityMatches(
  matches: PromptRetrievalResult["directContentEntities"],
): PromptRetrievalResult["mergedContentEntities"] {
  return matches.map((match) => ({
    ...match,
    reasons: [...match.reasons],
    sources: match.sources.map((source) =>
      source.kind === "direct"
        ? {
            ...source,
            matchedTerms: [...source.matchedTerms],
          }
        : { ...source },
    ),
  }));
}

function mapSearchHitsToConcernMatches(hits: SanitySearchHit[]): PromptRetrievalResult["matchedConcerns"] {
  return hits.map((hit, index) => ({
    _id: hit._id,
    _type: "concern",
    title: hit.title,
    score: hit._score ?? 0,
    rank: index + 1,
    reasons: [],
  }));
}

function mapSearchHitsToContentEntityMatches(
  prompt: string,
  hits: SanitySearchHit[],
): PromptRetrievalResult["mergedContentEntities"] {
  return hits.map((hit, index) => {
    const rank = index + 1;
    const score = hit._score ?? 0;

    return {
      _id: hit._id,
      _type: hit._type,
      title: hit.title,
      score,
      rank,
      reasons: [],
      sources: [
        {
          kind: "direct",
          score,
          rank,
          matchedTerms: [prompt],
        },
      ],
    };
  });
}

function mapQueryResult(prompt: string, result: SanityRetrievalQueryResult): PromptRetrievalResult {
  const directContentEntities = mapSearchHitsToContentEntityMatches(prompt, result.directContentEntities);
  const mergedContentEntities =
    result.mergedContentEntities.length > 0
      ? mapSearchHitsToContentEntityMatches(prompt, result.mergedContentEntities)
      : cloneContentEntityMatches(directContentEntities);

  return {
    prompt,
    matchedConcerns: mapSearchHitsToConcernMatches(result.matchedConcerns),
    directContentEntities,
    mergedContentEntities,
  };
}

function createSanityRetrievalStrategy(
  kind: SanityRetrievalMode,
  label: string,
  runner: SanityRetrievalQueryRunner,
): RetrievalStrategy {
  return {
    id: kind,
    label,
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      const plan = buildQueryPlan(kind, prompt);
      return mapQueryResult(prompt, runner(plan));
    },
  };
}

export function buildSanityKeywordQueryPlan(prompt: string): SanityRetrievalQueryPlan {
  return buildQueryPlan("sanityKeyword", prompt);
}

export function buildSanityHybridQueryPlan(prompt: string): SanityRetrievalQueryPlan {
  return buildQueryPlan("sanityHybrid", prompt);
}

export function createSanityKeywordRetrievalStrategy(runner: SanityRetrievalQueryRunner): RetrievalStrategy {
  return createSanityRetrievalStrategy("sanityKeyword", "Sanity Keyword", runner);
}

export function createSanityHybridRetrievalStrategy(runner: SanityRetrievalQueryRunner): RetrievalStrategy {
  return createSanityRetrievalStrategy("sanityHybrid", "Sanity Hybrid", runner);
}
