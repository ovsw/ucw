export type SessionStatus = "active";
export type RunStatus =
  | "started"
  | "composed"
  | "fallback"
  | "validation_failed"
  | "prompt_understanding_failed"
  | "retrieval_failed"
  | "committed";
export type PromptSource = "typed" | "suggested_prompt";
export type VisitorFactSource = "explicit" | "inferred";
export type VisitorFactStatus = "active" | "superseded" | "disputed";
export type ConcernStatus = "open" | "addressed" | "deferred";
export type FocusGoal = "answer_factual" | "assess_fit" | "gather_context" | "address_concern" | "compare_options";
export type SuggestedPromptPurpose =
  | "gather_fit_context"
  | "clarify_constraints"
  | "address_concern"
  | "test_fit"
  | "compare_options"
  | "offer_contact_path"
  | "handle_insufficient_material";

export interface VisitorFact {
  value: string | number | boolean;
  source: VisitorFactSource;
  sourceRunId?: string;
  status: VisitorFactStatus;
}

export interface ConcernState {
  status: ConcernStatus;
  sourceRunIds: string[];
}

export interface SessionFocus {
  goal: FocusGoal | null;
  contextNeeds: string[];
}

export interface SuggestedPrompt {
  id: string;
  text: string;
  purpose: SuggestedPromptPurpose;
  contextNeeds: string[];
  concerns: string[];
  templateId: string;
}

export interface PromptUnderstandingFact {
  value: string | number | boolean;
  provenance: {
    source: VisitorFactSource;
    promptText: string;
  };
}

export interface PromptUnderstandingConcern {
  key: string;
  label: string;
  status: ConcernStatus;
  provenance: "explicit" | "implied";
}

export interface PromptUnderstanding {
  goal: FocusGoal | "unknown";
  promptType: "fit" | "factual" | "unknown";
  fitQuestion: string | null;
  facts: Record<string, PromptUnderstandingFact>;
  concerns: PromptUnderstandingConcern[];
  retrievalNeeds: string[];
  contextNeeds: string[];
}

export interface PromptUnderstandingSessionContext {
  session: SessionState;
}

export interface PromptUnderstandingValidationResult {
  valid: boolean;
  diagnostics: string[];
}

export interface PromptUnderstandingProviderTrace {
  provider: "openai" | "fake";
  model: string;
  rawOutput: string | null;
  parsedOutput: unknown;
  diagnostics: string[];
}

export type AnswerCompositionStatus = "needs_context" | "answered" | "partial" | "fallback";
export type AnswerSectionKind =
  | "summary"
  | "fit_status"
  | "concerns"
  | "context_needs"
  | "suggested_prompts"
  | "sources"
  | "diagnostics";

export interface AnswerCompositionSection {
  kind: AnswerSectionKind;
  title: string;
  body: string;
  items?: string[];
  sourceRefs?: AnswerCompositionSourceRef[];
}

export interface AnswerCompositionSourceRef {
  sourceId: string;
  sourceType: string;
  title: string;
  fieldPath: string;
  sourceRevision: string;
}

export interface AnswerComposition {
  status: AnswerCompositionStatus;
  conversationalFraming: string;
  sections: AnswerCompositionSection[];
  suggestedPrompts: SuggestedPrompt[];
  citations: string[];
  diagnostics: string[];
}

export interface AnswerCompositionValidationResult {
  valid: boolean;
  diagnostics: string[];
}

export interface RetrievalResult {
  sourceId: string;
  sourceType: string;
  title: string;
  rank: number;
  fieldPath: string;
  sourceRevision: string;
  sourceText: string;
}

export type RetrievalCoverage = {
  status: "source_backed" | "empty_retrieval";
  matchedSourceIds: string[];
};

export interface RetrievalResults {
  adapterId?: string;
  adapterLabel?: string;
  needs: string[];
  concerns: string[];
  results: RetrievalResult[];
  diagnostics: string[];
  coverage: RetrievalCoverage;
}

export interface SessionPatch {
  runId: string;
  sessionId: string;
  baseRevision: number;
  operations: SessionPatchOperation[];
}

export type SessionPatchOperation =
  | {
      type: "upsertFact";
      key: string;
      fact: VisitorFact;
    }
  | {
      type: "upsertConcern";
      key: string;
      concern: ConcernState;
    }
  | {
      type: "setFocus";
      focus: SessionFocus;
    }
  | {
      type: "replaceSuggestedPrompts";
      suggestedPrompts: SuggestedPrompt[];
    }
  | {
      type: "updateSummary";
      summary: string;
    };

export interface SessionPromptSummary {
  runId: string;
  text: string;
  source: PromptSource;
  selectedSuggestedPromptId: string | null;
  createdAt: string;
}

export interface SessionState {
  schemaVersion: 1;
  sessionId: string;
  revision: number;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  visitorFacts: Record<string, VisitorFact>;
  concerns: Record<string, ConcernState>;
  focus: SessionFocus;
  suggestedPrompts: SuggestedPrompt[];
  promptHistory?: SessionPromptSummary[];
  summary: string;
}

export interface RunPrompt {
  text: string;
  source: PromptSource;
  selectedSuggestedPromptId: string | null;
}

export interface RunState {
  schemaVersion: 1;
  runId: string;
  sessionId: string;
  baseSessionRevision: number;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  prompt: RunPrompt;
  snapshot: SessionState;
  understanding: PromptUnderstanding | null;
  promptUnderstandingProvider: PromptUnderstandingProviderTrace | null;
  promptUnderstandingValidation: PromptUnderstandingValidationResult | null;
  retrieval: RetrievalResults | null;
  answerCompositionValidation: AnswerCompositionValidationResult | null;
  answerComposition: AnswerComposition | null;
  rejectedAnswerComposition: AnswerComposition | null;
  patch: SessionPatch | null;
  committedSessionState: SessionState | null;
  diagnostics: string[];
}

export interface SessionStore {
  create(session: SessionState): SessionState;
  read(sessionId: string): SessionState | null;
  update(session: SessionState): SessionState;
  hasCommittedRun(runId: string): boolean;
  markCommittedRun(runId: string): void;
}

export interface RunStore {
  create(run: RunState): RunState;
  read(runId: string): RunState | null;
  update(run: RunState): RunState;
  inspect?(runId: string): { path: string } | null;
}

export interface GuideSiteStores {
  sessions: SessionStore;
  runs: RunStore;
}

export interface StartGuideSiteRunOptions {
  promptText: string;
  stores: GuideSiteStores;
  sessionId?: string;
  now?: () => Date;
  createSessionId?: () => string;
  createRunId?: () => string;
}

export interface StartGuideSiteRunResult {
  session: SessionState;
  run: RunState;
}

export interface CommitSessionPatchOptions {
  stores: GuideSiteStores;
  run: RunState;
  patch: SessionPatch;
  now?: () => Date;
}

export interface CommitSessionPatchResult {
  applied: boolean;
  session: SessionState;
  run: RunState;
}
