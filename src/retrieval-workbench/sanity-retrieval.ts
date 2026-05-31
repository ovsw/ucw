import type { PromptRetrievalResult, RetrievalStrategy } from "./retrieval-strategy.js";

export type SanityRetrievalMode = "sanityKeyword" | "sanityHybrid";

export type SanitySearchHit = {
  _id: string;
  _type: string;
  title: string;
  _score?: number;
  relatedConcernIds?: string[];
};

export type SanityRetrievalQueryPlan = {
  kind: SanityRetrievalMode;
  prompt: string;
  searchQuery: string;
  limit: number;
  concernQuery: string;
  contentEntityQuery: string;
  contentEntityBridgeQuery: string;
};

export type SanityRetrievalQueryResult = Omit<PromptRetrievalResult, "prompt">;

export type SanityRetrievalQueryRunner = (plan: SanityRetrievalQueryPlan) => SanityRetrievalQueryResult;

const DEFAULT_LIMIT = 10;

function escapeGroqString(value: string): string {
  return JSON.stringify(value);
}

function buildTextQueryExpression(field: string): string {
  return `${field} match text::query($searchQuery)`;
}

function buildScoreClause(fields: string[], includeSemanticSimilarity: boolean): string {
  const scoreTerms = fields.map(buildTextQueryExpression);

  if (includeSemanticSimilarity) {
    scoreTerms.push("text::semanticSimilarity($searchQuery)");
  }

  return scoreTerms.join(",\n      ");
}

function buildDocumentQuery(
  documentFilterExpression: string,
  searchFields: string[],
  includeSemanticSimilarity: boolean,
): string {
  return `*[${documentFilterExpression}]
  | score(
      ${buildScoreClause(searchFields, includeSemanticSimilarity)}
    )
  | order(_score desc, _id asc)[0...$limit]{
      _id,
      _type,
      title,
      _score
    }`;
}

function buildContentEntityBridgeQuery(): string {
  return `*[_type != ${escapeGroqString("concern")} && count(relatedConcerns[_ref in $matchedConcernIds]) > 0]
  | order(title asc, _id asc){
      _id,
      _type,
      title,
      "relatedConcernIds": relatedConcerns[]._ref
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
      ["title", "contentMap"],
      includeSemanticSimilarity,
    ),
    contentEntityQuery: buildDocumentQuery(
      `_type != ${escapeGroqString("concern")}`,
      ["title", "contentMap"],
      includeSemanticSimilarity,
    ),
    contentEntityBridgeQuery: buildContentEntityBridgeQuery(),
  };
}

function cloneConcernMatches(matches: PromptRetrievalResult["matchedConcerns"]): PromptRetrievalResult["matchedConcerns"] {
  return matches.map((match) => ({
    ...match,
    reasons: match.reasons.map((reason) => ({
      ...reason,
      matchedTerms: [...reason.matchedTerms],
    })),
  }));
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

export function mapSanityRetrievalQueryResult(prompt: string, result: SanityRetrievalQueryResult): PromptRetrievalResult {
  const directContentEntities = cloneContentEntityMatches(result.directContentEntities);
  const mergedContentEntities =
    result.mergedContentEntities.length > 0
      ? cloneContentEntityMatches(result.mergedContentEntities)
      : cloneContentEntityMatches(directContentEntities);

  return {
    prompt,
    matchedConcerns: cloneConcernMatches(result.matchedConcerns),
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
      return mapSanityRetrievalQueryResult(prompt, runner(plan));
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

export function createSanityRetrievalStrategyFromResults(
  kind: SanityRetrievalMode,
  label: string,
  resultsByPrompt: Map<string, SanityRetrievalQueryResult>,
): RetrievalStrategy {
  return {
    id: kind,
    label,
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      const result = resultsByPrompt.get(prompt);

      if (!result) {
        throw new Error(`Missing preloaded Sanity retrieval result for ${label}: ${prompt}`);
      }

      return mapSanityRetrievalQueryResult(prompt, result);
    },
  };
}
