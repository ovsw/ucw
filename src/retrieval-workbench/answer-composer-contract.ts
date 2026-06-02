import { z } from "zod";
import type { AnswerSourceMaterial, AnswerSourceSnippet } from "./answer-source-material.js";

export const answerComposerJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "draft", "citedSources", "claims", "diagnostics"],
  properties: {
    status: { type: "string", enum: ["composed"] },
    draft: { type: "string", minLength: 1 },
    citedSources: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceId", "snippetId", "claimIds"],
        properties: {
          sourceId: { type: "string", minLength: 1 },
          snippetId: { type: "string", minLength: 1 },
          claimIds: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 1 },
          },
        },
      },
    },
    claims: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["claimId", "text", "evidence"],
        properties: {
          claimId: { type: "string", minLength: 1 },
          text: { type: "string", minLength: 1 },
          evidence: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sourceId", "snippetId"],
              properties: {
                sourceId: { type: "string", minLength: 1 },
                snippetId: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
    diagnostics: {
      type: "object",
      additionalProperties: false,
      required: ["unsupportedClaims", "missingSourceOfTruth", "followUpQuestions"],
      properties: {
        unsupportedClaims: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "reason"],
            properties: {
              text: { type: "string", minLength: 1 },
              reason: { type: "string", minLength: 1 },
            },
          },
        },
        missingSourceOfTruth: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
        followUpQuestions: {
          type: "array",
          items: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

const evidenceRefSchema = z
  .object({
    sourceId: z.string().min(1),
    snippetId: z.string().min(1),
  })
  .strict();

const citedSourceSchema = evidenceRefSchema
  .extend({
    claimIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

const claimSchema = z
  .object({
    claimId: z.string().min(1),
    text: z.string().min(1),
    evidence: z.array(evidenceRefSchema).min(1),
  })
  .strict();

const unsupportedClaimSchema = z
  .object({
    text: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const answerComposerProviderResultSchema = z
  .object({
    status: z.literal("composed"),
    draft: z.string().min(1),
    citedSources: z.array(citedSourceSchema),
    claims: z.array(claimSchema).min(1),
    diagnostics: z
      .object({
        unsupportedClaims: z.array(unsupportedClaimSchema),
        missingSourceOfTruth: z.array(z.string().min(1)),
        followUpQuestions: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

export type AnswerComposerEvidenceRef = z.infer<typeof evidenceRefSchema>;
export type AnswerComposerCitedSource = z.infer<typeof citedSourceSchema>;
export type AnswerComposerClaim = z.infer<typeof claimSchema>;
export type AnswerComposerDiagnostics = z.infer<typeof answerComposerProviderResultSchema>["diagnostics"];
export type AnswerComposerProviderResult = z.infer<typeof answerComposerProviderResultSchema>;
export type AnswerComposerValidatedProviderResult = AnswerComposerProviderResult & {
  citationDiagnostics?: string[];
};

export type AnswerComposerValidationContext = {
  promptId?: string;
  sourceStrategyId?: string;
  selectedSourceIds?: string[];
};

export type AnswerComposerValidationOptions = {
  context?: AnswerComposerValidationContext;
  repairCitedSourceClaimIds?: boolean;
};

export type AnswerComposerCitationRepair =
  | {
      kind: "claimIds";
      sourceId: string;
      snippetId: string;
      removedClaimIds: string[];
      addedClaimIds: string[];
    }
  | {
      kind: "rebuiltCitedSources";
      invalidClaimIds: string[];
      citedSourceCount: number;
    };

export type AnswerComposerValidationResult = {
  result: AnswerComposerProviderResult;
  citationDiagnostics: string[];
};

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function buildSnippetLookup(sourceMaterials: AnswerSourceMaterial[]): Map<string, AnswerSourceSnippet> {
  return new Map(sourceMaterials.flatMap((material) => material.snippets.map((snippet) => [snippet.snippetId, snippet])));
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }

    seen.add(value);
  }

  return [...duplicates].sort();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function formatValidationContext(context: AnswerComposerValidationContext | undefined): string {
  if (!context) {
    return "";
  }

  const parts: string[] = [];

  if (context.promptId) {
    parts.push(`prompt ${context.promptId}`);
  }

  if (context.sourceStrategyId) {
    parts.push(`source strategy ${context.sourceStrategyId}`);
  }

  if (context.selectedSourceIds && context.selectedSourceIds.length > 0) {
    parts.push(`selected sources ${formatList(context.selectedSourceIds)}`);
  }

  return parts.length > 0 ? ` for ${parts.join("; ")}` : "";
}

function claimIdsForEvidenceRef(
  result: AnswerComposerProviderResult,
  sourceId: string,
  snippetId: string,
): string[] {
  return result.claims
    .filter((claim) =>
      claim.evidence.some((evidence) => evidence.sourceId === sourceId && evidence.snippetId === snippetId),
    )
    .map((claim) => claim.claimId);
}

function findUnknownCitedClaimIds(result: AnswerComposerProviderResult): string[] {
  const validClaimIds = new Set(result.claims.map((claim) => claim.claimId));

  return uniqueSorted(
    result.citedSources.flatMap((citedSource) =>
      citedSource.claimIds.filter((claimId) => !validClaimIds.has(claimId)),
    ),
  );
}

function buildCitedSourcesFromClaimEvidence(result: AnswerComposerProviderResult): AnswerComposerCitedSource[] {
  const citedSourcesByEvidenceRef = new Map<string, AnswerComposerCitedSource>();

  for (const claim of result.claims) {
    for (const evidence of claim.evidence) {
      const key = `${evidence.sourceId}#${evidence.snippetId}`;
      const citedSource = citedSourcesByEvidenceRef.get(key);

      if (citedSource) {
        citedSource.claimIds = uniqueSorted([...citedSource.claimIds, claim.claimId]);
        continue;
      }

      citedSourcesByEvidenceRef.set(key, {
        sourceId: evidence.sourceId,
        snippetId: evidence.snippetId,
        claimIds: [claim.claimId],
      });
    }
  }

  return [...citedSourcesByEvidenceRef.values()];
}

function cloneProviderResultWithCitedSources(
  result: AnswerComposerProviderResult,
  citedSources: AnswerComposerCitedSource[],
): AnswerComposerProviderResult {
  return {
    ...result,
    citedSources,
    claims: result.claims.map((claim) => ({
      ...claim,
      evidence: claim.evidence.map((evidence) => ({ ...evidence })),
    })),
    diagnostics: {
      unsupportedClaims: result.diagnostics.unsupportedClaims.map((claim) => ({ ...claim })),
      missingSourceOfTruth: [...result.diagnostics.missingSourceOfTruth],
      followUpQuestions: [...result.diagnostics.followUpQuestions],
    },
  };
}

function repairCitedSourceClaimIds(result: AnswerComposerProviderResult): {
  result: AnswerComposerProviderResult;
  repairs: AnswerComposerCitationRepair[];
} {
  const validClaimIds = new Set(result.claims.map((claim) => claim.claimId));
  const repairs: AnswerComposerCitationRepair[] = [];
  const citedSources = result.citedSources.map((citedSource) => {
    const validCitedClaimIds = citedSource.claimIds.filter((claimId) => validClaimIds.has(claimId));
    const invalidCitedClaimIds = citedSource.claimIds.filter((claimId) => !validClaimIds.has(claimId));

    if (invalidCitedClaimIds.length === 0) {
      return {
        ...citedSource,
        claimIds: [...citedSource.claimIds],
      };
    }

    const inferredClaimIds = claimIdsForEvidenceRef(result, citedSource.sourceId, citedSource.snippetId);
    const repairedClaimIds = uniqueSorted([...validCitedClaimIds, ...inferredClaimIds]);

    if (repairedClaimIds.length === 0) {
      return {
        ...citedSource,
        claimIds: [...citedSource.claimIds],
      };
    }

    repairs.push({
      kind: "claimIds",
      sourceId: citedSource.sourceId,
      snippetId: citedSource.snippetId,
      removedClaimIds: uniqueSorted(invalidCitedClaimIds),
      addedClaimIds: repairedClaimIds.filter((claimId) => !validCitedClaimIds.includes(claimId)),
    });

    return {
      ...citedSource,
      claimIds: repairedClaimIds,
    };
  });

  const repairedResult = cloneProviderResultWithCitedSources(result, citedSources);
  const unresolvedCitedClaimIds = findUnknownCitedClaimIds(repairedResult);

  if (unresolvedCitedClaimIds.length === 0) {
    return {
      result: repairedResult,
      repairs,
    };
  }

  const rebuiltCitedSources = buildCitedSourcesFromClaimEvidence(result);
  repairs.push({
    kind: "rebuiltCitedSources",
    invalidClaimIds: unresolvedCitedClaimIds,
    citedSourceCount: rebuiltCitedSources.length,
  });

  return {
    result: cloneProviderResultWithCitedSources(result, rebuiltCitedSources),
    repairs,
  };
}

function formatCitationRepair(repair: AnswerComposerCitationRepair): string {
  if (repair.kind === "rebuiltCitedSources") {
    return `Rebuilt cited source list from claim evidence after invalid cited source claim IDs: ${formatList(
      repair.invalidClaimIds,
    )}; cited sources: ${repair.citedSourceCount}`;
  }

  return `Repaired cited source claim IDs for ${repair.sourceId}#${repair.snippetId}: removed ${formatList(
    repair.removedClaimIds,
  )}; added ${formatList(repair.addedClaimIds)}`;
}

export function validateAnswerComposerProviderResultDetailed(
  rawResult: unknown,
  sourceMaterials: AnswerSourceMaterial[],
  options: AnswerComposerValidationOptions = {},
): AnswerComposerValidationResult {
  const parsedResult = answerComposerProviderResultSchema.parse(rawResult);
  const repaired = options.repairCitedSourceClaimIds
    ? repairCitedSourceClaimIds(parsedResult)
    : { result: parsedResult, repairs: [] };
  const result = repaired.result;
  const knownSourceIds = new Set(sourceMaterials.map((material) => material.sourceId));
  const snippetsById = buildSnippetLookup(sourceMaterials);
  const unknownSourceIds = new Set<string>();
  const unknownSnippetIds = new Set<string>();
  const crossSourceSnippetReferences = new Set<string>();

  function validateEvidenceRef(ref: AnswerComposerEvidenceRef): void {
    if (!knownSourceIds.has(ref.sourceId)) {
      unknownSourceIds.add(ref.sourceId);
    }

    const snippet = snippetsById.get(ref.snippetId);
    if (!snippet) {
      unknownSnippetIds.add(ref.snippetId);
      return;
    }

    if (snippet.sourceId !== ref.sourceId) {
      crossSourceSnippetReferences.add(`${ref.sourceId} -> ${ref.snippetId}`);
    }
  }

  for (const claim of result.claims) {
    for (const evidence of claim.evidence) {
      validateEvidenceRef(evidence);
    }
  }

  for (const citedSource of result.citedSources) {
    validateEvidenceRef(citedSource);
  }

  const claimIds = result.claims.map((claim) => claim.claimId);
  const duplicateClaimIds = findDuplicates(claimIds);
  const unknownCitedClaimIds = findUnknownCitedClaimIds(result);

  const validationFailures: string[] = [];

  if (unknownSourceIds.size > 0) {
    validationFailures.push(`unknown source ids: ${formatList([...unknownSourceIds].sort())}`);
  }

  if (unknownSnippetIds.size > 0) {
    validationFailures.push(`unknown snippet ids: ${formatList([...unknownSnippetIds].sort())}`);
  }

  if (crossSourceSnippetReferences.size > 0) {
    validationFailures.push(
      `cross-source snippet references: ${formatList([...crossSourceSnippetReferences].sort())}`,
    );
  }

  if (duplicateClaimIds.length > 0) {
    validationFailures.push(`duplicate claim ids: ${formatList(duplicateClaimIds)}`);
  }

  if (unknownCitedClaimIds.length > 0) {
    validationFailures.push(`cited source claim references outside claims: ${formatList(unknownCitedClaimIds)}`);
  }

  if (validationFailures.length > 0) {
    throw new Error(
      `Answer Composer citation validation failed${formatValidationContext(options.context)}: ${validationFailures.join(
        "; ",
      )}.`,
    );
  }

  return {
    result,
    citationDiagnostics: repaired.repairs.map(formatCitationRepair),
  };
}

export function validateAnswerComposerProviderResult(
  rawResult: unknown,
  sourceMaterials: AnswerSourceMaterial[],
  options: AnswerComposerValidationOptions = {},
): AnswerComposerProviderResult {
  return validateAnswerComposerProviderResultDetailed(rawResult, sourceMaterials, options).result;
}
