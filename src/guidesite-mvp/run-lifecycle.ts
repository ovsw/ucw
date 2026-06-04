import type {
  AnswerComposition,
  AnswerCompositionSourceRef,
  CommitSessionPatchOptions,
  CommitSessionPatchResult,
  GuideSiteStores,
  PromptUnderstanding,
  PromptUnderstandingProviderTrace,
  PromptUnderstandingSessionContext,
  RunState,
  RunStore,
  SessionPatch,
  SessionState,
  StartGuideSiteRunOptions,
  StartGuideSiteRunResult,
} from "./types.js";
import { applySessionPatchOperations } from "./patch-engine.js";
import {
  createFixtureGuideSiteRetrievalAdapter,
  loadCanonicalGuideSiteSourcePack,
  type GuideSiteRetrievalAdapter,
  type GuideSiteRetrievalResult,
} from "./fixture-retrieval.js";
import {
  PromptUnderstandingProviderError,
  type PromptUnderstandingProvider,
} from "./openai-prompt-understanding.js";
import {
  assessPromptUnderstandingCandidate,
  validatePromptUnderstandingMeaning,
} from "./prompt-understanding.js";
import { validateAnswerCompositionCandidate } from "./answer-composition-contract.js";
import { buildSessionPatchFromValidatedRun } from "./session-patch-builder.js";
import { formatChildAge } from "./age-formatting.js";
import { getApprovedContextNeedPromptTemplate } from "./suggested-prompt-templates.js";

const canonicalPromptText = "Is overnight camp right for my 8-year-old?";
const canonicalGuideSiteSourcePack = loadCanonicalGuideSiteSourcePack();
const canonicalGuideSiteSourceLookup = new Map(
  canonicalGuideSiteSourcePack.documents.map((document) => [document._id, document] as const),
);

type CanonicalGuideSiteSource = (typeof canonicalGuideSiteSourcePack.documents)[number];

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
    `Session ID: ${run.sessionId}`,
    `Run ID: ${run.runId}`,
    `Base Revision: ${run.baseSessionRevision}`,
    `Session Revision: ${run.snapshot.revision}`,
    "Snapshot:",
    JSON.stringify(run.snapshot, null, 2),
  ].join("\n");
}

export function createGuideSiteMemoryStores(options: { runs?: RunStore } = {}): GuideSiteStores {
  const sessions = new Map<string, SessionState>();
  const runs = new Map<string, RunState>();
  const committedRunIds = new Set<string>();

  return {
    sessions: {
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
    },
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
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const assessment = assessPromptUnderstandingCandidate(candidate);
  const validation = {
    valid: assessment.accepted,
    diagnostics: assessment.diagnostics,
  };

  if (!validation.valid) {
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

  const retrievalAdapter = options.retrievalAdapter ?? createFixtureGuideSiteRetrievalAdapter();
  const retrieval = retrievalAdapter.retrieve(candidate);
  const sourceBackedRetrieval = isSourceBackedRetrieval(retrieval);
  const answerComposition = sourceBackedRetrieval
    ? createValidatedAnswerComposition({ ...run, understanding: candidate, retrieval }, retrieval)
    : createInsufficientSourceAnswerComposition(retrieval.diagnostics);
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
  } = {},
): Promise<RunState> {
  try {
    const sessionContext = createPromptUnderstandingSessionContext(run.snapshot);
    const result = await provider.understandPrompt(run.prompt.text, sessionContext);

    return withPromptUnderstandingCandidate(run, result.understanding, {
      now: options.now,
      providerTrace: result.trace,
      retrievalAdapter: options.retrievalAdapter,
    });
  } catch (error) {
    return createProviderFailureRun(run, error, options);
  }
}

function createCanonicalUnderstanding(): PromptUnderstanding {
  return {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
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

function getCanonicalGuideSiteSource(sourceId: string): CanonicalGuideSiteSource | null {
  return canonicalGuideSiteSourceLookup.get(sourceId) ?? null;
}

function getCanonicalGuideSiteSourceText(sourceId: string): string | null {
  const source = getCanonicalGuideSiteSource(sourceId);
  if (!source) {
    return null;
  }

  return source.summary?.trim() || source.body?.trim() || source.contentMap?.trim() || null;
}

type SuggestedPromptDerivation = {
  suggestedPrompts: AnswerComposition["suggestedPrompts"];
  diagnostics: string[];
};
const canonicalSummarySourceIds = ["program_overnight"] as const;
const canonicalConcernSourceIds = ["policy_homesickness", "policy_parent_communication"] as const;

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

function createPriorSleepawayExperienceSummary(
  priorSleepawayExperience: string | number | boolean | undefined,
): string | null {
  if (priorSleepawayExperience === undefined) {
    return null;
  }

  if (typeof priorSleepawayExperience === "string") {
    return "The Child has prior sleepaway experience with grandparents.";
  }

  return "The Child has prior sleepaway experience.";
}

function createNeedContextSummary(run: RunState): string {
  const childAge = run.understanding?.facts.child_age?.value;
  const priorSleepawayExperience = run.understanding?.facts.prior_sleepaway_experience?.value;
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
  const contextNeeds = run.understanding?.contextNeeds ?? [];
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

  const prompts: AnswerComposition["suggestedPrompts"] = [];
  const diagnostics: string[] = [];

  for (const contextNeed of understanding.contextNeeds) {
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
    body: "Approved fixture source material was retrieved for the validated Prompt Understanding.",
    items: retrieval.results.map((result) => `${result.title} (${result.sourceId})`),
    sourceRefs: createSourceRefs(
      retrieval.results.map((result) => result.sourceId),
      retrieval,
    ),
  };
}

function createConcernAnswerSourceIds(retrieval: NonNullable<RunState["retrieval"]>): {
  available: string[];
  missing: string[];
} {
  const requiredSourceIds = ["concern_homesickness", "policy_homesickness", "policy_parent_communication"] as const;
  const availableSourceIds = new Set(retrieval.results.map((result) => result.sourceId));
  const available = requiredSourceIds.filter((sourceId) => availableSourceIds.has(sourceId));
  const missing = requiredSourceIds.filter((sourceId) => !availableSourceIds.has(sourceId));

  return {
    available: [...available],
    missing: [...missing],
  };
}

function createConcernAnswerDiagnostic(missingSourceIds: string[]): string {
  return `homesickness_answer_partial_missing_source_material: ${formatList(missingSourceIds)}`;
}

function createHomesicknessConcernAnswerComposition(
  retrieval: NonNullable<RunState["retrieval"]>,
): AnswerComposition {
  const { available, missing } = createConcernAnswerSourceIds(retrieval);
  const sourceRefs = createSourceRefs(available, retrieval);
  const concernSummary = getCanonicalGuideSiteSourceText("concern_homesickness");
  const homesicknessPolicySummary = getCanonicalGuideSiteSourceText("policy_homesickness");
  const parentCommunicationSummary = getCanonicalGuideSiteSourceText("policy_parent_communication");
  const availableText = [concernSummary, homesicknessPolicySummary, parentCommunicationSummary]
    .filter((text): text is string => typeof text === "string" && text.length > 0)
    .join(" ");
  const answered = missing.length === 0;
  const diagnostics = answered ? [] : [createConcernAnswerDiagnostic(missing)];

  return {
    status: answered ? "answered" : "partial",
    conversationalFraming: answered
      ? "The approved fixture material explains how the camp handles homesickness."
      : "The approved fixture material supports a partial homesickness answer, but some source material was unavailable.",
    sections: [
      {
        kind: "summary",
        title: "Homesickness Answer",
        body:
          availableText ||
          "Approved fixture source material for the homesickness concern was not available in full.",
        sourceRefs,
      },
      {
        kind: "concerns",
        title: "Concern",
        body:
          getCanonicalGuideSiteSourceText("concern_homesickness") ??
          "Homesickness remains an open Concern in the validated Prompt Understanding.",
        items: ["homesickness"],
        sourceRefs: createSourceRefs(
          available.length > 0 ? available : ["concern_homesickness"],
          retrieval,
        ),
      },
      {
        kind: "sources",
        title: "Sources",
        body: "Approved fixture source material was retrieved for the homesickness concern.",
        items: available.map((sourceId) => {
          const source = getCanonicalGuideSiteSource(sourceId);
          return source ? `${source.title} (${sourceId})` : sourceId;
        }),
        sourceRefs,
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: answered
          ? "All required source material was available."
          : `Partial homesickness answer because ${formatList(missing)} was unavailable.`,
      },
    ],
    suggestedPrompts: [],
    citations: available,
    diagnostics,
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
    return createCanonicalAnswerComposition(run, retrieval);
  }

  if (run.understanding?.concerns.some((concern) => concern.key === "homesickness")) {
    return createHomesicknessConcernAnswerComposition(retrieval);
  }

  return createInsufficientSourceAnswerComposition([...retrieval.diagnostics, "unsupported_answer_composition_goal"]);
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

function createInsufficientSourceAnswerComposition(diagnostics: string[]): AnswerComposition {
  return {
    status: "fallback",
    conversationalFraming: "The GuideSite fixture retrieval did not find approved source material for this Prompt.",
    sections: [
      {
        kind: "diagnostics",
        title: "Insufficient Source Material",
        body: "No fixture sources matched the validated Prompt Understanding, so no source-backed answer material was composed.",
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
  const validation = validatePromptUnderstandingMeaning(understanding);
  const retrievalAdapter = createFixtureGuideSiteRetrievalAdapter();
  const retrieval = validation.valid ? retrievalAdapter.retrieve(understanding) : null;
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
    return ["Answer Composition Validation:", "null"].join("\n");
  }

  return ["Answer Composition Validation:", JSON.stringify(run.answerCompositionValidation, null, 2)].join("\n");
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
  const diagnostics =
    validationFailed && run.answerCompositionValidation?.diagnostics.length
      ? run.answerCompositionValidation.diagnostics.map((diagnostic) => `- ${diagnostic}`)
      : ["(none)"];

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
    ...diagnostics,
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
    return ["Retrieval Results:", "Retrieval Input:", "null", "Retrieval Status: not_run"].join("\n");
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
    `Needs: ${run.retrieval.needs.join(", ") || "(none)"}`,
    `Concerns: ${run.retrieval.concerns.join(", ") || "(none)"}`,
    `Retrieval Status: ${run.retrieval.coverage.status}`,
    !isSourceBackedRetrieval(run.retrieval)
      ? "No fixture sources matched the validated Prompt Understanding."
      : null,
    ...run.retrieval.diagnostics.map((diagnostic) => `Diagnostic: ${diagnostic}`),
    "Matched Source Refs:",
    ...(resultLines.length > 0 ? resultLines : ["(none)"]),
  ]
    .filter((line) => line !== null)
    .join("\n");
}
