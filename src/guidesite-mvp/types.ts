export type SessionStatus = "active";
export type RunStatus = "started";
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
  diagnostics: string[];
}

export interface SessionStore {
  create(session: SessionState): SessionState;
  read(sessionId: string): SessionState | null;
  update(session: SessionState): SessionState;
}

export interface RunStore {
  create(run: RunState): RunState;
  read(runId: string): RunState | null;
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
