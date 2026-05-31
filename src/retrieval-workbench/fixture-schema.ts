import { z } from "zod";
import { evaluationNoteCategories } from "./types.js";

const sanityReferenceSchema = z.object({
  _type: z.literal("reference"),
  _ref: z.string().min(1),
});

const evaluationNoteCategorySchema = z.enum(evaluationNoteCategories);

const baseDocumentSchema = z.object({
  _id: z.string().min(1),
  _type: z.string().min(1),
  title: z.string().min(1),
  contentMap: z.string().min(1),
});

const concernDocumentSchema = baseDocumentSchema.extend({
  _type: z.literal("concern"),
  concernArea: z.string().min(1),
  parentSignals: z.array(z.string().min(1)).min(1),
  relatedConcerns: z.array(sanityReferenceSchema).optional(),
});

const contentEntityDocumentSchema = baseDocumentSchema
  .extend({
    _type: z.string().min(1).refine((type) => type !== "concern", {
      message: "Use concernDocumentSchema for Concern documents",
    }),
    relatedConcerns: z.array(sanityReferenceSchema).min(1),
  })
  .passthrough();

const parentPromptExpectationSchema = z.object({
  _id: z.string().min(1),
  prompt: z.string().min(1),
  expectedConcernIds: z.array(z.string().min(1)).min(1),
  requiredContentEntityIds: z.array(z.string().min(1)).min(1),
  supportingContentEntityIds: z.array(z.string().min(1)).optional(),
  requiredSourceOfTruthIds: z.array(z.string().min(1)).optional(),
  evaluationNotes: z.array(evaluationNoteCategorySchema).min(1).optional(),
});

export const retrievalWorkbenchFixtureSchema = z
  .object({
    fixtureVersion: z.literal(1),
    description: z.string().min(1),
    documents: z.array(z.union([concernDocumentSchema, contentEntityDocumentSchema])),
    goldSet: z.array(parentPromptExpectationSchema),
  })
  .superRefine((fixture, context) => {
    const documentIds = new Set<string>();
    const concernIds = new Set<string>();

    for (const [index, document] of fixture.documents.entries()) {
      if (documentIds.has(document._id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["documents", index, "_id"],
          message: `Duplicate document id: ${document._id}`,
        });
      }

      documentIds.add(document._id);

      if (document._type === "concern") {
        concernIds.add(document._id);
      }
    }

    const concernCount = concernIds.size;
    const nonConcernCount = fixture.documents.length - concernCount;
    const promptCount = fixture.goldSet.length;

    if (concernCount < 6 || concernCount > 8) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documents"],
        message: `Expected 6 to 8 Concern documents, found ${concernCount}`,
      });
    }

    if (nonConcernCount < 15 || nonConcernCount > 25) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["documents"],
        message: `Expected 15 to 25 non-Concern Content Entities, found ${nonConcernCount}`,
      });
    }

    if (promptCount < 8 || promptCount > 12) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["goldSet"],
        message: `Expected 8 to 12 gold-set Parent Prompts, found ${promptCount}`,
      });
    }

    for (const [index, document] of fixture.documents.entries()) {
      const relatedConcerns = "relatedConcerns" in document ? document.relatedConcerns : undefined;

      for (const [referenceIndex, reference] of (relatedConcerns ?? []).entries()) {
        if (!concernIds.has(reference._ref)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["documents", index, "relatedConcerns", referenceIndex, "_ref"],
            message: `relatedConcerns must reference an existing Concern id: ${reference._ref}`,
          });
        }
      }
    }

    for (const [index, prompt] of fixture.goldSet.entries()) {
      const referencedIds = [
        ...prompt.expectedConcernIds,
        ...prompt.requiredContentEntityIds,
        ...(prompt.supportingContentEntityIds ?? []),
        ...(prompt.requiredSourceOfTruthIds ?? []),
      ];

      for (const referencedId of referencedIds) {
        if (!documentIds.has(referencedId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goldSet", index],
            message: `Gold-set prompt references missing document id: ${referencedId}`,
          });
        }
      }

      for (const expectedConcernId of prompt.expectedConcernIds) {
        if (!concernIds.has(expectedConcernId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["goldSet", index, "expectedConcernIds"],
            message: `Expected Concern id is not a Concern document: ${expectedConcernId}`,
          });
        }
      }
    }
  });

export type ParsedRetrievalWorkbenchFixture = z.infer<typeof retrievalWorkbenchFixtureSchema>;
