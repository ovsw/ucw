import type {
  AnswerComposition,
  AnswerCompositionSourceRef,
  CommitSessionPatchOptions,
  CommitSessionPatchResult,
  GuideSiteStores,
  PromptUnderstanding,
  PromptUnderstandingProviderTrace,
  PromptUnderstandingSessionContext,
  PromptUnderstandingValidationResult,
  RunState,
  RunStore,
  SessionPatch,
  SessionStore,
  SessionState,
  StartGuideSiteRunOptions,
  StartGuideSiteRunResult,
} from "./types.ts";
import { applySessionPatchOperations } from "./patch-engine.ts";
import {
  createFixtureGuideSiteRetrievalAdapter,
  type GuideSiteRetrievalAdapter,
  type GuideSiteRetrievalResult,
} from "./fixture-retrieval.ts";
import type { GuideSiteSanityRetrievalAdapterResolver } from "./sanity-retrieval.ts";
import {
  PromptUnderstandingProviderError,
  type PromptUnderstandingProvider,
} from "./openai-prompt-understanding.ts";
import {
  assessPromptUnderstandingCandidate,
  validatePromptUnderstandingMeaning,
} from "./prompt-understanding.ts";
import { validateAnswerCompositionCandidate } from "./answer-composition-contract.ts";
import { buildSessionPatchFromValidatedRun } from "./session-patch-builder.ts";
import { collectActiveFacts } from "./fact-state.ts";
import { collectUnresolvedContextNeeds } from "./context-needs.ts";
import { formatChildAge } from "./age-formatting.ts";
import { getApprovedContextNeedPromptTemplate } from "./suggested-prompt-templates.ts";

const canonicalPromptText = "Is overnight camp right for my 8-year-old?";
const canonicalFitQuestionText = "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.";

function createDefaultSessionId(): string {
  return `session_${crypto.randomUUID()}`;
}

function createDefaultRunId(): string {
  return `run_${crypto.randomUUID()}`;
}

function cloneSessionState(session: SessionState): SessionState {
  return structuredClone(session);
}

function createPromptUnderstandingSessionContext(session: SessionState): PromptUnderstandingSessionContext {
  return {
    session: cloneSessionState(session),
  };
}

function cloneRunWithClearedTransientState(run: RunState): RunState {
  return {
    ...structuredClone(run),
    promptUnderstandingProvider: null,
    understanding: null,
    promptUnderstandingValidation: null,
    retrieval: null,
    answerCompositionValidation: null,
    answerComposition: null,
    rejectedAnswerComposition: null,
    patch: null,
    committedSessionState: null,
    diagnostics: [],
  };
}

function validatePromptUnderstandingCandidate(
  promptText: string,
  candidate: PromptUnderstanding,
): PromptUnderstandingValidationResult {
  const assessment = assessPromptUnderstandingCandidate(candidate);
  const provenanceDiagnostics = validatePromptUnderstandingFactProvenanceAgainstPrompt(promptText, candidate);

  return {
    valid: assessment.accepted && provenanceDiagnostics.length === 0,
    diagnostics: [...assessment.diagnostics, ...provenanceDiagnostics],
  };
}

function createValidationFailedRun(
  run: RunState,
  validation: PromptUnderstandingValidationResult,
  options: {
    now?: () => Date;
    providerTrace?: PromptUnderstandingProviderTrace | null;
  } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();

  return {
    ...cloneRunWithClearedTransientState(run),
    status: "validation_failed",
    updatedAt: timestamp,
    promptUnderstandingProvider: options.providerTrace ? structuredClone(options.providerTrace) : null,
    promptUnderstandingValidation: validation,
    answerCompositionValidation: null,
    rejectedAnswerComposition: null,
    diagnostics: validation.diagnostics,
  };
}

const recoverablePromptUnderstandingUncertaintyDiagnostics = new Set([
  "prompt_understanding_goal_required",
  "prompt_understanding_prompt_type_required",
  "prompt_understanding_fit_question_required",
]);

function isRecoverablePromptUnderstandingUncertainty(validation: PromptUnderstandingValidationResult): boolean {
  return (
    validation.diagnostics.length > 0 &&
    validation.diagnostics.every((diagnostic) => recoverablePromptUnderstandingUncertaintyDiagnostics.has(diagnostic))
  );
}

function collectActiveSnapshotFactKeys(session: SessionState): Set<string> {
  return new Set(
    Object.entries(session.visitorFacts)
      .filter(([, fact]) => fact.status === "active")
      .map(([factKey]) => factKey),
  );
}

function appendApprovedContextNeed(
  contextNeeds: string[],
  seenContextNeeds: Set<string>,
  activeFactKeys: Set<string>,
  contextNeed: string,
): void {
  const normalizedContextNeed = contextNeed.trim();
  if (
    normalizedContextNeed.length === 0 ||
    activeFactKeys.has(normalizedContextNeed) ||
    seenContextNeeds.has(normalizedContextNeed) ||
    !getApprovedContextNeedPromptTemplate(normalizedContextNeed)
  ) {
    return;
  }

  seenContextNeeds.add(normalizedContextNeed);
  contextNeeds.push(normalizedContextNeed);
}

function collectRecoverableContextNeeds(run: RunState, candidate: PromptUnderstanding): string[] {
  const contextNeeds: string[] = [];
  const seenContextNeeds = new Set<string>();
  const activeFactKeys = collectActiveSnapshotFactKeys(run.snapshot);

  for (const contextNeed of run.snapshot.focus.contextNeeds) {
    appendApprovedContextNeed(contextNeeds, seenContextNeeds, activeFactKeys, contextNeed);
  }

  for (const suggestedPrompt of run.snapshot.suggestedPrompts) {
    for (const contextNeed of suggestedPrompt.contextNeeds) {
      appendApprovedContextNeed(contextNeeds, seenContextNeeds, activeFactKeys, contextNeed);
    }
  }

  for (const contextNeed of candidate.contextNeeds) {
    appendApprovedContextNeed(contextNeeds, seenContextNeeds, activeFactKeys, contextNeed);
  }

  return contextNeeds;
}

function createProductUncertaintyConcerns(contextNeeds: string[]): PromptUnderstanding["concerns"] {
  const concerns: PromptUnderstanding["concerns"] = [];
  const concernKeys = new Set<string>();

  function pushConcern(key: string, label: string): void {
    if (concernKeys.has(key)) {
      return;
    }

    concernKeys.add(key);
    concerns.push({
      key,
      label,
      status: "open",
      provenance: "implied",
    });
  }

  for (const contextNeed of contextNeeds) {
    if (contextNeed === "prior_sleepaway_experience") {
      pushConcern("homesickness", "Homesickness");
    }

    if (contextNeed === "child_readiness") {
      pushConcern("child_readiness", "Child Readiness");
    }
  }

  return concerns;
}

function createProductUncertaintyUnderstanding(
  candidate: PromptUnderstanding,
  contextNeeds: string[],
): PromptUnderstanding {
  if (contextNeeds.length === 0) {
    return structuredClone(candidate);
  }

  return {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: canonicalFitQuestionText,
    facts: {},
    concerns: createProductUncertaintyConcerns(contextNeeds),
    retrievalNeeds: ["overnight_readiness", "homesickness_support"],
    contextNeeds,
  };
}

function createSuggestedPromptsForContextNeeds(contextNeeds: string[]): AnswerComposition["suggestedPrompts"] {
  return contextNeeds.flatMap((contextNeed) => {
    const template = getApprovedContextNeedPromptTemplate(contextNeed);
    if (!template) {
      return [];
    }

    return [
      {
        id: `prompt_${contextNeed}`,
        purpose: template.purpose,
        text: template.text,
        contextNeeds: [contextNeed],
        concerns: [...template.concerns],
        templateId: template.templateId,
      },
    ];
  });
}

function createProductUncertaintyContextGatheringAnswerComposition(
  contextNeeds: string[],
  diagnostics: string[],
): AnswerComposition {
  const suggestedPrompts = createSuggestedPromptsForContextNeeds(contextNeeds);

  return {
    status: "needs_context",
    conversationalFraming:
      "I need a clearer answer before I can use that safely. Let's gather the missing Visitor Context before assessing Fit.",
    sections: [
      {
        kind: "context_needs",
        title: "Clarification Needed",
        body: `The latest reply could not be interpreted confidently, so the next turn should gather ${formatList(contextNeeds.map((contextNeed) => titleCaseIdentifier(contextNeed)))}.`,
        items: contextNeeds,
      },
      {
        kind: "suggested_prompts",
        title: "Suggested Prompts",
        body: "Approved prompts gather the missing Visitor Context without exposing Prompt Understanding diagnostics to the Parent.",
        items: suggestedPrompts.map((prompt) => prompt.id),
      },
      {
        kind: "diagnostics",
        title: "Prompt Understanding Uncertainty",
        body: "Prompt Understanding validation diagnostics are preserved for operator inspection while the Parent surface stays in clarification.",
      },
    ],
    suggestedPrompts,
    citations: [],
    diagnostics: ["prompt_understanding_product_uncertainty", ...diagnostics],
  };
}

function createProductUncertaintyFallbackAnswerComposition(diagnostics: string[]): AnswerComposition {
  return {
    status: "fallback",
    conversationalFraming: "I couldn't interpret that confidently enough to answer safely.",
    sections: [
      {
        kind: "diagnostics",
        title: "Prompt Understanding Uncertainty",
        body: "Prompt Understanding validation diagnostics are preserved for operator inspection while the Parent surface abstains instead of treating the turn as broken.",
      },
    ],
    suggestedPrompts: [],
    citations: [],
    diagnostics: ["prompt_understanding_product_uncertainty", ...diagnostics],
  };
}

function createProductUncertaintyRun(
  run: RunState,
  candidate: PromptUnderstanding,
  validation: PromptUnderstandingValidationResult,
  options: {
    now?: () => Date;
    providerTrace?: PromptUnderstandingProviderTrace | null;
  } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const contextNeeds = collectRecoverableContextNeeds(run, candidate);
  const answerComposition =
    contextNeeds.length > 0
      ? createProductUncertaintyContextGatheringAnswerComposition(contextNeeds, validation.diagnostics)
      : createProductUncertaintyFallbackAnswerComposition(validation.diagnostics);

  return {
    ...cloneRunWithClearedTransientState(run),
    status: answerComposition.status === "needs_context" ? "composed" : "fallback",
    updatedAt: timestamp,
    promptUnderstandingProvider: options.providerTrace ? structuredClone(options.providerTrace) : null,
    understanding: createProductUncertaintyUnderstanding(candidate, contextNeeds),
    promptUnderstandingValidation: structuredClone(validation),
    retrieval: null,
    answerCompositionValidation: validateAnswerCompositionCandidate(answerComposition, null),
    answerComposition,
    rejectedAnswerComposition: null,
    diagnostics: validation.diagnostics,
  };
}

function normalizePromptCoverageText(value: string): string {
  return value.trim().toLowerCase();
}

function validatePromptUnderstandingFactProvenanceAgainstPrompt(
  promptText: string,
  understanding: PromptUnderstanding,
): string[] {
  const diagnostics: string[] = [];
  const normalizedPromptText = normalizePromptCoverageText(promptText);

  for (const [factKey, fact] of Object.entries(understanding.facts)) {
    const normalizedFactPromptText = normalizePromptCoverageText(fact.provenance.promptText);
    if (normalizedFactPromptText.length === 0) {
      continue;
    }

    if (!normalizedPromptText.includes(normalizedFactPromptText)) {
      diagnostics.push(`prompt_understanding_fact_${factKey}_prompt_text_not_present_in_prompt`);
    }
  }

  return diagnostics;
}

function createEmptySessionState(sessionId: string, timestamp: string): SessionState {
  return {
    schemaVersion: 1,
    sessionId,
    revision: 1,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
    visitorFacts: {},
    concerns: {},
    focus: {
      goal: null,
      contextNeeds: [],
    },
    suggestedPrompts: [],
    promptHistory: [],
    summary: "",
  };
}

export class SessionPatchConflictError extends Error {
  readonly code = "SESSION_PATCH_CONFLICT";
  readonly runId: string;
  readonly sessionId: string;
  readonly baseRevision: number;
  readonly liveRevision: number;

  constructor(input: { runId: string; sessionId: string; baseRevision: number; liveRevision: number }) {
    super(
      `Session Patch conflict for run ${input.runId} on Session ${input.sessionId}: base revision ${input.baseRevision} does not match live revision ${input.liveRevision}`,
    );
    this.name = "SessionPatchConflictError";
    this.runId = input.runId;
    this.sessionId = input.sessionId;
    this.baseRevision = input.baseRevision;
    this.liveRevision = input.liveRevision;
  }
}

export function renderStartRunOperatorOutput(run: RunState): string {
  return [
    "GuideSite Start Run",
    `Prompt: ${run.prompt.text}`,
    `Run Status: ${run.status}`,
    `Session ID: ${run.sessionId}`,
    `Run ID: ${run.runId}`,
    `Base Revision: ${run.baseSessionRevision}`,
    `Session Revision: ${run.snapshot.revision}`,
    "Snapshot:",
    JSON.stringify(run.snapshot, null, 2),
  ].join("\n");
}

export function createGuideSiteMemoryStores(options: { sessions?: SessionStore; runs?: RunStore } = {}): GuideSiteStores {
  const sessions = new Map<string, SessionState>();
  const runs = new Map<string, RunState>();
  const committedRunIds = new Set<string>();
  const sessionStore: SessionStore = options.sessions ?? {
    create(session) {
      const stored = cloneSessionState(session);
      sessions.set(session.sessionId, stored);
      return cloneSessionState(stored);
    },
    read(sessionId) {
      const session = sessions.get(sessionId);
      return session ? cloneSessionState(session) : null;
    },
    update(session) {
      const stored = cloneSessionState(session);
      sessions.set(session.sessionId, stored);
      return cloneSessionState(stored);
    },
    hasCommittedRun(runId) {
      return committedRunIds.has(runId);
    },
    markCommittedRun(runId) {
      committedRunIds.add(runId);
    },
  };

  return {
    sessions: sessionStore,
    runs: options.runs ?? {
      create(run) {
        const stored = structuredClone(run);
        runs.set(run.runId, stored);
        return structuredClone(stored);
      },
      read(runId) {
        const run = runs.get(runId);
        return run ? structuredClone(run) : null;
      },
      update(run) {
        const stored = structuredClone(run);
        runs.set(run.runId, stored);
        return structuredClone(stored);
      },
    },
  };
}

export function startGuideSiteRun(options: StartGuideSiteRunOptions): StartGuideSiteRunResult {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const sessionId = options.sessionId ?? options.createSessionId?.() ?? createDefaultSessionId();
  const session =
    options.stores.sessions.read(sessionId) ??
    options.stores.sessions.create(createEmptySessionState(sessionId, timestamp));

  const run: RunState = {
    schemaVersion: 1,
    runId: options.createRunId?.() ?? createDefaultRunId(),
    sessionId: session.sessionId,
    baseSessionRevision: session.revision,
    status: "started",
    createdAt: timestamp,
    updatedAt: timestamp,
    prompt: {
      text: options.promptText,
      source: "typed",
      selectedSuggestedPromptId: null,
    },
    snapshot: cloneSessionState(session),
    understanding: null,
    promptUnderstandingProvider: null,
    promptUnderstandingValidation: null,
    retrieval: null,
    answerCompositionValidation: null,
    answerComposition: null,
    rejectedAnswerComposition: null,
    patch: null,
    committedSessionState: null,
    diagnostics: [],
  };

  return {
    session,
    run: options.stores.runs.create(run),
  };
}

export function withPromptUnderstandingCandidate(
  run: RunState,
  candidate: PromptUnderstanding,
  options: {
    now?: () => Date;
    providerTrace?: PromptUnderstandingProviderTrace;
    retrievalAdapter?: GuideSiteRetrievalAdapter;
  } = {},
): RunState {
  const validation = validatePromptUnderstandingCandidate(run.prompt.text, candidate);

  if (!validation.valid) {
    if (isRecoverablePromptUnderstandingUncertainty(validation)) {
      return createProductUncertaintyRun(run, candidate, validation, {
        now: options.now,
        providerTrace: options.providerTrace ?? null,
      });
    }

    return createValidationFailedRun(run, validation, {
      now: options.now,
      providerTrace: options.providerTrace ?? null,
    });
  }

  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const retrievalAdapter = options.retrievalAdapter ?? createFixtureGuideSiteRetrievalAdapter();
  const sessionContext = createPromptUnderstandingSessionContext(run.snapshot);
  const retrieval = withAdapterMetadata(retrievalAdapter.retrieve(candidate, sessionContext), retrievalAdapter);
  const sourceBackedRetrieval = isSourceBackedRetrieval(retrieval);
  const answerComposition = sourceBackedRetrieval
    ? createValidatedAnswerComposition({ ...run, understanding: candidate, retrieval }, retrieval)
    : createInsufficientSourceAnswerComposition(retrieval, retrieval.diagnostics);
  const answerCompositionValidation = validateAnswerCompositionCandidate(answerComposition, retrieval);

  if (!answerCompositionValidation.valid) {
    return {
      ...cloneRunWithClearedTransientState(run),
      status: "validation_failed",
      updatedAt: timestamp,
      promptUnderstandingProvider: options.providerTrace ? structuredClone(options.providerTrace) : null,
      understanding: structuredClone(candidate),
      promptUnderstandingValidation: validation,
      retrieval,
      answerCompositionValidation,
      answerComposition: null,
      rejectedAnswerComposition: answerComposition,
      diagnostics: [...retrieval.diagnostics, ...answerCompositionValidation.diagnostics],
    };
  }

  return {
    ...cloneRunWithClearedTransientState(run),
    status: sourceBackedRetrieval ? "composed" : "fallback",
    updatedAt: timestamp,
    promptUnderstandingProvider: options.providerTrace ? structuredClone(options.providerTrace) : null,
    understanding: structuredClone(candidate),
    promptUnderstandingValidation: validation,
    retrieval,
    answerCompositionValidation,
    answerComposition,
    rejectedAnswerComposition: null,
    patch: null,
    committedSessionState: null,
    diagnostics: retrieval.diagnostics,
  };
}

function createRetrievalFailureRun(
  run: RunState,
  promptUnderstanding: PromptUnderstanding,
  promptUnderstandingValidation: PromptUnderstandingValidationResult,
  providerTrace: PromptUnderstandingProviderTrace | null,
  error: unknown,
  options: { now?: () => Date } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const message = error instanceof Error ? error.message : String(error);

  return {
    ...cloneRunWithClearedTransientState(run),
    status: "retrieval_failed",
    updatedAt: timestamp,
    promptUnderstandingProvider: providerTrace ? structuredClone(providerTrace) : null,
    understanding: structuredClone(promptUnderstanding),
    promptUnderstandingValidation: structuredClone(promptUnderstandingValidation),
    answerCompositionValidation: null,
    answerComposition: null,
    rejectedAnswerComposition: null,
    diagnostics: [`retrieval_failed: ${message}`],
  };
}

function createProviderFailureRun(
  run: RunState,
  error: unknown,
  options: { now?: () => Date } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const providerError =
    error instanceof PromptUnderstandingProviderError
      ? error
      : new PromptUnderstandingProviderError(
          `Prompt Understanding provider failed: ${error instanceof Error ? error.message : String(error)}`,
        );
  const diagnostics = providerError.diagnostics.map((diagnostic) => `prompt_understanding_provider_failed: ${diagnostic}`);

  return {
    ...cloneRunWithClearedTransientState(run),
    status: "prompt_understanding_failed",
    updatedAt: timestamp,
    promptUnderstandingProvider: {
      provider: "openai",
      model: "unknown",
      rawOutput: providerError.rawOutput,
      parsedOutput: providerError.parsedOutput,
      diagnostics,
    },
    promptUnderstandingValidation: {
      valid: false,
      diagnostics,
    },
    answerCompositionValidation: null,
    answerComposition: null,
    rejectedAnswerComposition: null,
    diagnostics,
  };
}

export async function withProviderBackedUnderstandingAndComposition(
  run: RunState,
  provider: PromptUnderstandingProvider,
  options: {
    now?: () => Date;
    retrievalAdapter?: GuideSiteRetrievalAdapter;
    sanityRetrievalAdapterResolver?: GuideSiteSanityRetrievalAdapterResolver;
  } = {},
): Promise<RunState> {
  try {
    const sessionContext = createPromptUnderstandingSessionContext(run.snapshot);
    const providerResult = await provider.understandPrompt(run.prompt.text, sessionContext);
    const validation = validatePromptUnderstandingCandidate(run.prompt.text, providerResult.understanding);

    if (!validation.valid) {
      if (isRecoverablePromptUnderstandingUncertainty(validation)) {
        return createProductUncertaintyRun(run, providerResult.understanding, validation, {
          now: options.now,
          providerTrace: providerResult.trace,
        });
      }

      return createValidationFailedRun(run, validation, {
        now: options.now,
        providerTrace: providerResult.trace,
      });
    }

    try {
      const retrievalAdapter = await resolveRetrievalAdapter(
        run.prompt.text,
        providerResult.understanding,
        sessionContext,
        options,
      );

      return withPromptUnderstandingCandidate(run, providerResult.understanding, {
        now: options.now,
        providerTrace: providerResult.trace,
        retrievalAdapter,
      });
    } catch (error) {
      return createRetrievalFailureRun(run, providerResult.understanding, validation, providerResult.trace, error, {
        now: options.now,
      });
    }
  } catch (error) {
    return createProviderFailureRun(run, error, options);
  }
}

async function resolveRetrievalAdapter(
  promptText: string,
  understanding: PromptUnderstanding,
  sessionContext: PromptUnderstandingSessionContext,
  options: {
    retrievalAdapter?: GuideSiteRetrievalAdapter;
    sanityRetrievalAdapterResolver?: GuideSiteSanityRetrievalAdapterResolver;
  },
): Promise<GuideSiteRetrievalAdapter | undefined> {
  if (options.retrievalAdapter) {
    return options.retrievalAdapter;
  }

  if (!options.sanityRetrievalAdapterResolver) {
    return undefined;
  }

  return options.sanityRetrievalAdapterResolver(promptText, understanding, sessionContext);
}

function createCanonicalUnderstanding(): PromptUnderstanding {
  return {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: canonicalFitQuestionText,
    facts: {
      child_age: {
        value: 8,
        provenance: {
          source: "explicit",
          promptText: "8-year-old",
        },
      },
    },
    concerns: [
      {
        key: "homesickness",
        label: "Homesickness",
        status: "open",
        provenance: "implied",
      },
      {
        key: "child_readiness",
        label: "Child Readiness",
        status: "open",
        provenance: "implied",
      },
    ],
    retrievalNeeds: ["overnight_readiness", "homesickness_support"],
    contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
  };
}

function createSourceRef(sourceId: string, retrieval: NonNullable<RunState["retrieval"]>): AnswerCompositionSourceRef | null {
  const result = retrieval.results.find((candidate) => candidate.sourceId === sourceId);
  if (!result) {
    return null;
  }

  return {
    sourceId: result.sourceId,
    sourceType: result.sourceType,
    title: result.title,
    fieldPath: result.fieldPath,
    sourceRevision: result.sourceRevision,
  };
}

function createSourceRefs(
  sourceIds: readonly string[],
  retrieval: NonNullable<RunState["retrieval"]>,
): AnswerCompositionSourceRef[] {
  return sourceIds
    .map((sourceId) => createSourceRef(sourceId, retrieval))
    .filter((sourceRef): sourceRef is AnswerCompositionSourceRef => sourceRef !== null);
}

function createSourceCitationIds(sections: AnswerComposition["sections"]): string[] {
  return [...new Set(sections.flatMap((section) => section.sourceRefs?.map((sourceRef) => sourceRef.sourceId) ?? []))];
}



type SuggestedPromptDerivation = {
  suggestedPrompts: AnswerComposition["suggestedPrompts"];
  diagnostics: string[];
};
const canonicalRequiredContextNeedIds = ["prior_sleepaway_experience", "child_readiness"] as const;
const canonicalSummarySourceIds = ["program_overnight"] as const;
const canonicalConcernSourceIds = ["policy_homesickness", "policy_parent_communication"] as const;
const canonicalFitAnswerSourceIds = [
  "program_overnight",
  "concern_homesickness",
  "policy_homesickness",
  "policy_parent_communication",
] as const;

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "(none)";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function titleCaseIdentifier(identifier: string): string {
  return identifier
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function isCanonicalFitJourney(run: RunState): boolean {
  if (run.understanding?.goal !== "assess_fit") {
    return false;
  }

  if (run.prompt.text === canonicalPromptText) {
    return true;
  }

  if ((run.snapshot.promptHistory ?? []).some((prompt) => prompt.text === canonicalPromptText)) {
    return true;
  }

  const childAge = collectActiveFacts(run).get("child_age");
  return childAge === 8 && run.understanding.fitQuestion === canonicalFitQuestionText;
}

function collectMissingRequiredCanonicalFitContextNeeds(run: RunState): string[] {
  const activeFacts = collectActiveFacts(run);
  return canonicalRequiredContextNeedIds.filter((contextNeed) => !activeFacts.has(contextNeed));
}

function collectUnresolvedCanonicalFitContextNeeds(run: RunState): string[] {
  const unresolvedContextNeeds = collectUnresolvedContextNeeds(run);
  if (!isCanonicalFitJourney(run)) {
    return unresolvedContextNeeds;
  }

  return [...new Set([...unresolvedContextNeeds, ...collectMissingRequiredCanonicalFitContextNeeds(run)])];
}

function describeRetrievalAdapter(retrieval: NonNullable<RunState["retrieval"]>): string {
  const label = retrieval.adapterLabel?.trim();
  const adapterId = retrieval.adapterId?.trim();

  if (label && adapterId) {
    return `${label} [${adapterId}]`;
  }

  if (label) {
    return label;
  }

  if (adapterId) {
    return adapterId;
  }

  return "retrieval adapter";
}

function renderRetrievalAdapterLine(retrieval: NonNullable<RunState["retrieval"]>): string | null {
  if (!retrieval.adapterId && !retrieval.adapterLabel) {
    return null;
  }

  return `Retrieval Adapter: ${retrieval.adapterLabel ?? "(unknown)"} [${retrieval.adapterId ?? "(unknown)"}]`;
}

function withAdapterMetadata(
  retrieval: GuideSiteRetrievalResult,
  adapter: GuideSiteRetrievalAdapter | undefined,
): GuideSiteRetrievalResult {
  const adapterId = retrieval.adapterId?.trim() || adapter?.id?.trim() || undefined;
  const adapterLabel = retrieval.adapterLabel?.trim() || adapter?.label?.trim() || undefined;

  if (adapterId === retrieval.adapterId && adapterLabel === retrieval.adapterLabel) {
    return retrieval;
  }

  return {
    ...retrieval,
    adapterId,
    adapterLabel,
  };
}

function createPriorSleepawayExperienceSummary(
  priorSleepawayExperience: string | number | boolean | undefined,
): string | null {
  if (priorSleepawayExperience === undefined) {
    return null;
  }

  if (typeof priorSleepawayExperience === "string") {
    if (priorSleepawayExperience === "no_prior_sleepaway_experience") {
      return "The Parent reported that the Child has not slept away from home yet.";
    }

    if (priorSleepawayExperience === "slept_with_grandparents") {
      return "The Child has prior sleepaway experience with grandparents.";
    }

    return "The Child has prior sleepaway experience.";
  }

  return "The Child has prior sleepaway experience.";
}

function createChildReadinessSummary(childReadiness: string | number | boolean | undefined): string | null {
  if (childReadiness === undefined) {
    return null;
  }

  if (typeof childReadiness === "string" && childReadiness === "needs_more_readiness_support") {
    return "The Parent reported that the Child still needs more support with new routines or time away.";
  }

  return "The Parent reported that the Child handles new routines and time away from the Parent well.";
}

function isPositiveChildReadiness(childReadiness: string | number | boolean | undefined): boolean {
  return childReadiness !== false && childReadiness !== "needs_more_readiness_support";
}

function createNeedContextSummary(run: RunState): string {
  const activeFacts = collectActiveFacts(run);
  const childAge = activeFacts.get("child_age");
  const priorSleepawayExperience = activeFacts.get("prior_sleepaway_experience");
  if (typeof childAge === "number") {
    const summary = `The Parent is asking whether overnight camp is right for ${formatChildAge(childAge)} Child.`;
    const sleepawayExperienceSummary = createPriorSleepawayExperienceSummary(priorSleepawayExperience);
    if (sleepawayExperienceSummary !== null) {
      return `${summary} ${sleepawayExperienceSummary}`;
    }

    return summary;
  }

  return `The Parent is asking whether overnight camp is right for this Child: ${run.prompt.text}`;
}

function createNeedsContextSections(
  run: RunState,
  retrieval: NonNullable<RunState["retrieval"]>,
  suggestedPrompts: AnswerComposition["suggestedPrompts"],
): AnswerComposition["sections"] {
  const concernLabels = run.understanding?.concerns.map((concern) => concern.label) ?? [];
  const concernKeys = run.understanding?.concerns.map((concern) => concern.key) ?? [];
  const contextNeeds = collectUnresolvedCanonicalFitContextNeeds(run);
  const concernSourceRefs = createSourceRefs(canonicalConcernSourceIds, retrieval);
  const sections: AnswerComposition["sections"] = [
    {
      kind: "summary",
      title: "Known Context",
      body: createNeedContextSummary(run),
      sourceRefs: createSourceRefs(canonicalSummarySourceIds, retrieval),
    },
    {
      kind: "fit_status",
      title: "Fit Status",
      body:
        contextNeeds.length > 0
          ? `Fit cannot be assessed honestly yet because ${formatList(contextNeeds.map((need) => titleCaseIdentifier(need)))} are still unknown.`
          : "Fit can be assessed from the currently validated Visitor Context.",
    },
    {
      kind: "concerns",
      title: "Open Concerns",
      body:
        concernLabels.length > 0
          ? `${formatList(concernLabels)} should stay visible as open Concerns.`
          : "No open Concerns were identified in the validated Prompt Understanding.",
      items: concernKeys,
      sourceRefs: concernSourceRefs,
    },
    {
      kind: "context_needs",
      title: "Missing Visitor Context",
      body:
        contextNeeds.length > 0
          ? `The next turn should gather ${formatList(contextNeeds.map((need) => titleCaseIdentifier(need)))}.`
          : "The next turn does not need to gather additional Visitor Context.",
      items: contextNeeds,
    },
    {
      kind: "suggested_prompts",
      title: "Suggested Prompts",
      body:
        suggestedPrompts.length > 0
          ? "Approved prompts gather the missing Visitor Context."
          : "No approved follow-up prompts were available for the current Visitor Context.",
      items: suggestedPrompts.map((prompt) => prompt.id),
      sourceRefs: concernSourceRefs,
    },
  ];

  const sourcesSection = createSourcesSection(retrieval);
  if (sourcesSection) {
    sections.push(sourcesSection);
  }

  sections.push({
    kind: "diagnostics",
    title: "Diagnostics",
    body:
      retrieval.coverage.status === "source_backed"
        ? "Validated Prompt Understanding and source-backed retrieval were composed without a Fit recommendation."
        : "Validated Prompt Understanding was composed without enough source-backed material for a Fit recommendation.",
  });

  return sections;
}

function createSuggestedPrompts(run: RunState): SuggestedPromptDerivation {
  const understanding = run.understanding;
  if (!understanding || understanding.goal !== "assess_fit") {
    return {
      suggestedPrompts: [],
      diagnostics: [],
    };
  }

  const unresolvedContextNeeds = collectUnresolvedCanonicalFitContextNeeds(run);
  const prompts: AnswerComposition["suggestedPrompts"] = [];
  const diagnostics: string[] = [];

  for (const contextNeed of unresolvedContextNeeds) {
    const template = getApprovedContextNeedPromptTemplate(contextNeed);
    if (!template) {
      diagnostics.push(`suggested_prompt_unknown_context_need_${contextNeed}`);
      continue;
    }

    const promptId = `prompt_${contextNeed}`;
    if (prompts.some((prompt) => prompt.id === promptId)) {
      continue;
    }

    prompts.push({
      id: promptId,
      purpose: template.purpose,
      text: template.text,
      contextNeeds: [contextNeed],
      concerns: [...template.concerns],
      templateId: template.templateId,
    });
  }

  return {
    suggestedPrompts: prompts,
    diagnostics,
  };
}

function createSourcesSection(retrieval: NonNullable<RunState["retrieval"]>): AnswerComposition["sections"][number] | null {
  if (retrieval.results.length === 0) {
    return null;
  }

  return {
    kind: "sources",
    title: "Sources",
    body: `Approved source material from ${describeRetrievalAdapter(retrieval)} was retrieved for the validated Prompt Understanding.`,
    items: retrieval.results.map((result) => `${result.title} (${result.sourceId})`),
    sourceRefs: createSourceRefs(
      retrieval.results.map((result) => result.sourceId),
      retrieval,
    ),
  };
}

const homesicknessAnswerSourceIds = ["concern_homesickness", "policy_homesickness", "policy_parent_communication"] as const;

type HomesicknessAnswerSourceMaterial = {
  available: string[];
  missingSources: string[];
  missingSourceText: string[];
  sourceTextById: Map<string, string>;
};

function collectHomesicknessAnswerSourceMaterial(
  retrieval: NonNullable<RunState["retrieval"]>,
): HomesicknessAnswerSourceMaterial {
  const resultsById = new Map(retrieval.results.map((result) => [result.sourceId, result] as const));
  const available: string[] = [];
  const missingSources: string[] = [];
  const missingSourceText: string[] = [];
  const sourceTextById = new Map<string, string>();

  for (const sourceId of homesicknessAnswerSourceIds) {
    const retrievalResult = resultsById.get(sourceId);
    if (!retrievalResult) {
      missingSources.push(sourceId);
      continue;
    }

    const sourceText = retrievalResult.sourceText.trim();
    if (!sourceText) {
      missingSourceText.push(sourceId);
      continue;
    }

    available.push(sourceId);
    sourceTextById.set(sourceId, sourceText);
  }

  return {
    available,
    missingSources,
    missingSourceText,
    sourceTextById,
  };
}

function createConcernAnswerDiagnostic(material: HomesicknessAnswerSourceMaterial): string {
  const gaps: string[] = [];

  if (material.missingSources.length > 0) {
    gaps.push(`missing sources: ${formatList(material.missingSources)}`);
  }

  if (material.missingSourceText.length > 0) {
    gaps.push(`missing selected source text: ${formatList(material.missingSourceText)}`);
  }

  return `homesickness_answer_partial_missing_source_material: ${gaps.join("; ") || "(none)"}`;
}

function formatHomesicknessSourceItems(
  sourceIds: readonly string[],
  retrieval: NonNullable<RunState["retrieval"]>,
): string[] {
  const resultsById = new Map(retrieval.results.map((result) => [result.sourceId, result] as const));
  return sourceIds.map((sourceId) => {
    const result = resultsById.get(sourceId);
    return result ? `${result.title} (${sourceId})` : sourceId;
  });
}

function createHomesicknessConcernAnswerComposition(
  retrieval: NonNullable<RunState["retrieval"]>,
): AnswerComposition {
  const material = collectHomesicknessAnswerSourceMaterial(retrieval);
  const retrievalDescriptor = describeRetrievalAdapter(retrieval);
  const availableText = material.available
    .map((sourceId) => material.sourceTextById.get(sourceId))
    .filter((sourceText): sourceText is string => typeof sourceText === "string" && sourceText.length > 0)
    .join(" ");
  const diagnostics = material.available.length === homesicknessAnswerSourceIds.length ? [] : [createConcernAnswerDiagnostic(material)];

  if (material.available.length === 0) {
    return createInsufficientSourceAnswerComposition(retrieval, [
      ...retrieval.diagnostics,
      ...diagnostics,
      "homesickness_answer_missing_selected_source_text",
    ]);
  }

  const answered = diagnostics.length === 0;
  const sourceRefs = createSourceRefs(material.available, retrieval);
  const sections: AnswerComposition["sections"] = [
    {
      kind: "summary",
      title: "Homesickness Answer",
      body: availableText,
      sourceRefs,
    },
  ];
  const concernText = material.sourceTextById.get("concern_homesickness");
  if (concernText) {
    sections.push({
      kind: "concerns",
      title: "Concern",
      body: concernText,
      items: ["homesickness"],
      sourceRefs: createSourceRefs(["concern_homesickness"], retrieval),
    });
  }

  sections.push(
    {
      kind: "sources",
      title: "Sources",
      body: `Approved source material from ${retrievalDescriptor} was retrieved for the homesickness concern.`,
      items: formatHomesicknessSourceItems(material.available, retrieval),
      sourceRefs,
    },
    {
      kind: "diagnostics",
      title: "Diagnostics",
      body: answered
        ? "All required source material was available."
        : `Partial homesickness answer because ${formatList([...material.missingSources, ...material.missingSourceText])} was unavailable.`,
    },
  );

  return {
    status: answered ? "answered" : "partial",
    conversationalFraming: answered
      ? `The approved source material from ${retrievalDescriptor} explains how the camp handles homesickness.`
      : `The approved source material from ${retrievalDescriptor} supports a partial homesickness answer, but some source material was unavailable.`,
    sections,
    suggestedPrompts: [],
    citations: createSourceCitationIds(sections),
    diagnostics,
  };
}

type CanonicalFitAnswerSourceMaterial = {
  available: string[];
  missingSources: string[];
  missingSourceText: string[];
  sourceTextById: Map<string, string>;
};

function collectCanonicalFitAnswerSourceMaterial(
  retrieval: NonNullable<RunState["retrieval"]>,
): CanonicalFitAnswerSourceMaterial {
  const resultsById = new Map(retrieval.results.map((result) => [result.sourceId, result] as const));
  const available: string[] = [];
  const missingSources: string[] = [];
  const missingSourceText: string[] = [];
  const sourceTextById = new Map<string, string>();

  for (const sourceId of canonicalFitAnswerSourceIds) {
    const retrievalResult = resultsById.get(sourceId);
    if (!retrievalResult) {
      missingSources.push(sourceId);
      continue;
    }

    const sourceText = retrievalResult.sourceText.trim();
    if (!sourceText) {
      missingSourceText.push(sourceId);
      continue;
    }

    available.push(sourceId);
    sourceTextById.set(sourceId, sourceText);
  }

  return {
    available,
    missingSources,
    missingSourceText,
    sourceTextById,
  };
}

function createCanonicalFitAnswerDiagnostic(material: CanonicalFitAnswerSourceMaterial): string {
  const gaps: string[] = [];

  if (material.missingSources.length > 0) {
    gaps.push(`missing sources: ${formatList(material.missingSources)}`);
  }

  if (material.missingSourceText.length > 0) {
    gaps.push(`missing selected source text: ${formatList(material.missingSourceText)}`);
  }

  return `canonical_fit_answer_missing_source_material: ${gaps.join("; ") || "(none)"}`;
}

function createCanonicalFitAnswerComposition(
  run: RunState,
  retrieval: NonNullable<RunState["retrieval"]>,
): AnswerComposition {
  const material = collectCanonicalFitAnswerSourceMaterial(retrieval);
  const diagnostics =
    material.available.length === canonicalFitAnswerSourceIds.length ? [] : [createCanonicalFitAnswerDiagnostic(material)];

  if (diagnostics.length > 0) {
    return createInsufficientSourceAnswerComposition(retrieval, [
      ...retrieval.diagnostics,
      ...diagnostics,
      "canonical_fit_answer_missing_source_material",
    ]);
  }

  const activeFacts = collectActiveFacts(run);
  const priorSleepawayExperience = activeFacts.get("prior_sleepaway_experience");
  const childReadiness = activeFacts.get("child_readiness");
  const fitIsSupported = isPositiveChildReadiness(childReadiness);
  const programText = material.sourceTextById.get("program_overnight") ?? "";
  const readinessText = material.sourceTextById.get("concern_homesickness") ?? "";
  const homesicknessText = material.sourceTextById.get("policy_homesickness") ?? "";
  const parentCommunicationText = material.sourceTextById.get("policy_parent_communication") ?? "";
  const contextSummaries = [
    createPriorSleepawayExperienceSummary(priorSleepawayExperience),
    createChildReadinessSummary(childReadiness),
  ].filter((summary): summary is string => summary !== null);
  const fitAnswer = fitIsSupported
    ? "The source-backed Fit answer is yes: overnight camp is a supported fit for this Child."
    : "The source-backed Fit answer is not yet: overnight camp is not a supported fit for this Child until readiness concerns are resolved.";
  const allSourceRefs = createSourceRefs(canonicalFitAnswerSourceIds, retrieval);
  const sections: AnswerComposition["sections"] = [
    {
      kind: "summary",
      title: "Fit Answer",
      body: `${fitAnswer} ${programText}`,
      sourceRefs: createSourceRefs(["program_overnight"], retrieval),
    },
    {
      kind: "summary",
      title: "Readiness Context",
      body: `Required Visitor Context is complete. ${contextSummaries.join(" ")} ${readinessText}`,
      sourceRefs: createSourceRefs(["concern_homesickness"], retrieval),
    },
    {
      kind: "concerns",
      title: "Homesickness and Parent Communication",
      body: `${homesicknessText} ${parentCommunicationText}`,
      items: ["homesickness", "child_readiness"],
      sourceRefs: createSourceRefs(canonicalConcernSourceIds, retrieval),
    },
    {
      kind: "sources",
      title: "Sources",
      body: `Approved source material from ${describeRetrievalAdapter(retrieval)} was retrieved for the completed Fit answer.`,
      items: canonicalFitAnswerSourceIds.map((sourceId) => {
        const result = retrieval.results.find((candidate) => candidate.sourceId === sourceId);
        return result ? `${result.title} (${sourceId})` : sourceId;
      }),
      sourceRefs: allSourceRefs,
    },
    {
      kind: "diagnostics",
      title: "Diagnostics",
      body: "Required Visitor Context and canonical Fit source material were complete.",
    },
  ];

  return {
    status: "answered",
    conversationalFraming:
      "The GuideSite can now answer Fit because required Visitor Context is complete and approved source material covers the program, readiness, homesickness support, and parent communication.",
    sections,
    suggestedPrompts: [],
    citations: createSourceCitationIds(sections),
    diagnostics: ["canonical_fit_answer_source_backed"],
  };
}

function createCanonicalAnswerComposition(run: RunState, retrieval: NonNullable<RunState["retrieval"]>): AnswerComposition {
  const suggestedPromptDerivation = createSuggestedPrompts(run);
  const sections = createNeedsContextSections(run, retrieval, suggestedPromptDerivation.suggestedPrompts);
  const diagnostics = [
    ...retrieval.diagnostics,
    ...suggestedPromptDerivation.diagnostics,
    "needs_visitor_context",
    "no_fit_recommendation",
  ];

  return {
    status: "needs_context",
    conversationalFraming:
      typeof run.understanding?.facts.child_age?.value === "number"
        ? `Age ${run.understanding.facts.child_age.value} is relevant, but the GuideSite needs more Visitor Context before it can honestly assess Fit.`
        : "The GuideSite needs more Visitor Context before it can honestly assess Fit.",
    sections,
    suggestedPrompts: suggestedPromptDerivation.suggestedPrompts,
    citations: createSourceCitationIds(sections),
    diagnostics,
  };
}

function createValidatedAnswerComposition(run: RunState, retrieval: NonNullable<RunState["retrieval"]>): AnswerComposition {
  if (run.understanding?.goal === "assess_fit") {
    const unresolvedContextNeeds = collectUnresolvedCanonicalFitContextNeeds(run);
    if (unresolvedContextNeeds.length > 0) {
      return createCanonicalAnswerComposition(run, retrieval);
    }

    if (isCanonicalFitJourney(run)) {
      return createCanonicalFitAnswerComposition(run, retrieval);
    }

    return createInsufficientSourceAnswerComposition(retrieval, [
      ...retrieval.diagnostics,
      "unsupported_fit_answer_composition_goal",
    ]);
  }

  if (run.understanding?.concerns.some((concern) => concern.key === "homesickness")) {
    return createHomesicknessConcernAnswerComposition(retrieval);
  }

  return createInsufficientSourceAnswerComposition(retrieval, [...retrieval.diagnostics, "unsupported_answer_composition_goal"]);
}

function createFallbackUnderstanding(): PromptUnderstanding {
  return {
    goal: "unknown",
    promptType: "unknown",
    fitQuestion: null,
    facts: {},
    concerns: [],
    retrievalNeeds: [],
    contextNeeds: [],
  };
}

function createFallbackAnswerComposition(): AnswerComposition {
  return {
    status: "fallback",
    conversationalFraming: "This Sprint 1 slice only has hardcoded understanding for the canonical Parent Prompt.",
    sections: [
      {
        kind: "diagnostics",
        title: "Fallback",
        body: "Unknown Prompt; no facts, Concerns, retrieval needs, or context needs were inferred.",
      },
    ],
    suggestedPrompts: [],
    citations: [],
    diagnostics: ["unknown_prompt_fallback"],
  };
}

function createInsufficientSourceAnswerComposition(
  retrieval: NonNullable<RunState["retrieval"]>,
  diagnostics: string[],
): AnswerComposition {
  const retrievalDescriptor = describeRetrievalAdapter(retrieval);
  return {
    status: "fallback",
    conversationalFraming: "The GuideSite cannot responsibly answer this prompt yet.",
    sections: [
      {
        kind: "diagnostics",
        title: "Insufficient Source Material",
        body: `Approved source material from ${retrievalDescriptor} was missing or insufficient for the validated Prompt Understanding, so the system is abstaining instead of guessing.`,
      },
    ],
    suggestedPrompts: [],
    citations: [],
    diagnostics,
  };
}

function isSourceBackedRetrieval(retrieval: GuideSiteRetrievalResult): boolean {
  return retrieval.coverage.status === "source_backed";
}

export function withHardcodedUnderstandingAndComposition(
  run: RunState,
  options: { now?: () => Date } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const isCanonicalPrompt = run.prompt.text === canonicalPromptText;
  const understanding = isCanonicalPrompt ? createCanonicalUnderstanding() : createFallbackUnderstanding();
  const meaningValidation = validatePromptUnderstandingMeaning(understanding);
  const provenanceDiagnostics = validatePromptUnderstandingFactProvenanceAgainstPrompt(run.prompt.text, understanding);
  const validation = {
    valid: meaningValidation.valid && provenanceDiagnostics.length === 0,
    diagnostics: [...meaningValidation.diagnostics, ...provenanceDiagnostics],
  };
  const retrievalAdapter = createFixtureGuideSiteRetrievalAdapter();
  const sessionContext = createPromptUnderstandingSessionContext(run.snapshot);
  const retrieval = validation.valid ? withAdapterMetadata(retrievalAdapter.retrieve(understanding, sessionContext), retrievalAdapter) : null;
  const sourceBackedRetrieval = retrieval ? isSourceBackedRetrieval(retrieval) : false;
  const answerComposition =
    isCanonicalPrompt && retrieval && sourceBackedRetrieval
      ? createValidatedAnswerComposition({ ...run, understanding, retrieval }, retrieval)
      : createFallbackAnswerComposition();
  const answerCompositionValidation = retrieval ? validateAnswerCompositionCandidate(answerComposition, retrieval) : null;

  return {
    ...cloneRunWithClearedTransientState(run),
    status: isCanonicalPrompt && sourceBackedRetrieval ? "composed" : "fallback",
    updatedAt: timestamp,
    promptUnderstandingProvider: null,
    understanding,
    promptUnderstandingValidation: validation,
    retrieval,
    answerCompositionValidation,
    answerComposition,
    rejectedAnswerComposition: null,
    diagnostics: isCanonicalPrompt && sourceBackedRetrieval ? [] : ["unknown_prompt_fallback"],
  };
}

export function buildHardcodedSessionPatch(run: RunState): SessionPatch {
  return buildSessionPatchFromValidatedRun(run);
}

export function commitSessionPatch(options: CommitSessionPatchOptions): CommitSessionPatchResult {
  const liveSession = options.stores.sessions.read(options.patch.sessionId);
  if (!liveSession) {
    throw new Error(`Cannot commit Session Patch: Session ${options.patch.sessionId} was not found`);
  }

  if (options.stores.sessions.hasCommittedRun(options.patch.runId)) {
    const idempotentRun = {
      ...structuredClone(options.run),
      status: "committed",
      patch: structuredClone(options.patch),
      committedSessionState: liveSession,
    } satisfies RunState;

    return {
      applied: false,
      session: liveSession,
      run: options.stores.runs.update(idempotentRun),
    };
  }

  if (liveSession.revision !== options.patch.baseRevision) {
    throw new SessionPatchConflictError({
      runId: options.patch.runId,
      sessionId: options.patch.sessionId,
      baseRevision: options.patch.baseRevision,
      liveRevision: liveSession.revision,
    });
  }

  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const patchedSession = applySessionPatchOperations(liveSession, options.patch.operations);
  const committedSession: SessionState = {
    ...patchedSession,
    promptHistory: [
      ...(liveSession.promptHistory ?? []),
      {
        runId: options.run.runId,
        text: options.run.prompt.text,
        source: options.run.prompt.source,
        selectedSuggestedPromptId: options.run.prompt.selectedSuggestedPromptId,
        createdAt: options.run.createdAt,
      },
    ],
    revision: liveSession.revision + 1,
    updatedAt: timestamp,
  };
  const savedSession = options.stores.sessions.update(committedSession);
  options.stores.sessions.markCommittedRun(options.patch.runId);

  const committedRun: RunState = {
    ...structuredClone(options.run),
    status: "committed",
    updatedAt: timestamp,
    patch: structuredClone(options.patch),
    committedSessionState: savedSession,
  };

  return {
    applied: true,
    session: savedSession,
    run: options.stores.runs.update(committedRun),
  };
}

export function renderGuideSiteRunOperatorOutput(run: RunState): string {
  const committedSessionSummary = run.committedSessionState?.summary ?? null;
  const commitStatus = run.status === "committed" ? "committed" : "not_committed";
  return [
    renderStartRunOperatorOutput(run),
    "Prompt Understanding Provider:",
    JSON.stringify(run.promptUnderstandingProvider, null, 2),
    "Prompt Understanding Validation:",
    JSON.stringify(run.promptUnderstandingValidation, null, 2),
    renderPromptUnderstandingSummary(run),
    "Prompt Understanding:",
    JSON.stringify(run.understanding, null, 2),
    renderRetrievalOperatorOutput(run),
    renderAnswerCompositionValidationOperatorOutput(run),
    renderAnswerCompositionOperatorOutput(run),
    `Commit Status: ${commitStatus}`,
    "Session Patch:",
    JSON.stringify(run.patch, null, 2),
    "Committed Session Summary:",
    committedSessionSummary ?? "(none)",
    "Committed Session State:",
    JSON.stringify(run.committedSessionState, null, 2),
  ].join("\n");
}

function renderAnswerCompositionValidationOperatorOutput(run: RunState): string {
  if (!run.answerCompositionValidation) {
    return [
      "Answer Composition Validation:",
      "Answer Composition Validation Status: null",
      "Diagnostics:",
      "(none)",
      "Raw Answer Composition Validation JSON:",
      "null",
    ].join("\n");
  }

  return [
    "Answer Composition Validation:",
    `Answer Composition Validation Status: ${run.answerCompositionValidation.valid ? "pass" : "fail"}`,
    "Diagnostics:",
    ...renderDiagnosticsList(run.answerCompositionValidation.diagnostics),
    "Raw Answer Composition Validation JSON:",
    JSON.stringify(run.answerCompositionValidation, null, 2),
  ].join("\n");
}

function renderPromptUnderstandingSummary(run: RunState): string {
  if (!run.understanding) {
    return ["Prompt Understanding Summary:", "null"].join("\n");
  }

  const factLines = Object.entries(run.understanding.facts).map(
    ([factKey, fact]) => `${factKey}: ${fact.value} (${fact.provenance.source}; ${fact.provenance.promptText})`,
  );
  const concernLines = run.understanding.concerns.map(
    (concern) => `${concern.key}: ${concern.label} [${concern.status}; ${concern.provenance}]`,
  );

  return [
    "Prompt Understanding Summary:",
    `Goal: ${run.understanding.goal}`,
    `Prompt Type: ${run.understanding.promptType}`,
    `Fit Question: ${run.understanding.fitQuestion ?? "(none)"}`,
    "Facts:",
    ...(factLines.length > 0 ? factLines : ["(none)"]),
    "Concerns:",
    ...(concernLines.length > 0 ? concernLines : ["(none)"]),
    `Retrieval Needs: ${run.understanding.retrievalNeeds.join(", ") || "(none)"}`,
    `Context Needs: ${run.understanding.contextNeeds.join(", ") || "(none)"}`,
  ].join("\n");
}

function renderAnswerCompositionOperatorOutput(run: RunState): string {
  const answerComposition = run.answerComposition;
  if (!answerComposition) {
    return renderMissingAnswerCompositionOperatorOutput(run).join("\n");
  }

  const citationLines = renderAnswerCompositionCitations(answerComposition.citations, run.retrieval);

  return [
    "Answer Composition:",
    `Answer Composition Status: ${answerComposition.status}`,
    `Conversational Framing: ${answerComposition.conversationalFraming}`,
    "Answer Composition Sections:",
    ...(answerComposition.sections.length > 0
      ? answerComposition.sections.flatMap((section, index) => renderAnswerCompositionSection(section, index, run.retrieval))
      : ["(none)"]),
    "Suggested Prompts:",
    ...(answerComposition.suggestedPrompts.length > 0
      ? answerComposition.suggestedPrompts.flatMap((prompt, index) => renderSuggestedPrompt(prompt, index))
      : ["(none)"]),
    "Citations:",
    ...(citationLines.length > 0 ? citationLines : ["(none)"]),
    "Diagnostics:",
    ...(answerComposition.diagnostics.length > 0 ? answerComposition.diagnostics.map((diagnostic) => `- ${diagnostic}`) : ["(none)"]),
    "Raw Answer Composition JSON:",
    JSON.stringify(answerComposition, null, 2),
  ].join("\n");
}

function renderMissingAnswerCompositionOperatorOutput(run: RunState): string[] {
  const validationFailed = run.answerCompositionValidation?.valid === false;

  return [
    "Answer Composition:",
    `Answer Composition Status: ${validationFailed ? "validation_failed" : "null"}`,
    `Conversational Framing: ${
      validationFailed ? "I don't have enough verified information to answer that confidently." : "null"
    }`,
    "Answer Composition Sections:",
    "(none)",
    "Suggested Prompts:",
    "(none)",
    "Citations:",
    "(none)",
    "Diagnostics:",
    ...(validationFailed ? renderDiagnosticsList(run.answerCompositionValidation?.diagnostics ?? []) : ["(none)"]),
    "Raw Answer Composition JSON:",
    "null",
  ];
}

function renderAnswerCompositionSection(
  section: AnswerComposition["sections"][number],
  index: number,
  retrieval: RunState["retrieval"],
): string[] {
  const lines = [
    `Section ${index + 1}:`,
    `  Kind: ${section.kind}`,
    `  Title: ${section.title}`,
    `  Body: ${section.body}`,
  ];

  if (section.items && section.items.length > 0) {
    lines.push("  Items:");
    lines.push(...section.items.map((item) => `    - ${item}`));
  }

  if (section.sourceRefs && section.sourceRefs.length > 0) {
    lines.push("  Source Refs:");
    lines.push(...section.sourceRefs.flatMap((sourceRef) => renderSourceRef(sourceRef, retrieval)));
  }

  return lines;
}

function renderSourceRef(sourceRef: AnswerCompositionSourceRef, retrieval: RunState["retrieval"]): string[] {
  const retrievalResult = retrieval?.results.find((result) => result.sourceId === sourceRef.sourceId);
  return [
    `    Source Title: ${sourceRef.title}`,
    `    Source ID: ${sourceRef.sourceId}`,
    `    Source Type: ${sourceRef.sourceType}`,
    `    Field Path: ${sourceRef.fieldPath}`,
    `    Source Revision: ${sourceRef.sourceRevision}`,
    retrievalResult ? `    Matched Retrieval Title: ${retrievalResult.title}` : "    Matched Retrieval Title: (missing)",
  ];
}

function renderSuggestedPrompt(prompt: AnswerComposition["suggestedPrompts"][number], index: number): string[] {
  return [
    `Prompt ${index + 1}:`,
    `  ID: ${prompt.id}`,
    `  Purpose: ${prompt.purpose}`,
    `  Template ID: ${prompt.templateId}`,
    `  Text: ${prompt.text}`,
    `  Context Needs: ${prompt.contextNeeds.join(", ") || "(none)"}`,
    `  Concerns: ${prompt.concerns.join(", ") || "(none)"}`,
  ];
}

function renderAnswerCompositionCitations(citations: string[], retrieval: RunState["retrieval"]): string[] {
  const retrievalResultsById = new Map(retrieval?.results.map((result) => [result.sourceId, result]) ?? []);

  return citations.map((citation) => {
    const retrievalResult = retrievalResultsById.get(citation);
    return retrievalResult
      ? `${citation}: ${retrievalResult.title} [${retrievalResult.sourceType}; ${retrievalResult.fieldPath}; ${retrievalResult.sourceRevision}]`
      : `${citation}: (missing retrieval result)`;
  });
}

function renderRetrievalOperatorOutput(run: RunState): string {
  if (!run.retrieval) {
    return [
      "Retrieval Results:",
      "Retrieval Input:",
      "null",
      `Retrieval Status: ${run.status === "retrieval_failed" ? "failed" : "not_run"}`,
      ...(run.status === "retrieval_failed" ? ["Diagnostics:", ...renderDiagnosticsList(run.diagnostics)] : []),
      "Raw Retrieval Results JSON:",
      "null",
    ].join("\n");
  }

  const resultLines = run.retrieval.results.flatMap((result) => [
    `Source ID: ${result.sourceId}`,
    `Source Type: ${result.sourceType}`,
    `Source Title: ${result.title}`,
    `Rank: ${result.rank}`,
    `Field Path: ${result.fieldPath}`,
    `Source Revision: ${result.sourceRevision}`,
  ]);

  return [
    "Retrieval Results:",
    "Retrieval Input:",
    renderRetrievalAdapterLine(run.retrieval),
    `Needs: ${run.retrieval.needs.join(", ") || "(none)"}`,
    `Concerns: ${run.retrieval.concerns.join(", ") || "(none)"}`,
    `Retrieval Status: ${run.retrieval.coverage.status}`,
    !isSourceBackedRetrieval(run.retrieval)
      ? `No approved source material from ${describeRetrievalAdapter(run.retrieval)} matched the validated Prompt Understanding.`
      : null,
    ...run.retrieval.diagnostics.map((diagnostic) => `Diagnostic: ${diagnostic}`),
    "Matched Source Refs:",
    ...(resultLines.length > 0 ? resultLines : ["(none)"]),
    "Raw Retrieval Results JSON:",
    JSON.stringify(run.retrieval, null, 2),
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function renderDiagnosticsList(diagnostics: string[]): string[] {
  return diagnostics.length > 0 ? diagnostics.map((diagnostic) => `- ${diagnostic}`) : ["(none)"];
}
