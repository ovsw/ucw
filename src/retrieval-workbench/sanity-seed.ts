import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";
import type { SanityReference } from "./types.ts";

export type SanitySeedDocument = ParsedRetrievalWorkbenchFixture["documents"][number] & {
  relatedConcernTitles?: string;
};

export type SanitySeedDocumentRef = Pick<SanitySeedDocument, "_id" | "_type">;

export type SanitySeedTypeMismatch = {
  id: string;
  expectedType: string;
  actualType: string;
};

export type SanitySeedParityReport = {
  missingDocumentIds: string[];
  extraDocumentIds: string[];
  typeMismatches: SanitySeedTypeMismatch[];
  isExactMatch: boolean;
  hasWarnings: boolean;
};

export type SanitySeedAdapter = {
  upsertDocuments(documents: SanitySeedDocument[]): Promise<unknown> | unknown;
  listDocuments(): Promise<SanitySeedDocumentRef[]> | SanitySeedDocumentRef[];
};

export type SanitySeedResult = {
  documents: SanitySeedDocument[];
  parity: SanitySeedParityReport;
};

function buildConcernTitleById(fixture: ParsedRetrievalWorkbenchFixture): Map<string, string> {
  return new Map(
    fixture.documents
      .filter((document) => document._type === "concern")
      .map((document) => [document._id, document.title]),
  );
}

function sortIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function isSanitySystemDocumentId(id: string): boolean {
  return id.startsWith("_");
}

function isContentEntityDocument(
  document: SanitySeedDocument,
): document is SanitySeedDocument & { relatedConcerns: SanityReference[] } {
  return document._type !== "concern" && Array.isArray(document.relatedConcerns);
}

export function buildSanitySeedDocuments(fixture: ParsedRetrievalWorkbenchFixture): SanitySeedDocument[] {
  const concernTitleById = buildConcernTitleById(fixture);

  return fixture.documents.map((document) => {
    const clonedDocument = structuredClone(document);

    if (!isContentEntityDocument(clonedDocument)) {
      return clonedDocument;
    }

    return {
      ...clonedDocument,
      relatedConcernTitles: clonedDocument.relatedConcerns
        .map((reference) => concernTitleById.get(reference._ref))
        .filter((title): title is string => Boolean(title))
        .join(" "),
    };
  });
}

export function compareSanitySeedParity(
  expectedDocuments: SanitySeedDocumentRef[],
  actualDocuments: SanitySeedDocumentRef[],
): SanitySeedParityReport {
  const expectedById = new Map(expectedDocuments.map((document) => [document._id, document]));
  const comparableActualDocuments = actualDocuments.filter(
    (document) => expectedById.has(document._id) || !isSanitySystemDocumentId(document._id),
  );
  const actualById = new Map(comparableActualDocuments.map((document) => [document._id, document]));

  const missingDocumentIds: string[] = [];
  for (const expectedDocument of expectedDocuments) {
    if (!actualById.has(expectedDocument._id)) {
      missingDocumentIds.push(expectedDocument._id);
    }
  }

  const extraDocumentIds: string[] = [];
  for (const actualDocument of comparableActualDocuments) {
    if (!expectedById.has(actualDocument._id)) {
      extraDocumentIds.push(actualDocument._id);
    }
  }

  const typeMismatchIds: string[] = [];
  for (const expectedDocument of expectedDocuments) {
    const actualDocument = actualById.get(expectedDocument._id);

    if (!actualDocument || actualDocument._type === expectedDocument._type) {
      continue;
    }

    typeMismatchIds.push(expectedDocument._id);
  }

  const typeMismatches = sortIds(typeMismatchIds).map((id) => {
    const expected = expectedById.get(id);
    const actual = actualById.get(id);

    if (!expected || !actual) {
      throw new Error(`Unable to compare Sanity document parity for ${id}.`);
    }

    return {
      id,
      expectedType: expected._type,
      actualType: actual._type,
    };
  });

  return {
    missingDocumentIds: sortIds(missingDocumentIds),
    extraDocumentIds: sortIds(extraDocumentIds),
    typeMismatches,
    isExactMatch:
      missingDocumentIds.length === 0 && extraDocumentIds.length === 0 && typeMismatches.length === 0,
    hasWarnings: extraDocumentIds.length > 0 || typeMismatches.length > 0,
  };
}

export async function seedSanityFixture(
  fixture: ParsedRetrievalWorkbenchFixture,
  adapter: SanitySeedAdapter,
): Promise<SanitySeedResult> {
  const documents = buildSanitySeedDocuments(fixture);

  await adapter.upsertDocuments(documents);

  const actualDocuments = await adapter.listDocuments();
  const parity = compareSanitySeedParity(
    fixture.documents.map((document) => ({ _id: document._id, _type: document._type })),
    actualDocuments,
  );

  return {
    documents,
    parity,
  };
}
