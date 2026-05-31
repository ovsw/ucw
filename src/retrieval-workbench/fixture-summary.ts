import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.js";

export type FixtureSummary = {
  concernCount: number;
  nonConcernCount: number;
  contentEntityTypes: string[];
};

export function summarizeFixture(fixture: ParsedRetrievalWorkbenchFixture): FixtureSummary {
  const concernCount = fixture.documents.filter((document) => document._type === "concern").length;
  const nonConcernCount = fixture.documents.length - concernCount;
  const contentEntityTypes = [
    ...new Set(
      fixture.documents
        .filter((document) => document._type !== "concern")
        .map((document) => document._type)
        .sort(),
    ),
  ];

  return {
    concernCount,
    nonConcernCount,
    contentEntityTypes,
  };
}
