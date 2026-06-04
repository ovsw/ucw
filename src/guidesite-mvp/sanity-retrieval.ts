import { shapeSanitySearchQuery } from "../retrieval-workbench/search-query-shaping.js";
import { executeSanityQuery, executeSanityRetrievalQueryPlan } from "../retrieval-workbench/sanity-client.js";
import { buildSanityHybridQueryPlan } from "../retrieval-workbench/sanity-retrieval.js";
import type { SanityQueryConfig } from "../retrieval-workbench/sanity-config.js";
import type { PromptUnderstanding, PromptUnderstandingSessionContext, RetrievalResult, RetrievalResults } from "./types.js";
import type { GuideSiteRetrievalAdapter, GuideSiteRetrievalInput, GuideSiteRetrievalResult } from "./fixture-retrieval.js";

export type GuideSiteSanitySourceDocument = {
  _id: string;
  _type: string;
  _rev?: string;
  sourceKind?: string;
  title: string;
  summary?: string;
  body?: string;
  contentMap?: string;
  text?: string;
};

export type GuideSiteSanityRetrievalQuery = {
  searchText: string;
  understanding: PromptUnderstanding;
  sessionContext: PromptUnderstandingSessionContext | null;
};

export type GuideSiteSanityRetrievalQueryRunner = (query: GuideSiteSanityRetrievalQuery) => GuideSiteSanitySourceDocument[];
export type GuideSiteSanityRetrievalAdapterResolver = (
  promptText: string,
  understanding: PromptUnderstanding,
  sessionContext?: PromptUnderstandingSessionContext,
) => Promise<GuideSiteRetrievalAdapter>;

const DEFAULT_SANITY_ADAPTER_ID = "sanityHybrid";
const DEFAULT_SANITY_ADAPTER_LABEL = "Sanity Hybrid";
const APPROVED_SOURCE_KIND = "sourceOfTruth";
const APPROVED_SOURCE_TYPES = new Set(["campProgram", "policy", "concern", "promptTemplate"]);

function formatList(values: string[]): string {
  return values.length === 0 ? "(none)" : values.join(", ");
}

function collectSearchTerms(understanding: PromptUnderstanding, sessionContext: PromptUnderstandingSessionContext | null): string[] {
  const session = sessionContext?.session;
  const promptTerms = [
    understanding.goal,
    understanding.promptType,
    understanding.fitQuestion ?? "",
    ...Object.values(understanding.facts).map((fact) => String(fact.value)),
    ...understanding.retrievalNeeds,
    ...understanding.contextNeeds,
    ...understanding.concerns.map((concern) => `${concern.key} ${concern.label}`),
  ];
  const sessionTerms = session
    ? [
        ...Object.values(session.visitorFacts).map((fact) => String(fact.value)),
        ...Object.entries(session.concerns).map(([key, concern]) => `${key} ${concern.status}`),
        ...session.focus.contextNeeds,
        session.summary,
      ]
    : [];

  return [...promptTerms, ...sessionTerms].filter((term) => term.trim().length > 0);
}

export function buildGuideSiteSanitySearchText(
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null = null,
): string {
  return shapeSanitySearchQuery(collectSearchTerms(understanding, sessionContext).join(" "));
}

function chooseFieldPath(source: GuideSiteSanitySourceDocument): string {
  if (source.summary?.trim()) {
    return "summary";
  }

  if (source.body?.trim()) {
    return "body";
  }

  if (source.text?.trim()) {
    return "text";
  }

  return "contentMap";
}

function chooseSourceRevision(source: GuideSiteSanitySourceDocument): string {
  return source._rev?.trim() || "unknown";
}

function normalizeSanitySourceDocument(source: GuideSiteSanitySourceDocument, rank: number): RetrievalResult {
  return {
    sourceId: source._id,
    sourceType: source._type,
    title: source.title,
    rank,
    fieldPath: chooseFieldPath(source),
    sourceRevision: chooseSourceRevision(source),
  };
}

function isApprovedSanitySourceDocument(source: GuideSiteSanitySourceDocument): boolean {
  if (source._id.startsWith("_")) {
    return false;
  }

  const sourceKind = source.sourceKind?.trim();

  if (sourceKind !== APPROVED_SOURCE_KIND) {
    return false;
  }

  return APPROVED_SOURCE_TYPES.has(source._type);
}

function createInsufficientSanitySourceDiagnostic(
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null,
): string {
  const needs = understanding.retrievalNeeds.join(", ") || "(none)";
  const concerns = understanding.concerns.map((concern) => concern.key).join(", ") || "(none)";
  const sessionSummary = sessionContext?.session.summary?.trim();

  return sessionSummary
    ? `insufficient_sanity_sources: no approved Sanity sources matched retrieval needs ${needs} or concerns ${concerns}; session summary: ${sessionSummary}`
    : `insufficient_sanity_sources: no approved Sanity sources matched retrieval needs ${needs} or concerns ${concerns}`;
}

function createSanityDiagnostics(
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null,
  rawSources: GuideSiteSanitySourceDocument[],
  approvedSources: GuideSiteSanitySourceDocument[],
): string[] {
  if (approvedSources.length > 0) {
    return [];
  }

  const diagnostics = [createInsufficientSanitySourceDiagnostic(understanding, sessionContext)];
  const rejectedSourceIds = rawSources
    .filter((source) => !isApprovedSanitySourceDocument(source))
    .map((source) => source._id);

  if (rejectedSourceIds.length > 0) {
    diagnostics.push(`sanity_retrieval_rejected_unapproved_sources: ${formatList(rejectedSourceIds)}`);
  }

  return diagnostics;
}

function normalizeApprovedSources(sources: GuideSiteSanitySourceDocument[]): RetrievalResults["results"] {
  return sources.map((source, index) => normalizeSanitySourceDocument(source, index + 1));
}

function buildGuideSiteSanityRetrievalResult(
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null,
  rawSources: GuideSiteSanitySourceDocument[],
  adapterId: string,
  adapterLabel: string,
): GuideSiteRetrievalResult {
  const approvedSources = rawSources.filter(isApprovedSanitySourceDocument);
  const results = normalizeApprovedSources(approvedSources);
  const diagnostics = createSanityDiagnostics(understanding, sessionContext, rawSources, approvedSources);

  return {
    adapterId,
    adapterLabel,
    needs: [...understanding.retrievalNeeds],
    concerns: understanding.concerns.map((concern) => concern.key),
    results,
    diagnostics,
    coverage: {
      status: results.length > 0 ? "source_backed" : "empty_retrieval",
      matchedSourceIds: results.map((result) => result.sourceId),
    },
  };
}

async function loadGuideSiteSanitySourceDocuments(
  promptText: string,
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null,
  config: SanityQueryConfig,
  fetchImpl: typeof fetch,
): Promise<GuideSiteSanitySourceDocument[]> {
  const searchText = buildGuideSiteSanitySearchText(understanding, sessionContext);
  const queryPrompt = `${promptText} ${searchText}`.trim();
  const queryResult = await executeSanityRetrievalQueryPlan(buildSanityHybridQueryPlan(queryPrompt), config, fetchImpl);
  const sourceIds = queryResult.mergedContentEntities.map((candidate) => candidate._id);

  if (sourceIds.length === 0) {
    return [];
  }

  const docs = await executeSanityQuery<GuideSiteSanitySourceDocument[]>(
    config,
    `*[_id in $ids]{
      _id,
      _type,
      _rev,
      sourceKind,
      title,
      summary,
      body,
      contentMap,
      text
    }`,
    { ids: sourceIds },
    fetchImpl,
  );
  const docsById = new Map(docs.map((doc) => [doc._id, doc] as const));
  const missingIds = sourceIds.filter((sourceId) => !docsById.has(sourceId));

  if (missingIds.length > 0) {
    throw new Error(`Sanity GuideSite retrieval missing source documents for IDs: ${missingIds.join(", ")}`);
  }

  return sourceIds.map((sourceId) => docsById.get(sourceId) as GuideSiteSanitySourceDocument);
}

export function createSanityGuideSiteRetrievalAdapter(
  runner: GuideSiteSanityRetrievalQueryRunner,
  options: {
    id?: string;
    label?: string;
  } = {},
): GuideSiteRetrievalAdapter {
  const adapterId = options.id ?? DEFAULT_SANITY_ADAPTER_ID;
  const adapterLabel = options.label ?? DEFAULT_SANITY_ADAPTER_LABEL;

  return {
    id: adapterId,
    label: adapterLabel,
    retrieve(input: GuideSiteRetrievalInput, context?: PromptUnderstandingSessionContext): GuideSiteRetrievalResult {
      const sessionContext = context ?? null;
      const searchText = buildGuideSiteSanitySearchText(input, sessionContext);
      const rawSources = runner({
        searchText,
        understanding: input,
        sessionContext,
      });

      return buildGuideSiteSanityRetrievalResult(input, sessionContext, rawSources, adapterId, adapterLabel);
    },
  };
}

export function createSanityGuideSiteRetrievalAdapterResolver(
  config: SanityQueryConfig,
  fetchImpl: typeof fetch = fetch,
): GuideSiteSanityRetrievalAdapterResolver {
  return async (promptText, understanding, sessionContext) => {
    const rawSources = await loadGuideSiteSanitySourceDocuments(
      promptText,
      understanding,
      sessionContext ?? null,
      config,
      fetchImpl,
    );

    return createSanityGuideSiteRetrievalAdapter((query) => {
      const expectedSearchText = buildGuideSiteSanitySearchText(understanding, sessionContext ?? null);
      if (query.searchText !== expectedSearchText) {
        throw new Error(
          `Sanity GuideSite retrieval search text drifted for prompt ${promptText}: expected ${expectedSearchText}, got ${query.searchText}`,
        );
      }

      return rawSources;
    });
  };
}
