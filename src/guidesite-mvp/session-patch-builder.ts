import type { RunState, SessionPatch, SessionPatchOperation } from "./types.js";

function validateAnswerCompositionSourceRefs(run: RunState): string[] {
  if (!run.answerComposition) {
    return [];
  }

  const diagnostics: string[] = [];
  const retrievalResultsById = new Map(run.retrieval?.results.map((result) => [result.sourceId, result]) ?? []);
  const sourceRefs = run.answerComposition.sections.flatMap((section) => section.sourceRefs ?? []);

  for (const sourceRef of sourceRefs) {
    const retrievalResult = retrievalResultsById.get(sourceRef.sourceId);
    if (!retrievalResult) {
      diagnostics.push(`answer_composition_source_ref_${sourceRef.sourceId}_missing_retrieval_result`);
      continue;
    }

    if (
      sourceRef.sourceType !== retrievalResult.sourceType ||
      sourceRef.title !== retrievalResult.title ||
      sourceRef.fieldPath !== retrievalResult.fieldPath ||
      sourceRef.sourceRevision !== retrievalResult.sourceRevision
    ) {
      diagnostics.push(`answer_composition_source_ref_${sourceRef.sourceId}_stale_retrieval_result`);
    }
  }

  for (const citation of run.answerComposition.citations) {
    if (!retrievalResultsById.has(citation)) {
      diagnostics.push(`answer_composition_citation_${citation}_missing_retrieval_result`);
    }
  }

  return diagnostics;
}

function createSessionSummary(run: RunState): string {
  const ageFact = run.understanding?.facts.child_age;
  if (run.understanding?.goal === "assess_fit" && typeof ageFact?.value === "number") {
    return `Parent is assessing overnight camp Fit for an ${ageFact.value}-year-old Child.`;
  }

  return run.answerComposition?.conversationalFraming ?? run.prompt.text;
}

function createSessionPatchOperations(run: RunState): SessionPatchOperation[] {
  const understanding = run.understanding;
  if (!understanding) {
    return [];
  }

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
      status: concern.status,
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
      suggestedPrompts: run.answerComposition?.suggestedPrompts ?? [],
    },
    {
      type: "updateSummary",
      summary: createSessionSummary(run),
    },
  ];
}

export function buildSessionPatchFromValidatedRun(run: RunState): SessionPatch {
  if (!run.promptUnderstandingValidation?.valid) {
    throw new Error("Cannot build Session Patch without validated Prompt Understanding");
  }

  if (!run.understanding) {
    throw new Error("Cannot build Session Patch without validated Prompt Understanding");
  }

  if (!run.answerComposition || run.answerComposition.status !== "needs_context") {
    throw new Error("Cannot build Session Patch without a patchable Answer Composition");
  }

  const sourceRefDiagnostics = validateAnswerCompositionSourceRefs(run);
  if (sourceRefDiagnostics.length > 0) {
    throw new Error(`Cannot build Session Patch with unsupported Answer Composition source refs: ${sourceRefDiagnostics.join(", ")}`);
  }

  return {
    runId: run.runId,
    sessionId: run.sessionId,
    baseRevision: run.baseSessionRevision,
    operations: createSessionPatchOperations(run),
  };
}

export function buildHardcodedSessionPatch(run: RunState): SessionPatch {
  return buildSessionPatchFromValidatedRun(run);
}
