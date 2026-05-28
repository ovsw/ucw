export type SanityReference = {
  _type: "reference";
  _ref: string;
};

export type ConcernDocument = {
  _id: string;
  _type: "concern";
  title: string;
  contentMap: string;
  concernArea: string;
  parentSignals: string[];
  relatedConcerns?: SanityReference[];
};

export type ContentEntityDocument = {
  _id: string;
  _type: string;
  title: string;
  contentMap: string;
  relatedConcerns: SanityReference[];
  [field: string]: unknown;
};

export type ParentPromptExpectation = {
  _id: string;
  prompt: string;
  expectedConcernIds: string[];
  requiredContentEntityIds: string[];
  supportingContentEntityIds?: string[];
  requiredSourceOfTruthIds?: string[];
};

export type RetrievalWorkbenchFixture = {
  fixtureVersion: 1;
  description: string;
  documents: Array<ConcernDocument | ContentEntityDocument>;
  goldSet: ParentPromptExpectation[];
};
