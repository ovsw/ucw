import type { PromptRetrievalResult } from "./retrieval-strategy.ts";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";
import type { ContentEntityDocument } from "./types.ts";

export const DEFAULT_ANSWER_COMPOSER_TOP_K = 5;

export type AnswerSourceSnippet = {
  sourceId: string;
  snippetId: string;
  field: string;
  text: string;
};

export type AnswerSourceMaterial = {
  sourceId: string;
  sourceType: string;
  title: string;
  rank: number;
  score: number;
  snippets: AnswerSourceSnippet[];
};

const BASE_SNIPPET_FIELDS = ["title", "contentMap"] as const;
const EXCLUDED_SNIPPET_FIELDS = new Set(["_id", "_type", "title", "contentMap", "relatedConcerns"]);

function isContentEntityDocument(
  document: ParsedRetrievalWorkbenchFixture["documents"][number] | undefined,
): document is ContentEntityDocument {
  return Boolean(document) && document?._type !== "concern";
}

function formatScalarSnippetValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function buildSnippetId(sourceId: string, field: string): string {
  return `${sourceId}:${field}`;
}

function buildSnippet(sourceId: string, field: string, value: unknown): AnswerSourceSnippet | null {
  const text = formatScalarSnippetValue(value);

  if (!text) {
    return null;
  }

  return {
    sourceId,
    snippetId: buildSnippetId(sourceId, field),
    field,
    text,
  };
}

function buildSourceSnippets(document: ContentEntityDocument): AnswerSourceSnippet[] {
  const snippets: AnswerSourceSnippet[] = [];

  for (const field of BASE_SNIPPET_FIELDS) {
    const snippet = buildSnippet(document._id, field, document[field]);

    if (snippet) {
      snippets.push(snippet);
    }
  }

  const scalarFields = Object.keys(document)
    .filter((field) => !field.startsWith("_") && !EXCLUDED_SNIPPET_FIELDS.has(field))
    .sort();

  for (const field of scalarFields) {
    const snippet = buildSnippet(document._id, field, document[field]);

    if (snippet) {
      snippets.push(snippet);
    }
  }

  return snippets;
}

export function validateAnswerComposerTopK(topK: number): number {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error("Answer Composer top-k must be a positive integer.");
  }

  return topK;
}

export function buildAnswerSourceMaterials(
  fixture: ParsedRetrievalWorkbenchFixture,
  retrievalResult: PromptRetrievalResult,
  topK: number = DEFAULT_ANSWER_COMPOSER_TOP_K,
): AnswerSourceMaterial[] {
  const normalizedTopK = validateAnswerComposerTopK(topK);
  const documentsById = new Map(fixture.documents.map((document) => [document._id, document]));

  return retrievalResult.mergedContentEntities.slice(0, normalizedTopK).map((match) => {
    const document = documentsById.get(match._id);

    if (!isContentEntityDocument(document)) {
      throw new Error(`Retrieval returned Content Entity outside the fixture: ${match._id}`);
    }

    return {
      sourceId: document._id,
      sourceType: document._type,
      title: document.title,
      rank: match.rank,
      score: match.score,
      snippets: buildSourceSnippets(document),
    };
  });
}
