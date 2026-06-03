import { readFileSync } from "node:fs";
import type { PromptUnderstanding, RetrievalResult, RetrievalResults } from "./types.js";

const defaultSourcePackPath = "fixtures/guidesite-mvp/canonical-source-pack.json";
const retrievableSourceTypes = new Set(["campProgram", "policy"]);

type SanityReference = {
  _type: "reference";
  _ref: string;
};

type CanonicalSource = {
  _id: string;
  _type: string;
  _rev: string;
  title: string;
  contentMap?: string;
  summary?: string;
  body?: string;
  relatedConcerns?: SanityReference[];
};

type CanonicalSourcePack = {
  fixtureVersion: 1;
  description: string;
  documents: CanonicalSource[];
};

function assertNonEmptyString(value: unknown, diagnostic: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid GuideSite source fixture: ${diagnostic}`);
  }
}

function parseCanonicalSourcePack(rawFixture: string): CanonicalSourcePack {
  const parsedFixture = JSON.parse(rawFixture) as CanonicalSourcePack;

  if (parsedFixture.fixtureVersion !== 1 || !Array.isArray(parsedFixture.documents)) {
    throw new Error("Invalid GuideSite source fixture: expected fixtureVersion 1 with documents");
  }

  const seenSourceIds = new Set<string>();
  for (const [index, document] of parsedFixture.documents.entries()) {
    assertNonEmptyString(document._id, `documents[${index}]._id is required`);
    assertNonEmptyString(document._type, `${document._id}._type is required`);
    assertNonEmptyString(document._rev, `${document._id}._rev is required`);
    assertNonEmptyString(document.title, `${document._id}.title is required`);

    if (seenSourceIds.has(document._id)) {
      throw new Error(`Invalid GuideSite source fixture: duplicate source ID ${document._id}`);
    }
    seenSourceIds.add(document._id);

    if (!document.summary?.trim() && !document.body?.trim() && !document.contentMap?.trim()) {
      throw new Error(`Invalid GuideSite source fixture: ${document._id} needs summary, body, or contentMap`);
    }
  }

  return parsedFixture;
}

export function loadCanonicalGuideSiteSourcePack(sourcePackPath = defaultSourcePackPath): CanonicalSourcePack {
  return parseCanonicalSourcePack(readFileSync(sourcePackPath, "utf8"));
}

function chooseFieldPath(source: CanonicalSource): string {
  if (source.summary?.trim()) {
    return "summary";
  }

  if (source.body?.trim()) {
    return "body";
  }

  return "contentMap";
}

function normalizeRetrievalResult(source: CanonicalSource, rank: number): RetrievalResult {
  return {
    sourceId: source._id,
    sourceType: source._type,
    title: source.title,
    rank,
    fieldPath: chooseFieldPath(source),
    sourceRevision: source._rev,
  };
}

function sourceIdsForUnderstanding(understanding: PromptUnderstanding): string[] {
  const needSet = new Set(understanding.retrievalNeeds);
  const concernSet = new Set(understanding.concerns.map((concern) => concern.key));
  const sourceIds: string[] = [];

  if (needSet.has("overnight_readiness")) {
    sourceIds.push("program_overnight");
  }

  if (needSet.has("homesickness_support") || concernSet.has("homesickness")) {
    sourceIds.push("policy_homesickness", "policy_parent_communication");
  }

  return [...new Set(sourceIds)];
}

export function retrieveGuideSiteFixtureSources(
  understanding: PromptUnderstanding,
  sourcePack: CanonicalSourcePack = loadCanonicalGuideSiteSourcePack(),
): RetrievalResults {
  const documentsById = new Map(sourcePack.documents.map((document) => [document._id, document]));
  const sourceIds = sourceIdsForUnderstanding(understanding);
  const results = sourceIds.map((sourceId, index) => {
    const source = documentsById.get(sourceId);
    if (!source) {
      throw new Error(`GuideSite fixture retrieval referenced missing source: ${sourceId}`);
    }

    if (!retrievableSourceTypes.has(source._type)) {
      throw new Error(`GuideSite fixture retrieval referenced non-retrievable source type: ${sourceId}`);
    }

    return normalizeRetrievalResult(source, index + 1);
  });

  return {
    needs: [...understanding.retrievalNeeds],
    concerns: understanding.concerns.map((concern) => concern.key),
    results,
  };
}
