export type ConcernSurfacingCatalogEntry = {
  _id: string;
  title: string;
  contentMap: string;
};

export type SurfacedConcern = {
  concernId: string;
  rationale: string;
};

export type MissingConcernCandidate = {
  description: string;
  rationale: string;
};

export type ConcernSurfacingResult = {
  surfacedConcerns: SurfacedConcern[];
  missingConcernCandidates: MissingConcernCandidate[];
};

export type ConcernSurfacer = {
  surfaceConcerns(
    prompt: string,
    catalog: ConcernSurfacingCatalogEntry[],
  ): Promise<ConcernSurfacingResult>;
};
