import type { SessionPatchOperation, SessionState } from "./types.js";

const visitorFactSources = new Set(["explicit", "inferred"]);
const visitorFactStatuses = new Set(["active", "superseded", "disputed"]);
const concernStatuses = new Set(["open", "addressed", "deferred"]);
const focusGoals = new Set([
  "answer_factual",
  "assess_fit",
  "gather_context",
  "address_concern",
  "compare_options",
]);
const suggestedPromptPurposes = new Set([
  "gather_fit_context",
  "clarify_constraints",
  "address_concern",
  "test_fit",
  "compare_options",
  "offer_contact_path",
  "handle_insufficient_material",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
}

function requireStringArray(value: unknown, message: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(message);
  }
}

function requireOneOf(value: unknown, allowedValues: Set<string>, message: string): asserts value is string {
  if (typeof value !== "string" || !allowedValues.has(value)) {
    throw new Error(message);
  }
}

function validateVisitorFact(value: unknown, prefix: string): void {
  if (!isRecord(value)) {
    throw new Error(`${prefix} upsertFact fact is required`);
  }
  if (!["string", "number", "boolean"].includes(typeof value.value)) {
    throw new Error(`${prefix} upsertFact fact.value must be a string, number, or boolean`);
  }
  requireOneOf(value.source, visitorFactSources, `${prefix} upsertFact fact.source is invalid`);
  requireOneOf(value.status, visitorFactStatuses, `${prefix} upsertFact fact.status is invalid`);
  if (value.sourceRunId !== undefined && typeof value.sourceRunId !== "string") {
    throw new Error(`${prefix} upsertFact fact.sourceRunId must be a string when provided`);
  }
}

function validateConcernState(value: unknown, prefix: string): void {
  if (!isRecord(value)) {
    throw new Error(`${prefix} upsertConcern concern is required`);
  }
  requireOneOf(value.status, concernStatuses, `${prefix} upsertConcern concern.status is invalid`);
  requireStringArray(value.sourceRunIds, `${prefix} upsertConcern concern.sourceRunIds must be a string array`);
}

function validateFocus(value: unknown, prefix: string): void {
  if (!isRecord(value)) {
    throw new Error(`${prefix} setFocus focus is required`);
  }
  if (value.goal !== null) {
    requireOneOf(value.goal, focusGoals, `${prefix} setFocus focus.goal is invalid`);
  }
  requireStringArray(value.contextNeeds, `${prefix} setFocus focus.contextNeeds must be a string array`);
}

function validateSuggestedPrompts(value: unknown, prefix: string): void {
  if (!Array.isArray(value)) {
    throw new Error(`${prefix} replaceSuggestedPrompts suggestedPrompts must be an array`);
  }

  value.forEach((prompt, promptIndex) => {
    const promptPrefix = `${prefix} replaceSuggestedPrompts suggestedPrompts[${promptIndex}]`;
    if (!isRecord(prompt)) {
      throw new Error(`${promptPrefix} must be an object`);
    }
    requireNonEmptyString(prompt.id, `${promptPrefix}.id is required`);
    requireNonEmptyString(prompt.text, `${promptPrefix}.text is required`);
    requireOneOf(prompt.purpose, suggestedPromptPurposes, `${promptPrefix}.purpose is invalid`);
    requireStringArray(prompt.contextNeeds, `${promptPrefix}.contextNeeds must be a string array`);
    requireStringArray(prompt.concerns, `${promptPrefix}.concerns must be a string array`);
    requireNonEmptyString(prompt.templateId, `${promptPrefix}.templateId is required`);
  });
}

function validateSessionPatchOperation(operation: unknown, index: number): asserts operation is SessionPatchOperation {
  const prefix = `Invalid Session Patch operation ${index}:`;

  if (!isRecord(operation)) {
    throw new Error(`${prefix} operation must be an object`);
  }

  switch (operation.type) {
    case "upsertFact":
      requireNonEmptyString(operation.key, `${prefix} upsertFact key is required`);
      validateVisitorFact(operation.fact, prefix);
      break;
    case "upsertConcern":
      requireNonEmptyString(operation.key, `${prefix} upsertConcern key is required`);
      validateConcernState(operation.concern, prefix);
      break;
    case "setFocus":
      validateFocus(operation.focus, prefix);
      break;
    case "replaceSuggestedPrompts":
      validateSuggestedPrompts(operation.suggestedPrompts, prefix);
      break;
    case "updateSummary":
      if (typeof operation.summary !== "string") {
        throw new Error(`${prefix} updateSummary summary must be a string`);
      }
      break;
    default:
      throw new Error(`${prefix} unsupported operation type ${String(operation.type)}`);
  }
}

export function applySessionPatchOperations(
  session: SessionState,
  operations: SessionPatchOperation[],
): SessionState {
  operations.forEach(validateSessionPatchOperation);
  const patched = structuredClone(session);

  for (const operation of operations) {
    switch (operation.type) {
      case "upsertFact":
        patched.visitorFacts[operation.key] = structuredClone(operation.fact);
        break;
      case "upsertConcern":
        patched.concerns[operation.key] = structuredClone(operation.concern);
        break;
      case "setFocus":
        patched.focus = structuredClone(operation.focus);
        break;
      case "replaceSuggestedPrompts":
        patched.suggestedPrompts = structuredClone(operation.suggestedPrompts);
        break;
      case "updateSummary":
        patched.summary = operation.summary;
        break;
    }
  }

  return patched;
}
