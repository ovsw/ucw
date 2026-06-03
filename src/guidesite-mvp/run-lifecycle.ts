import type {
  AnswerComposition,
  CommitSessionPatchOptions,
  CommitSessionPatchResult,
  GuideSiteStores,
  PromptUnderstanding,
  RunState,
  SessionPatch,
  SessionState,
  StartGuideSiteRunOptions,
  StartGuideSiteRunResult,
} from "./types.js";

const canonicalPromptText = "Is overnight camp right for my 8-year-old?";

function createDefaultSessionId(): string {
  return `session_${crypto.randomUUID()}`;
}

function createDefaultRunId(): string {
  return `run_${crypto.randomUUID()}`;
}

function cloneSessionState(session: SessionState): SessionState {
  return structuredClone(session);
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

export function renderStartRunOperatorOutput(run: RunState): string {
  return [
    "GuideSite Start Run",
    `Prompt: ${run.prompt.text}`,
    `Session ID: ${run.sessionId}`,
    `Run ID: ${run.runId}`,
    `Base Session Revision: ${run.baseSessionRevision}`,
    "Snapshot:",
    JSON.stringify(run.snapshot, null, 2),
  ].join("\n");
}

export function createGuideSiteMemoryStores(): GuideSiteStores {
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
    runs: {
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
    answerComposition: null,
    patch: null,
    committedSessionState: null,
    diagnostics: [],
  };

  return {
    session,
    run: options.stores.runs.create(run),
  };
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

function createCanonicalAnswerComposition(): AnswerComposition {
  return {
    status: "needs_context",
    conversationalFraming:
      "Age 8 is relevant, but the GuideSite needs more Visitor Context before it can honestly assess Fit.",
    sections: [
      {
        kind: "summary",
        title: "Known Context",
        body: "The Parent is asking about overnight camp for an 8-year-old Child.",
      },
      {
        kind: "fit_status",
        title: "Fit Status",
        body: "Fit cannot be assessed honestly yet because prior sleepaway experience and Child Readiness are still unknown.",
      },
      {
        kind: "concerns",
        title: "Open Concerns",
        body: "Homesickness and Child Readiness should stay visible as open Concerns.",
        items: ["homesickness", "child_readiness"],
      },
      {
        kind: "context_needs",
        title: "Missing Visitor Context",
        body: "The next turn should gather prior sleepaway experience and Child Readiness.",
        items: ["prior_sleepaway_experience", "child_readiness"],
      },
      {
        kind: "suggested_prompts",
        title: "Suggested Prompts",
        body: "Controlled prompts gather the missing Visitor Context.",
        items: ["prompt_prior_sleepaway_experience", "prompt_child_readiness"],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "No source-backed Fit recommendation was attempted in this Sprint 1 slice.",
      },
    ],
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
      {
        id: "prompt_child_readiness",
        purpose: "gather_fit_context",
        text: "How does your child usually handle new routines or time away from you?",
        contextNeeds: ["child_readiness"],
        concerns: ["child_readiness"],
        templateId: "ask_child_readiness",
      },
    ],
    citations: [],
    diagnostics: ["needs_visitor_context", "no_fit_recommendation"],
  };
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

export function withHardcodedUnderstandingAndComposition(
  run: RunState,
  options: { now?: () => Date } = {},
): RunState {
  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const isCanonicalPrompt = run.prompt.text === canonicalPromptText;

  return {
    ...structuredClone(run),
    status: isCanonicalPrompt ? "composed" : "fallback",
    updatedAt: timestamp,
    understanding: isCanonicalPrompt ? createCanonicalUnderstanding() : createFallbackUnderstanding(),
    answerComposition: isCanonicalPrompt ? createCanonicalAnswerComposition() : createFallbackAnswerComposition(),
    patch: null,
    committedSessionState: null,
    diagnostics: isCanonicalPrompt ? [] : ["unknown_prompt_fallback"],
  };
}

export function buildHardcodedSessionPatch(run: RunState): SessionPatch {
  if (!run.understanding || !run.answerComposition || run.answerComposition.status !== "needs_context") {
    throw new Error("Cannot build hardcoded Session Patch without a needs-context canonical run");
  }

  return {
    runId: run.runId,
    sessionId: run.sessionId,
    baseRevision: run.baseSessionRevision,
    visitorFacts: {
      child_age: {
        value: 8,
        source: "explicit",
        sourceRunId: run.runId,
        status: "active",
      },
    },
    concerns: {
      homesickness: {
        status: "open",
        sourceRunIds: [run.runId],
      },
      child_readiness: {
        status: "open",
        sourceRunIds: [run.runId],
      },
    },
    focus: {
      goal: "assess_fit",
      contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
    },
    suggestedPrompts: run.answerComposition.suggestedPrompts,
    summary: "Parent is assessing overnight camp Fit for an 8-year-old Child.",
  };
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
    throw new Error(
      `Cannot commit Session Patch for run ${options.patch.runId}: base revision ${options.patch.baseRevision} does not match live revision ${liveSession.revision}`,
    );
  }

  const timestamp = (options.now ?? (() => new Date()))().toISOString();
  const committedSession: SessionState = {
    ...liveSession,
    revision: liveSession.revision + 1,
    updatedAt: timestamp,
    visitorFacts: structuredClone(options.patch.visitorFacts),
    concerns: structuredClone(options.patch.concerns),
    focus: structuredClone(options.patch.focus),
    suggestedPrompts: structuredClone(options.patch.suggestedPrompts),
    summary: options.patch.summary,
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
  return [
    renderStartRunOperatorOutput(run),
    "Prompt Understanding:",
    JSON.stringify(run.understanding, null, 2),
    "Answer Composition:",
    JSON.stringify(run.answerComposition, null, 2),
    "Session Patch:",
    JSON.stringify(run.patch, null, 2),
    "Committed Session State:",
    JSON.stringify(run.committedSessionState, null, 2),
  ].join("\n");
}
