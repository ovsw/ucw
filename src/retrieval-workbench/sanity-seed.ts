import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";

export type SanitySeedDocument = ParsedRetrievalWorkbenchFixture["documents"][number];

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

function sortIds(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function isSanitySystemDocumentId(id: string): boolean {
  return id.startsWith("_");
}

export function buildSanitySeedDocuments(fixture: ParsedRetrievalWorkbenchFixture): SanitySeedDocument[] {
  return fixture.documents.map((document) => structuredClone(document));
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
