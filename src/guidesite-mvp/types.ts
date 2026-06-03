export type SessionStatus = "active";
export type RunStatus = "started" | "composed" | "fallback" | "committed";
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

export type AnswerCompositionStatus = "needs_context" | "fallback";
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
}

export interface AnswerComposition {
  status: AnswerCompositionStatus;
  conversationalFraming: string;
  sections: AnswerCompositionSection[];
  suggestedPrompts: SuggestedPrompt[];
  citations: string[];
  diagnostics: string[];
}

export interface SessionPatch {
  runId: string;
  sessionId: string;
  baseRevision: number;
  visitorFacts: Record<string, VisitorFact>;
  concerns: Record<string, ConcernState>;
  focus: SessionFocus;
  suggestedPrompts: SuggestedPrompt[];
  summary: string;
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
  answerComposition: AnswerComposition | null;
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
