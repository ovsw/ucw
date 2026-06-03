import { validateAnswerCompositionCandidate } from "./answer-composition-contract.js";
import type { RunState, SessionPatch, SessionPatchOperation } from "./types.js";

function createSessionSummary(run: RunState): string {
  const ageFact = run.understanding?.facts.child_age;
  if (run.understanding?.goal === "assess_fit" && typeof ageFact?.value === "number") {
    return `Parent is assessing overnight camp Fit for an ${ageFact.value}-year-old Child.`;
  }

  return run.answerComposition?.conversationalFraming ?? run.prompt.text;
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
  if (!understanding) {
    return [];
  }
  if (!answerComposition) {
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
