import { validateAnswerCompositionCandidate } from "./answer-composition-contract.js";
import { getIndefiniteArticleForAge } from "./age-formatting.js";
import type { RunState, SessionPatch, SessionPatchOperation } from "./types.js";

function titleCaseIdentifier(identifier: string): string {
  return identifier
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function formatConcernStatusClause(labels: string[], status: "open" | "addressed"): string {
  if (labels.length === 0) {
    return "";
  }

  if (status === "addressed") {
    return labels.length === 1 ? `${labels[0]} has been addressed` : `${formatList(labels)} have been addressed`;
  }

  return labels.length === 1 ? `${labels[0]} remains an open concern` : `${formatList(labels)} remain open concerns`;
}

function collectActiveFacts(run: RunState): Map<string, string | number | boolean> {
  const activeFacts = new Map<string, string | number | boolean>();
  const session = run.snapshot;

  for (const [factKey, fact] of Object.entries(session.visitorFacts)) {
    if (fact.status === "active") {
      activeFacts.set(factKey, fact.value);
    }
  }

  for (const [factKey, fact] of Object.entries(run.understanding?.facts ?? {})) {
    activeFacts.set(factKey, fact.value);
  }

  return activeFacts;
}

function collectConcernStatusByKey(run: RunState): Map<string, "open" | "addressed" | "deferred"> {
  const concernStatusByKey = new Map<string, "open" | "addressed" | "deferred">();
  const session = run.snapshot;

  for (const [concernKey, concern] of Object.entries(session.concerns)) {
    concernStatusByKey.set(concernKey, concern.status);
  }

  for (const concern of run.understanding?.concerns ?? []) {
    concernStatusByKey.set(concern.key, concern.status);
  }

  const answerComposition = run.answerComposition;
  if (answerComposition?.status === "answered") {
    const addressedConcernSections = answerComposition.sections.filter((section) => section.kind === "concerns");
    for (const addressedConcernKey of addressedConcernSections.flatMap((section) => section.items ?? [])) {
      concernStatusByKey.set(addressedConcernKey, "addressed");
    }
  }

  return concernStatusByKey;
}

function createSessionSummary(run: RunState): string {
  const activeFacts = collectActiveFacts(run);
  const concernStatusByKey = collectConcernStatusByKey(run);
  const currentContextNeeds = run.understanding?.contextNeeds ?? [];

  const ageFact = activeFacts.get("child_age");
  const intro =
    typeof ageFact === "number"
      ? `Parent is assessing overnight camp Fit for ${getIndefiniteArticleForAge(ageFact)} ${ageFact}-year-old Child.`
      : "Parent is assessing overnight camp Fit for the Child.";

  const clauses: string[] = [];
  const priorSleepawayExperience = activeFacts.get("prior_sleepaway_experience");
  if (priorSleepawayExperience !== undefined) {
    if (typeof priorSleepawayExperience === "string" && priorSleepawayExperience === "slept_with_grandparents") {
      clauses.push("The Child has prior sleepaway experience with grandparents");
    } else {
      clauses.push("The Child has prior sleepaway experience");
    }
  }

  const openConcernLabels = [...concernStatusByKey.entries()]
    .filter(([, status]) => status === "open")
    .map(([concernKey]) => titleCaseIdentifier(concernKey));
  const addressedConcernLabels = [...concernStatusByKey.entries()]
    .filter(([, status]) => status === "addressed")
    .map(([concernKey]) => titleCaseIdentifier(concernKey));

  if (addressedConcernLabels.length > 0 && openConcernLabels.length > 0) {
    clauses.push(formatConcernStatusClause(addressedConcernLabels, "addressed"), formatConcernStatusClause(openConcernLabels, "open"));
  } else if (addressedConcernLabels.length > 0) {
    clauses.push(formatConcernStatusClause(addressedConcernLabels, "addressed"));
  } else if (openConcernLabels.length > 0) {
    clauses.push(formatConcernStatusClause(openConcernLabels, "open"));
  }

  if (currentContextNeeds.length > 0) {
    clauses.push(`Remaining need: ${formatList(currentContextNeeds.map((contextNeed) => titleCaseIdentifier(contextNeed)))}`);
  }

  if (clauses.length === 0) {
    return intro;
  }

  return `${intro} ${clauses.join("; ")}.`;
}

function createAddressedConcernKeySet(run: RunState): Set<string> {
  const answerComposition = run.answerComposition;
  if (answerComposition?.status !== "answered") {
    return new Set();
  }

  const addressedConcernSections = answerComposition.sections.filter((section) => section.kind === "concerns");
  return new Set(
    addressedConcernSections.flatMap((section) => section.items ?? []),
  );
}

function createSessionPatchOperations(run: RunState): SessionPatchOperation[] {
  const understanding = run.understanding;
  const answerComposition = run.answerComposition;
  if (!understanding || !answerComposition) {
    return [];
  }
  const addressedConcernKeys = createAddressedConcernKeySet(run);
  const factOperations = Object.entries(understanding.facts).map(([key, fact]) => ({
    type: "upsertFact" as const,
    key,
    fact: {
      value: fact.value,
      source: fact.provenance.source,
      sourceRunId: run.runId,
      status: "active" as const,
    },
  }));

  const concernOperations = understanding.concerns.map((concern) => ({
    type: "upsertConcern" as const,
    key: concern.key,
    concern: {
      status: addressedConcernKeys.has(concern.key) ? "addressed" : concern.status,
      sourceRunIds: [run.runId],
    },
  }));

  return [
    ...factOperations,
    ...concernOperations,
    {
      type: "setFocus",
      focus: {
        goal: understanding.goal === "unknown" ? null : understanding.goal,
        contextNeeds: [...understanding.contextNeeds],
      },
    },
    {
      type: "replaceSuggestedPrompts",
      suggestedPrompts: answerComposition.suggestedPrompts,
    },
    {
      type: "updateSummary",
      summary: createSessionSummary(run),
    },
  ];
}

export function buildSessionPatchFromValidatedRun(run: RunState): SessionPatch {
  if (!run.promptUnderstandingValidation?.valid || !run.understanding) {
    throw new Error("Cannot build Session Patch without validated Prompt Understanding");
  }

  const answerComposition = run.answerComposition;
  if (answerComposition?.status !== "needs_context" && answerComposition?.status !== "answered") {
    throw new Error("Cannot build Session Patch without a patchable Answer Composition");
  }

  const compositionValidation = validateAnswerCompositionCandidate(answerComposition, run.retrieval);
  if (!compositionValidation.valid) {
    throw new Error(`Cannot build Session Patch with unsupported Answer Composition: ${compositionValidation.diagnostics.join(", ")}`);
  }

  return {
    runId: run.runId,
    sessionId: run.sessionId,
    baseRevision: run.baseSessionRevision,
    operations: createSessionPatchOperations(run),
  };
}
