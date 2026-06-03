import type {
  AnswerComposition,
  AnswerCompositionValidationResult,
  AnswerSectionKind,
  RetrievalResults,
  SuggestedPrompt,
} from "./types.js";
import {
  getApprovedContextNeedPromptTemplate,
} from "./suggested-prompt-templates.js";

const allowedAnswerCompositionStatuses = new Set<AnswerComposition["status"]>([
  "needs_context",
  "answered",
  "partial",
  "fallback",
]);
const allowedSectionKinds = new Set<AnswerSectionKind>([
  "summary",
  "fit_status",
  "concerns",
  "context_needs",
  "suggested_prompts",
  "sources",
  "diagnostics",
]);
const allowedSuggestedPromptPurposes = new Set<SuggestedPrompt["purpose"]>([
  "gather_fit_context",
  "clarify_constraints",
  "address_concern",
  "test_fit",
  "compare_options",
  "offer_contact_path",
  "handle_insufficient_material",
]);
const allowedCompositionKeys = new Set(["status", "conversationalFraming", "sections", "suggestedPrompts", "citations", "diagnostics"]);
const allowedSectionKeys = new Set(["kind", "title", "body", "items", "sourceRefs"]);
const allowedSourceRefKeys = new Set(["sourceId", "sourceType", "title", "fieldPath", "sourceRevision"]);
const allowedSuggestedPromptKeys = new Set(["id", "text", "purpose", "contextNeeds", "concerns", "templateId"]);
type FactualSectionKind = "summary" | "concerns" | "sources";
const factualSectionKinds = new Set<FactualSectionKind>(["summary", "concerns", "sources"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, diagnostic: string, diagnostics: string[]): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    diagnostics.push(diagnostic);
    return false;
  }

  return true;
}

function requireStringArray(value: unknown, diagnostic: string, diagnostics: string[]): value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    diagnostics.push(diagnostic);
    return false;
  }

  return true;
}

function areStringArraysEqualIgnoringOrder(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();

  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function validateUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: Set<string>,
  prefix: string,
  diagnostics: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      diagnostics.push(`${prefix}_unknown_field_${key}`);
    }
  }
}

function normalizeRetrievalResults(retrieval: RetrievalResults | null): Map<string, RetrievalResults["results"][number]> {
  return new Map(retrieval?.results.map((result) => [result.sourceId, result]) ?? []);
}

function isFactualSectionKind(kind: unknown): kind is FactualSectionKind {
  return typeof kind === "string" && factualSectionKinds.has(kind as FactualSectionKind);
}

function validateSourceRefs(
  sectionIndex: number,
  sourceRefs: unknown,
  retrievalResultsById: Map<string, RetrievalResults["results"][number]>,
  diagnostics: string[],
): Set<string> {
  if (!Array.isArray(sourceRefs)) {
    diagnostics.push(`answer_composition_section_${sectionIndex}_source_refs_invalid`);
    return new Set();
  }

  const validSourceIds = new Set<string>();
  sourceRefs.forEach((sourceRef, sourceRefIndex) => {
    const prefix = `answer_composition_section_${sectionIndex}_source_ref_${sourceRefIndex}`;
    if (!isRecord(sourceRef)) {
      diagnostics.push(`${prefix}_invalid`);
      return;
    }

    validateUnknownKeys(sourceRef, allowedSourceRefKeys, prefix, diagnostics);

    if (
      !requireNonEmptyString(sourceRef.sourceId, `${prefix}_source_id_required`, diagnostics) ||
      !requireNonEmptyString(sourceRef.sourceType, `${prefix}_source_type_required`, diagnostics) ||
      !requireNonEmptyString(sourceRef.title, `${prefix}_title_required`, diagnostics) ||
      !requireNonEmptyString(sourceRef.fieldPath, `${prefix}_field_path_required`, diagnostics) ||
      !requireNonEmptyString(sourceRef.sourceRevision, `${prefix}_source_revision_required`, diagnostics)
    ) {
      return;
    }

    const retrievalResult = retrievalResultsById.get(sourceRef.sourceId);
    if (!retrievalResult) {
      diagnostics.push(`answer_composition_source_ref_${sourceRef.sourceId}_missing_retrieval_result`);
      return;
    }

    if (
      sourceRef.sourceType !== retrievalResult.sourceType ||
      sourceRef.title !== retrievalResult.title ||
      sourceRef.fieldPath !== retrievalResult.fieldPath ||
      sourceRef.sourceRevision !== retrievalResult.sourceRevision
    ) {
      diagnostics.push(`answer_composition_source_ref_${sourceRef.sourceId}_stale_retrieval_result`);
      return;
    }

    validSourceIds.add(sourceRef.sourceId);
  });

  return validSourceIds;
}

function validateSuggestedPrompts(suggestedPrompts: unknown, diagnostics: string[]): void {
  if (!Array.isArray(suggestedPrompts)) {
    diagnostics.push("answer_composition_suggested_prompts_invalid");
    return;
  }

  suggestedPrompts.forEach((suggestedPrompt, promptIndex) => {
    const prefix = `answer_composition_suggested_prompt_${promptIndex}`;
    if (!isRecord(suggestedPrompt)) {
      diagnostics.push(`${prefix}_invalid`);
      return;
    }

    validateUnknownKeys(suggestedPrompt, allowedSuggestedPromptKeys, prefix, diagnostics);

    if (
      !requireNonEmptyString(suggestedPrompt.id, `${prefix}_id_required`, diagnostics) ||
      !requireNonEmptyString(suggestedPrompt.text, `${prefix}_text_required`, diagnostics) ||
      !requireNonEmptyString(suggestedPrompt.templateId, `${prefix}_template_id_required`, diagnostics) ||
      !requireStringArray(suggestedPrompt.contextNeeds, `${prefix}_context_needs_invalid`, diagnostics) ||
      !requireStringArray(suggestedPrompt.concerns, `${prefix}_concerns_invalid`, diagnostics)
    ) {
      return;
    }

    if (typeof suggestedPrompt.purpose !== "string" || !allowedSuggestedPromptPurposes.has(suggestedPrompt.purpose as SuggestedPrompt["purpose"])) {
      diagnostics.push(`${prefix}_purpose_invalid`);
      return;
    }

    if (suggestedPrompt.contextNeeds.length !== 1) {
      diagnostics.push(`${prefix}_context_needs_mismatch`);
      return;
    }

    const [contextNeed] = suggestedPrompt.contextNeeds;
    const template = getApprovedContextNeedPromptTemplate(contextNeed);
    if (!template) {
      diagnostics.push(`${prefix}_unknown_context_need_${contextNeed}`);
      return;
    }

    if (suggestedPrompt.templateId !== template.templateId) {
      diagnostics.push(`${prefix}_template_id_mismatch`);
    }

    if (suggestedPrompt.text !== template.text) {
      diagnostics.push(`${prefix}_text_mismatch`);
    }

    if (suggestedPrompt.purpose !== template.purpose) {
      diagnostics.push(`${prefix}_purpose_mismatch`);
    }

    if (!areStringArraysEqualIgnoringOrder(suggestedPrompt.concerns, template.concerns)) {
      diagnostics.push(`${prefix}_concerns_mismatch`);
    }
  });
}

function validateSections(
  sections: unknown,
  retrievalResultsById: Map<string, RetrievalResults["results"][number]>,
  diagnostics: string[],
): Set<string> {
  if (!Array.isArray(sections)) {
    diagnostics.push("answer_composition_sections_invalid");
    return new Set();
  }

  const factualSourceIds = new Set<string>();
  sections.forEach((section, sectionIndex) => {
    const prefix = `answer_composition_section_${sectionIndex}`;
    if (!isRecord(section)) {
      diagnostics.push(`${prefix}_invalid`);
      return;
    }

    validateUnknownKeys(section, allowedSectionKeys, prefix, diagnostics);

    if (typeof section.kind !== "string" || !allowedSectionKinds.has(section.kind as AnswerSectionKind)) {
      diagnostics.push(`${prefix}_kind_invalid`);
    }

    if (!requireNonEmptyString(section.title, `${prefix}_title_required`, diagnostics)) {
      return;
    }

    if (!requireNonEmptyString(section.body, `${prefix}_body_required`, diagnostics)) {
      return;
    }

    if (section.items !== undefined && !requireStringArray(section.items, `${prefix}_items_invalid`, diagnostics)) {
      return;
    }

    if (section.sourceRefs !== undefined) {
      const sectionSourceIds = validateSourceRefs(sectionIndex, section.sourceRefs, retrievalResultsById, diagnostics);
      if (isFactualSectionKind(section.kind)) {
        sectionSourceIds.forEach((sourceId) => factualSourceIds.add(sourceId));
      }
    } else if (isFactualSectionKind(section.kind)) {
      diagnostics.push(`${prefix}_source_refs_required`);
    }
  });

  return factualSourceIds;
}

function validateCitations(
  citations: unknown,
  retrieval: RetrievalResults | null,
  retrievalResultsById: Map<string, RetrievalResults["results"][number]>,
  factualSourceIds: Set<string>,
  diagnostics: string[],
): void {
  if (!Array.isArray(citations)) {
    diagnostics.push("answer_composition_citations_invalid");
    return;
  }

  const citationSet = new Set<string>();
  const processedCitationIds = new Set<string>();
  for (const citation of citations) {
    if (typeof citation !== "string" || citation.trim().length === 0) {
      diagnostics.push("answer_composition_citation_invalid");
      continue;
    }

    citationSet.add(citation);
    if (processedCitationIds.has(citation)) {
      continue;
    }
    processedCitationIds.add(citation);

    if (retrieval && !retrievalResultsById.has(citation)) {
      diagnostics.push(`answer_composition_citation_${citation}_missing_retrieval_result`);
      continue;
    }

    if (!factualSourceIds.has(citation)) {
      diagnostics.push(`answer_composition_citation_${citation}_unsupported_source_ref`);
    }
  }

  for (const factualSourceId of factualSourceIds) {
    if (!citationSet.has(factualSourceId)) {
      diagnostics.push(`answer_composition_citation_${factualSourceId}_missing_required_citation`);
    }
  }
}

export function validateAnswerCompositionCandidate(
  composition: AnswerComposition,
  retrieval: RetrievalResults | null,
): AnswerCompositionValidationResult {
  const diagnostics: string[] = [];

  if (!isRecord(composition)) {
    return {
      valid: false,
      diagnostics: ["answer_composition_invalid"],
    };
  }

  validateUnknownKeys(composition, allowedCompositionKeys, "answer_composition", diagnostics);

  if (typeof composition.status !== "string" || !allowedAnswerCompositionStatuses.has(composition.status as AnswerComposition["status"])) {
    diagnostics.push("answer_composition_status_invalid");
  }

  requireNonEmptyString(composition.conversationalFraming, "answer_composition_conversational_framing_required", diagnostics);

  const retrievalResultsById = normalizeRetrievalResults(retrieval);
  const factualSourceIds = validateSections(composition.sections, retrievalResultsById, diagnostics);
  validateSuggestedPrompts(composition.suggestedPrompts, diagnostics);
  validateCitations(composition.citations, retrieval, retrievalResultsById, factualSourceIds, diagnostics);

  if (!Array.isArray(composition.diagnostics) || composition.diagnostics.some((diagnostic) => typeof diagnostic !== "string")) {
    diagnostics.push("answer_composition_diagnostics_invalid");
  }

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
