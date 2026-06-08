import { shapeSanitySearchQuery } from "../retrieval-workbench/search-query-shaping.ts";
import { executeSanityQuery, executeSanityRetrievalQueryPlan } from "../retrieval-workbench/sanity-client.ts";
import { buildSanityHybridQueryPlan } from "../retrieval-workbench/sanity-retrieval.ts";
import type { SanityQueryConfig } from "../retrieval-workbench/sanity-config.ts";
import type { PromptUnderstanding, PromptUnderstandingSessionContext, RetrievalResult, RetrievalResults } from "./types.ts";
import type { GuideSiteRetrievalAdapter, GuideSiteRetrievalInput, GuideSiteRetrievalResult } from "./fixture-retrieval.ts";

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
type GuideSiteSanityRetrievalQueryResult = Awaited<ReturnType<typeof executeSanityRetrievalQueryPlan>>;

const DEFAULT_SANITY_ADAPTER_ID = "sanityHybrid";
const DEFAULT_SANITY_ADAPTER_LABEL = "Sanity Hybrid";
const APPROVED_SOURCE_KIND = "sourceOfTruth";
const APPROVED_SOURCE_TYPES = new Set(["campProgram", "policy", "concern", "promptTemplate"]);


type SelectedSanitySourceText = {
  fieldPath: string;
  sourceText: string;
};
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

function selectSanitySourceText(source: GuideSiteSanitySourceDocument): SelectedSanitySourceText | null {
  const summary = source.summary?.trim();
  if (summary) {
    return { fieldPath: "summary", sourceText: summary };
  }

  const body = source.body?.trim();
  if (body) {
    return { fieldPath: "body", sourceText: body };
  }

  const text = source.text?.trim();
  if (text) {
    return { fieldPath: "text", sourceText: text };
  }

  const contentMap = source.contentMap?.trim();
  if (contentMap) {
    return { fieldPath: "contentMap", sourceText: contentMap };
  }

  return null;
}

function chooseSourceRevision(source: GuideSiteSanitySourceDocument): string {
  return source._rev?.trim() || "unknown";
}

function normalizeSanitySourceDocument(
  source: GuideSiteSanitySourceDocument,
  rank: number,
  selectedText: SelectedSanitySourceText,
): RetrievalResult {
  return {
    sourceId: source._id,
    sourceType: source._type,
    title: source.title,
    rank,
    fieldPath: selectedText.fieldPath,
    sourceRevision: chooseSourceRevision(source),
    sourceText: selectedText.sourceText,
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
  approvedSourcesWithSelectedText: GuideSiteSanitySourceDocument[],
): string[] {
  const diagnostics: string[] = [];

  if (approvedSourcesWithSelectedText.length === 0) {
    diagnostics.push(createInsufficientSanitySourceDiagnostic(understanding, sessionContext));
  }

  const rejectedSourceIds = rawSources
    .filter((source) => !isApprovedSanitySourceDocument(source))
    .map((source) => source._id);

  if (rejectedSourceIds.length > 0 && approvedSourcesWithSelectedText.length === 0) {
    diagnostics.push(`sanity_retrieval_rejected_unapproved_sources: ${formatList(rejectedSourceIds)}`);
  }

  const missingSelectedTextSourceIds = approvedSources
    .filter((source) => !selectSanitySourceText(source))
    .map((source) => source._id);

  if (missingSelectedTextSourceIds.length > 0) {
    diagnostics.push(`sanity_retrieval_missing_selected_source_text: ${formatList(missingSelectedTextSourceIds)}`);
  }

  return diagnostics;
}

function normalizeApprovedSources(sources: GuideSiteSanitySourceDocument[]): RetrievalResults["results"] {
  return sources.map((source, index) => {
    const selectedText = selectSanitySourceText(source);
    if (!selectedText) {
      throw new Error(`Cannot normalize Sanity source without selected text: ${source._id}`);
    }

    return normalizeSanitySourceDocument(source, index + 1, selectedText);
  });
}

function buildGuideSiteSanityRetrievalResult(
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext | null,
  rawSources: GuideSiteSanitySourceDocument[],
  adapterId: string,
  adapterLabel: string,
): GuideSiteRetrievalResult {
  const approvedSources = rawSources.filter(isApprovedSanitySourceDocument);
  const approvedSourcesWithSelectedText = approvedSources.filter((source) => selectSanitySourceText(source) !== null);
  const results = normalizeApprovedSources(approvedSourcesWithSelectedText);
  const diagnostics = createSanityDiagnostics(
    understanding,
    sessionContext,
    rawSources,
    approvedSources,
    approvedSourcesWithSelectedText,
  );

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

function collectOrderedGuideSiteSanitySourceIds(queryResult: GuideSiteSanityRetrievalQueryResult): string[] {
  const orderedSourceIds: string[] = [];
  const seenSourceIds = new Set<string>();

  for (const candidate of [...queryResult.matchedConcerns, ...queryResult.mergedContentEntities]) {
    if (seenSourceIds.has(candidate._id)) {
      continue;
    }

    seenSourceIds.add(candidate._id);
    orderedSourceIds.push(candidate._id);
  }

  return orderedSourceIds;
}

async function loadGuideSiteSanitySourceDocuments(
  queryPrompt: string,
  config: SanityQueryConfig,
  fetchImpl: typeof fetch,
): Promise<GuideSiteSanitySourceDocument[]> {
  const queryResult = await executeSanityRetrievalQueryPlan(buildSanityHybridQueryPlan(queryPrompt), config, fetchImpl);
  const sourceIds = collectOrderedGuideSiteSanitySourceIds(queryResult);

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

function assertSanitySourceSearchText(
  expectedSearchText: string,
  actualSearchText: string,
  promptText: string,
): void {
  if (actualSearchText !== expectedSearchText) {
    throw new Error(
      `Sanity GuideSite retrieval search text drifted for prompt ${promptText}: expected ${expectedSearchText}, got ${actualSearchText}`,
    );
  }
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
    const resolvedSessionContext = sessionContext ?? null;
    const searchText = buildGuideSiteSanitySearchText(understanding, resolvedSessionContext);
    const queryPrompt = `${promptText} ${searchText}`.trim();
    const rawSources = await loadGuideSiteSanitySourceDocuments(queryPrompt, config, fetchImpl);

    return createSanityGuideSiteRetrievalAdapter((query) => {
      assertSanitySourceSearchText(searchText, query.searchText, promptText);
      return rawSources;
    });
  };
}
