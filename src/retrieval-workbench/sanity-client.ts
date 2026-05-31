import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import type { SanityQueryConfig } from "./sanity-config.js";
import { compareSanitySeedParity } from "./sanity-seed.js";
import type {
  ConcernMatchReason,
  RankedConcernMatch,
  RankedContentEntityMatch,
  RetrievalSource,
} from "./deterministic-retrieval.js";
import type {
  SanityRetrievalQueryPlan,
  SanityRetrievalQueryResult,
  SanitySearchHit,
} from "./sanity-retrieval.js";

export type SanityDocumentRef = {
  _id: string;
  _type: string;
};

type SanityQueryResponse<T> = {
  result: T;
};

const CONCERN_EXPANSION_WEIGHT = 0.35;
const MAX_EXPANSION_CONCERNS = 3;
const MIN_EXPANSION_SCORE_RATIO = 0.1;

function buildSanityBaseUrl(config: SanityQueryConfig): string {
  return `https://${config.projectId}.api.sanity.io/v${config.apiVersion}`;
}

function buildSanityQueryUrl(config: SanityQueryConfig, path: string): string {
  const url = new URL(`${buildSanityBaseUrl(config)}${path}`);
  url.searchParams.set("perspective", "published");
  return url.toString();
}

function buildSanityHeaders(config: SanityQueryConfig): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.readToken) {
    headers.authorization = `Bearer ${config.readToken}`;
  }

  return headers;
}

async function readSanityJson<T>(response: Response, context: string): Promise<T> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sanity ${context} failed with ${response.status} ${response.statusText}: ${errorText}`);
  }

  return (await response.json()) as T;
}

export async function executeSanityQuery<T>(
  config: SanityQueryConfig,
  query: string,
  params: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(buildSanityQueryUrl(config, `/data/query/${encodeURIComponent(config.dataset)}`), {
    method: "POST",
    headers: buildSanityHeaders(config),
    body: JSON.stringify({
      query,
      params,
    }),
  });

  const payload = await readSanityJson<SanityQueryResponse<T>>(response, "query");
  return payload.result;
}

export async function listSanityDocumentRefs(
  config: SanityQueryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SanityDocumentRef[]> {
  return executeSanityQuery<SanityDocumentRef[]>(
    config,
    `*[!(_id in path("_.*"))] | order(_id asc) {_id, _type}`,
    {},
    fetchImpl,
  );
}

export async function verifySanityFixtureParity(
  fixture: ParsedRetrievalWorkbenchFixture,
  config: SanityQueryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<ReturnType<typeof compareSanitySeedParity>> {
  const actualDocuments = await listSanityDocumentRefs(config, fetchImpl);
  const expectedDocuments = fixture.documents.map((document) => ({
    _id: document._id,
    _type: document._type,
  }));

  return compareSanitySeedParity(expectedDocuments, actualDocuments);
}

function mapSanitySearchHits(
  hits: SanitySearchHit[],
  prompt: string,
): SanityRetrievalQueryResult["directContentEntities"] {
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

function mapSanityConcernHits(hits: SanitySearchHit[]): RankedConcernMatch[] {
  return hits.map((hit, index) => ({
    _id: hit._id,
    _type: "concern",
    title: hit.title,
    score: hit._score ?? 0,
    rank: index + 1,
    reasons: [],
  }));
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

function cloneRetrievalSource(source: RetrievalSource): RetrievalSource {
  if (source.kind === "direct") {
    return {
      ...source,
      matchedTerms: [...source.matchedTerms],
    };
  }

  return { ...source };
}

function cloneContentEntityMatch(candidate: RankedContentEntityMatch): RankedContentEntityMatch {
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

function getExpansionConcerns(matchedConcerns: RankedConcernMatch[]): RankedConcernMatch[] {
  const strongestConcernScore = matchedConcerns[0]?.score ?? 0;

  if (strongestConcernScore <= 0) {
    return [];
  }

  return matchedConcerns
    .slice(0, MAX_EXPANSION_CONCERNS)
    .filter((concern) => concern.score >= strongestConcernScore * MIN_EXPANSION_SCORE_RATIO);
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

function mergeContentEntityHits(
  directContentEntities: RankedContentEntityMatch[],
  bridgeContentEntities: SanitySearchHit[],
  expansionConcerns: RankedConcernMatch[],
): RankedContentEntityMatch[] {
  const mergedCandidates = new Map<string, RankedContentEntityMatch>();

  for (const directCandidate of directContentEntities) {
    mergedCandidates.set(directCandidate._id, cloneContentEntityMatch(directCandidate));
  }

  for (const matchedConcern of expansionConcerns) {
    for (const bridgeHit of bridgeContentEntities) {
      if (!bridgeHit.relatedConcernIds?.includes(matchedConcern._id)) {
        continue;
      }

      const scoreContribution = matchedConcern.score * CONCERN_EXPANSION_WEIGHT;
      const existing = mergedCandidates.get(bridgeHit._id);
      const concernReason = createConcernExpansionReason(matchedConcern, scoreContribution);
      const concernSource = createConcernExpansionSource(matchedConcern, scoreContribution);

      if (existing) {
        existing.score += scoreContribution;
        existing.reasons.push(concernReason);
        existing.sources.push(concernSource);
        continue;
      }

      mergedCandidates.set(bridgeHit._id, {
        _id: bridgeHit._id,
        _type: bridgeHit._type,
        title: bridgeHit.title,
        score: scoreContribution,
        rank: 0,
        reasons: [concernReason],
        sources: [concernSource],
      });
    }
  }

  return [...mergedCandidates.values()].sort(sortContentEntities).map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    sources: [...candidate.sources].sort(compareRetrievalSources),
  }));
}

export async function executeSanityRetrievalQueryPlan(
  plan: SanityRetrievalQueryPlan,
  config: SanityQueryConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<SanityRetrievalQueryResult> {
  const [matchedConcerns, directContentEntities] = await Promise.all([
    executeSanityQuery<SanitySearchHit[]>(config, plan.concernQuery, { searchQuery: plan.searchQuery, limit: plan.limit }, fetchImpl),
    executeSanityQuery<SanitySearchHit[]>(
      config,
      plan.contentEntityQuery,
      { searchQuery: plan.searchQuery, limit: plan.limit },
      fetchImpl,
    ),
  ]);

  const mappedMatchedConcerns = mapSanityConcernHits(matchedConcerns);
  const mappedDirectContentEntities = mapSanitySearchHits(directContentEntities, plan.prompt);
  const expansionConcerns = getExpansionConcerns(mappedMatchedConcerns);
  const matchedConcernIds = expansionConcerns.map((concern) => concern._id);
  const bridgeContentEntities =
    matchedConcernIds.length > 0
      ? await executeSanityQuery<SanitySearchHit[]>(
          config,
          plan.contentEntityBridgeQuery,
          { matchedConcernIds },
          fetchImpl,
        )
      : [];

  return {
    matchedConcerns: mappedMatchedConcerns,
    directContentEntities: mappedDirectContentEntities,
    mergedContentEntities: mergeContentEntityHits(
      mappedDirectContentEntities,
      bridgeContentEntities,
      expansionConcerns,
    ),
  };
}
