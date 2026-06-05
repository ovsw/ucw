import { defineField, defineType } from "sanity";

const relatedConcernReferences = defineField({
  name: "relatedConcerns",
  title: "Related concerns",
  type: "array",
  of: [{ type: "reference", to: [{ type: "concern" }] }],
});

const sourceFields = [
  defineField({
    name: "title",
    title: "Title",
    type: "string",
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: "contentMap",
    title: "Content map",
    type: "text",
    rows: 4,
    validation: (rule) => rule.required(),
  }),
  defineField({
    name: "sourceKind",
    title: "Source kind",
    type: "string",
  }),
  relatedConcernReferences,
];

function createSourceDocumentType(name: string, title: string) {
  return defineType({
    name,
    title,
    type: "document",
    fields: sourceFields,
    preview: {
      select: {
        title: "title",
        subtitle: "contentMap",
      },
    },
  });
}

export const studioSchemaTypes = [
  defineType({
    name: "concern",
    title: "Concern",
    type: "document",
    fields: [
      defineField({
        name: "title",
        title: "Title",
        type: "string",
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: "contentMap",
        title: "Content map",
        type: "text",
        rows: 4,
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: "concernArea",
        title: "Concern area",
        type: "string",
        validation: (rule) => rule.required(),
      }),
      defineField({
        name: "parentSignals",
        title: "Parent signals",
        type: "array",
        of: [{ type: "string" }],
        validation: (rule) => rule.required().min(1),
      }),
      defineField({
        name: "sourceKind",
        title: "Source kind",
        type: "string",
      }),
      relatedConcernReferences,
    ],
    preview: {
      select: {
        title: "title",
        subtitle: "concernArea",
      },
    },
  }),
  createSourceDocumentType("camperRule", "Camper rule"),
  createSourceDocumentType("checklist", "Checklist"),
  createSourceDocumentType("claim", "Claim"),
  createSourceDocumentType("guide", "Guide"),
  createSourceDocumentType("parentRequirement", "Parent requirement"),
  createSourceDocumentType("policy", "Policy"),
  createSourceDocumentType("procedure", "Procedure"),
  createSourceDocumentType("program", "Program"),
  createSourceDocumentType("protocol", "Protocol"),
  createSourceDocumentType("session", "Session"),
  createSourceDocumentType("staffStandard", "Staff standard"),
  createSourceDocumentType("testimonial", "Testimonial"),
  createSourceDocumentType("trainingStandard", "Training standard"),
  createSourceDocumentType("transportationRoute", "Transportation route"),
];
