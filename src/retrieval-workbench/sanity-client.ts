import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";
import type { SanityQueryConfig } from "./sanity-config.js";
import { compareSanitySeedParity } from "./sanity-seed.js";
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
    `* | order(_id asc) {_id, _type}`,
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

  const mappedDirectContentEntities = mapSanitySearchHits(directContentEntities, plan.prompt);

  return {
    matchedConcerns,
    directContentEntities: mappedDirectContentEntities,
    mergedContentEntities: mappedDirectContentEntities,
  };
}
