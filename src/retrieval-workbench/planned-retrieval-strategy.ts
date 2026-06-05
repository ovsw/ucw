import type {
  PromptRetrievalResult,
  RankedConcernMatch,
  RankedContentEntityMatch,
} from "./deterministic-retrieval.ts";
import { cloneRetrievalPlan, type RetrievalPlanner } from "./retrieval-planner.ts";
import type { RetrievalStrategy } from "./retrieval-strategy.ts";

type PlannedRetrievalStrategyOptions = {
  rrfK?: number;
};

type RankedMatch = {
  _id: string;
  title: string;
  score: number;
  rank: number;
};

type AggregatedMatch<T extends RankedMatch> = {
  match: T;
  score: number;
  bestRank: number;
  firstSeen: number;
};

const DEFAULT_RRF_K = 60;

function cloneConcernMatch(match: RankedConcernMatch): RankedConcernMatch {
  return {
    ...match,
    reasons: match.reasons.map((reason) => ({
      ...reason,
      matchedTerms: [...reason.matchedTerms],
    })),
  };
}

function cloneContentEntityMatch(match: RankedContentEntityMatch): RankedContentEntityMatch {
  return {
    ...match,
    reasons: match.reasons.map((reason) =>
      reason.kind === "fieldMatch"
        ? {
            ...reason,
            matchedTerms: [...reason.matchedTerms],
          }
        : { ...reason },
    ),
    sources: match.sources.map((source) =>
      source.kind === "direct"
        ? {
            ...source,
            matchedTerms: [...source.matchedTerms],
          }
        : { ...source },
    ),
  };
}

function compareAggregatedMatches<T extends RankedMatch>(
  left: AggregatedMatch<T>,
  right: AggregatedMatch<T>,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.bestRank !== right.bestRank) {
    return left.bestRank - right.bestRank;
  }

  if (left.firstSeen !== right.firstSeen) {
    return left.firstSeen - right.firstSeen;
  }

  if (left.match.title !== right.match.title) {
    return left.match.title.localeCompare(right.match.title);
  }

  return left.match._id.localeCompare(right.match._id);
}

function mergeRankedMatches<T extends RankedMatch>(
  resultSets: T[][],
  cloneMatch: (match: T) => T,
  rrfK: number,
): T[] {
  const aggregated = new Map<string, AggregatedMatch<T>>();
  let firstSeen = 0;

  for (const resultSet of resultSets) {
    for (const match of resultSet) {
      const scoreContribution = 1 / (rrfK + match.rank);
      const existing = aggregated.get(match._id);

      if (existing) {
        existing.score += scoreContribution;

        if (match.rank < existing.bestRank) {
          existing.bestRank = match.rank;
          existing.match = cloneMatch(match);
        }

        continue;
      }

      aggregated.set(match._id, {
        match: cloneMatch(match),
        score: scoreContribution,
        bestRank: match.rank,
        firstSeen,
      });
      firstSeen += 1;
    }
  }

  return [...aggregated.values()].sort(compareAggregatedMatches).map((aggregatedMatch, index) => ({
    ...aggregatedMatch.match,
    score: aggregatedMatch.score * 1000,
    rank: index + 1,
  }));
}

export function createPlannedRetrievalStrategy(
  baseStrategy: RetrievalStrategy,
  planner: RetrievalPlanner,
  options: PlannedRetrievalStrategyOptions = {},
): RetrievalStrategy {
  const rrfK = options.rrfK ?? DEFAULT_RRF_K;

  return {
    id: `${baseStrategy.id}Planned`,
    label: `${baseStrategy.label} + Planner`,
    evaluatePrompt(prompt: string): PromptRetrievalResult {
      const plan = planner.planPrompt(prompt);
      const queryResults = plan.queries.map((query) => baseStrategy.evaluatePrompt(query.searchText));

      return {
        prompt,
        retrievalPlan: cloneRetrievalPlan(plan),
        matchedConcerns: mergeRankedMatches(
          queryResults.map((result) => result.matchedConcerns),
          cloneConcernMatch,
          rrfK,
        ),
        directContentEntities: mergeRankedMatches(
          queryResults.map((result) => result.directContentEntities),
          cloneContentEntityMatch,
          rrfK,
        ),
        mergedContentEntities: mergeRankedMatches(
          queryResults.map((result) => result.mergedContentEntities),
          cloneContentEntityMatch,
          rrfK,
        ),
      };
    },
  };
}
