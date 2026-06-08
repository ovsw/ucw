import type { AnswerComposition, AnswerCompositionSection, PromptUnderstandingProviderTrace, RetrievalResults, RunState, SuggestedPrompt } from "./types.ts";
import { collectUnresolvedContextNeeds } from "./context-needs.ts";

export interface GuideSiteCampThemeStub {
  campId: string;
  campName: string;
  answerAccent: string;
  surfaceTone: string;
  operatorChrome: string;
}

export const ULTIMATE_CAMP_WEBSITE_THEME_STUB: GuideSiteCampThemeStub = {
  campId: "ultimate-camp-website",
  campName: "Ultimate Camp Website",
  answerAccent: "amber",
  surfaceTone: "warm-sand",
  operatorChrome: "slate",
};

export interface GuideSiteCitation {
  label: string;
}

export interface GuideSitePresentationSection {
  title: string;
  body: string;
  items?: string[];
  citations: GuideSiteCitation[];
}

export interface GuideSiteSuggestedPromptSummary {
  id: string;
  text: string;
  purpose: SuggestedPrompt["purpose"];
}

export interface GuideSiteRequiredQuestion {
  id: string;
  text: string;
  rationale: string | null;
  controlledReplies: GuideSiteSuggestedPromptSummary[];
}

type RequiredContextControlledReplyOption = {
  idSuffix: string;
  text: string;
};

const REQUIRED_CONTEXT_CONTROLLED_REPLY_OPTIONS: Record<string, readonly RequiredContextControlledReplyOption[]> = {
  prior_sleepaway_experience: [
    {
      idSuffix: "yes_grandparents",
      text: "Yes, with grandparents.",
    },
    {
      idSuffix: "no_not_yet",
      text: "No, not yet - she has not slept away from home.",
    },
  ],
  child_readiness: [
    {
      idSuffix: "handles_new_routines",
      text: "Yes, handles new routines well and asks adults for help.",
    },
    {
      idSuffix: "needs_more_support",
      text: "Needs more readiness support with new routines and time away.",
    },
  ],
};
export interface GuideSiteJourneyTimelinePrompt {
  runId: string;
  text: string;
  source: RunState["prompt"]["source"];
  createdAt: string;
}

export interface GuideSiteJourneyTimelineFact {
  key: string;
  label: string;
  value: string;
  source: string;
}

export interface GuideSiteJourneyTimelineConcern {
  key: string;
  label: string;
  status: "open" | "addressed";
}

export interface GuideSiteJourneyTimeline {
  prompts: GuideSiteJourneyTimelinePrompt[];
  visitorContext: GuideSiteJourneyTimelineFact[];
  concerns: GuideSiteJourneyTimelineConcern[];
  sessionSummary: string | null;
}


export interface GuideSiteOperatorDiagnostics {
  runId: string | null;
  sessionId: string | null;
  runStatus: RunState["status"] | "loading";
  provider: string | null;
  model: string | null;
  diagnostics: string[];
}

export interface GuideSitePromptUnderstandingInspection {
  summary: {
    goal: NonNullable<RunState["understanding"]>["goal"] | null;
    promptType: NonNullable<RunState["understanding"]>["promptType"] | null;
    fitQuestion: string | null;
    factCount: number;
    concernCount: number;
    retrievalNeeds: string[];
    contextNeeds: string[];
  };
  details: RunState["understanding"];
}

export interface GuideSiteRetrievalInspection {
  summary: {
    adapterId: string | null;
    adapterLabel: string | null;
    coverageStatus: NonNullable<RunState["retrieval"]>["coverage"]["status"] | "not_run";
    matchedSourceCount: number;
    retrievedSourceCount: number;
    needs: string[];
    concerns: string[];
    coverageExplanation: string;
    retrievalDiagnostics: string[];
    editorialGaps: string[];
  };
  sourceCoverage: Array<{
    sourceId: string;
    sourceType: string;
    title: string;
    rank: number;
    fieldPath: string;
    sourceRevision: string;
    matched: boolean;
  }>;
  details: RetrievalResults | null;
}

export interface GuideSiteValidationInspection {
  summary: {
    answerDisposition: GuideSitePresentationAnswer["status"] | "not_rendered";
    promptUnderstandingValid: boolean | null;
    answerCompositionValid: boolean | null;
    reasoning: string[];
  };
  details: {
    promptUnderstanding: RunState["promptUnderstandingValidation"];
    answerComposition: RunState["answerCompositionValidation"];
    rejectedAnswerComposition: RunState["rejectedAnswerComposition"];
  };
}

export interface GuideSiteProviderInspection {
  summary: {
    provider: PromptUnderstandingProviderTrace["provider"] | null;
    model: string | null;
    diagnosticCount: number;
  };
  details: PromptUnderstandingProviderTrace | null;
}

export interface GuideSiteRawStructuredOutputInspection {
  summary: {
    hasProviderRawOutput: boolean;
    hasProviderParsedOutput: boolean;
    hasPromptUnderstanding: boolean;
    hasRetrieval: boolean;
    hasAnswerComposition: boolean;
    hasRejectedAnswerComposition: boolean;
  };
  details: {
    providerRawOutput: string | null;
    providerParsedOutput: unknown;
    promptUnderstanding: RunState["understanding"];
    retrieval: RunState["retrieval"];
    answerComposition: RunState["answerComposition"];
    rejectedAnswerComposition: RunState["rejectedAnswerComposition"];
  };
}

export interface GuideSiteOperatorInspection {
  promptUnderstanding: GuideSitePromptUnderstandingInspection;
  retrieval: GuideSiteRetrievalInspection;
  validation: GuideSiteValidationInspection;
  diagnostics: {
    summary: string[];
    details: string[];
  };
  providerMetadata: GuideSiteProviderInspection;
  rawStructuredOutput: GuideSiteRawStructuredOutputInspection;
}

export interface GuideSiteLoadingPresentation {
  status: "loading";
  headline: string;
  message: string;
}

export interface GuideSiteContextGatheringResponsePresentation {
  status: "context_gathering_response";
  conversationalFraming: string;
  requiredQuestions: GuideSiteRequiredQuestion[];
  suggestedPrompts: GuideSiteSuggestedPromptSummary[];
}

export interface GuideSiteAssembledAnswerPresentation {
  status: "assembled_answer";
  completeness: "complete" | "partial";
  conversationalFraming: string;
  sections: GuideSitePresentationSection[];
  citations: GuideSiteCitation[];
}

export interface GuideSiteResponsibleAbstentionPresentation {
  status: "responsible_abstention";
  conversationalFraming: string;
  nextSteps: string[];
}

export interface GuideSiteTechnicalFailurePresentation {
  status: "technical_failure";
  title: string;
  message: string;
}

function titleCaseIdentifier(identifier: string): string {
  return identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatTimelineValue(value: string | number | boolean): string {
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}

function createJourneyTimeline(run: RunState | null): GuideSiteJourneyTimeline {
  if (!run) {
    return {
      prompts: [],
      visitorContext: [],
      concerns: [],
      sessionSummary: null,
    };
  }

  const session = run.committedSessionState ?? run.snapshot;
  const basePromptHistory = session.promptHistory ?? [];
  const promptHistory = run.committedSessionState
    ? basePromptHistory
    : [
        ...basePromptHistory,
        {
          runId: run.runId,
          text: run.prompt.text,
          source: run.prompt.source,
          selectedSuggestedPromptId: run.prompt.selectedSuggestedPromptId,
          createdAt: run.createdAt,
        },
      ];
  const factMap = new Map<string, GuideSiteJourneyTimelineFact>();
  const concernLabelByKey = new Map<string, string>();
  const concernStatusByKey = new Map<string, "open" | "addressed">();

  for (const [key, fact] of Object.entries(session.visitorFacts)) {
    if (fact.status !== "active") {
      continue;
    }
    factMap.set(key, {
      key,
      label: titleCaseIdentifier(key),
      value: formatTimelineValue(fact.value),
      source: fact.source,
    });
  }

  for (const [key, fact] of Object.entries(run.understanding?.facts ?? {})) {
    factMap.set(key, {
      key,
      label: titleCaseIdentifier(key),
      value: formatTimelineValue(fact.value),
      source: fact.provenance.source,
    });
  }

  for (const [key, concern] of Object.entries(session.concerns)) {
    if (concern.status === "open" || concern.status === "addressed") {
      concernLabelByKey.set(key, titleCaseIdentifier(key));
      concernStatusByKey.set(key, concern.status);
    }
  }

  for (const concern of run.understanding?.concerns ?? []) {
    if (concern.status === "open" || concern.status === "addressed") {
      concernLabelByKey.set(concern.key, concern.label);
      concernStatusByKey.set(concern.key, concern.status);
    }
  }

  if (run.answerComposition?.status === "answered") {
    for (const addressedConcernKey of run.answerComposition.sections
      .filter((section) => section.kind === "concerns")
      .flatMap((section) => section.items ?? [])) {
      concernLabelByKey.set(addressedConcernKey, concernLabelByKey.get(addressedConcernKey) ?? titleCaseIdentifier(addressedConcernKey));
      concernStatusByKey.set(addressedConcernKey, "addressed");
    }
  }

  return {
    prompts: promptHistory.map((prompt) => ({
      runId: prompt.runId,
      text: prompt.text,
      source: prompt.source,
      createdAt: prompt.createdAt,
    })),
    visitorContext: [...factMap.values()],
    concerns: [...concernStatusByKey.entries()].map(([key, status]) => ({
      key,
      label: concernLabelByKey.get(key) ?? titleCaseIdentifier(key),
      status,
    })),
    sessionSummary: session.summary.trim() || null,
  };
}

export type GuideSitePresentationAnswer =
  | GuideSiteLoadingPresentation
  | GuideSiteContextGatheringResponsePresentation
  | GuideSiteAssembledAnswerPresentation
  | GuideSiteResponsibleAbstentionPresentation
  | GuideSiteTechnicalFailurePresentation;

export interface GuideSitePresentation {
  camp: GuideSiteCampThemeStub;
  answer: GuideSitePresentationAnswer;
  operatorDiagnostics: GuideSiteOperatorDiagnostics;
  journeyTimeline: GuideSiteJourneyTimeline;
  operatorInspection: GuideSiteOperatorInspection;
}

function resolveCampTheme(options: { camp?: GuideSiteCampThemeStub } = {}): GuideSiteCampThemeStub {
  return options.camp ?? ULTIMATE_CAMP_WEBSITE_THEME_STUB;
}

function createOperatorDiagnostics(run: RunState | null, diagnostics: string[] = []): GuideSiteOperatorDiagnostics {
  return {
    runId: run?.runId ?? null,
    sessionId: run?.sessionId ?? null,
    runStatus: run?.status ?? "loading",
    provider: run?.promptUnderstandingProvider?.provider ?? null,
    model: run?.promptUnderstandingProvider?.model ?? null,
    diagnostics,
  };
}

function collectSectionCitations(section: AnswerCompositionSection): GuideSiteCitation[] {
  return (section.sourceRefs ?? []).map((sourceRef) => ({
    label: sourceRef.title,
  }));
}

function collectPresentationSections(answerComposition: AnswerComposition): GuideSitePresentationSection[] {
  return answerComposition.sections
    .filter((section) => section.kind !== "diagnostics" && section.kind !== "sources")
    .map((section) => ({
      title: section.title,
      body: section.body,
      items: section.items,
      citations: collectSectionCitations(section),
    }));
}

function collectAnswerCitations(sections: GuideSitePresentationSection[]): GuideSiteCitation[] {
  const citationsByLabel = new Map<string, GuideSiteCitation>();

  for (const section of sections) {
    for (const citation of section.citations) {
      if (!citationsByLabel.has(citation.label)) {
        citationsByLabel.set(citation.label, citation);
      }
    }
  }

  return [...citationsByLabel.values()];
}

function createPromptUnderstandingInspection(run: RunState | null): GuideSitePromptUnderstandingInspection {
  const understanding = run?.understanding ?? null;

  return {
    summary: {
      goal: understanding?.goal ?? null,
      promptType: understanding?.promptType ?? null,
      fitQuestion: understanding?.fitQuestion ?? null,
      factCount: understanding ? Object.keys(understanding.facts).length : 0,
      concernCount: understanding?.concerns.length ?? 0,
      retrievalNeeds: understanding?.retrievalNeeds ?? [],
      contextNeeds: understanding?.contextNeeds ?? [],
    },
    details: understanding,
  };
}

function createRetrievalCoverageExplanation(
  run: RunState | null,
  retrieval: RetrievalResults | null,
  matchedSourceCount: number,
): string {
  if (!run) {
    return "No run has started, so retrieval has not run.";
  }

  if (!retrieval) {
    return "Retrieval has not run for this turn.";
  }

  if (retrieval.coverage.status === "empty_retrieval") {
    return "No approved Sources of Truth matched the validated Prompt Understanding, so the answer cannot assemble from source-backed material.";
  }

  if (run.answerComposition?.status === "partial") {
    return `The answer candidate used ${matchedSourceCount} matched Sources of Truth, but coverage is partial and remains operator-gated.`;
  }

  if (run.answerComposition?.status === "fallback") {
    return "The system abstained because approved Sources of Truth were missing or insufficient for the validated Prompt Understanding.";
  }

  if (run.answerComposition?.status === "needs_context") {
    return `Retrieval found ${matchedSourceCount} matched Sources of Truth, but answer assembly stayed in context gathering until required Visitor Context is collected.`;
  }

  return `Retrieval found ${matchedSourceCount} matched Sources of Truth for the assembled answer.`;
}

function createEditorialGaps(run: RunState | null, retrieval: RetrievalResults | null): string[] {
  if (!retrieval) {
    return [];
  }

  const gaps: string[] = [];

  if (retrieval.coverage.status === "empty_retrieval") {
    gaps.push("Missing approved Sources of Truth for the validated retrieval needs or concerns.");
  }

  if (run?.answerComposition?.status === "partial") {
    gaps.push("Available Sources of Truth only support a partial answer candidate.");
  }

  for (const diagnostic of retrieval.diagnostics) {
    if (diagnostic.startsWith("insufficient_") || diagnostic.includes("unapproved_sources")) {
      gaps.push(diagnostic);
    }
  }

  return [...new Set(gaps)];
}

function createRetrievalInspection(run: RunState | null): GuideSiteRetrievalInspection {
  const retrieval = run?.retrieval ?? null;
  const matchedSourceIds = new Set(retrieval?.coverage.matchedSourceIds ?? []);

  return {
    summary: {
      adapterId: retrieval?.adapterId ?? null,
      adapterLabel: retrieval?.adapterLabel ?? null,
      coverageStatus: retrieval?.coverage.status ?? "not_run",
      matchedSourceCount: matchedSourceIds.size,
      retrievedSourceCount: retrieval?.results.length ?? 0,
      needs: retrieval?.needs ?? [],
      concerns: retrieval?.concerns ?? [],
      coverageExplanation: createRetrievalCoverageExplanation(run, retrieval, matchedSourceIds.size),
      retrievalDiagnostics: retrieval?.diagnostics ?? [],
      editorialGaps: createEditorialGaps(run, retrieval),
    },
    sourceCoverage: (retrieval?.results ?? []).map((result) => ({
      sourceId: result.sourceId,
      sourceType: result.sourceType,
      title: result.title,
      rank: result.rank,
      fieldPath: result.fieldPath,
      sourceRevision: result.sourceRevision,
      matched: matchedSourceIds.has(result.sourceId),
    })),
    details: retrieval,
  };
}

function createValidationReasoning(
  run: RunState | null,
  answerDisposition: GuideSiteValidationInspection["summary"]["answerDisposition"],
  diagnostics: string[],
): string[] {
  if (!run) {
    return ["No run has started yet."];
  }

  const reasoning: string[] = [];

  if (run.promptUnderstandingValidation && !run.promptUnderstandingValidation.valid) {
    reasoning.push("Prompt understanding failed validation before retrieval or answer composition.");
  }

  if (run.answerCompositionValidation && !run.answerCompositionValidation.valid) {
    reasoning.push("Answer composition failed validation before a Parent-shaped answer could be rendered.");
  }

  if (answerDisposition === "responsible_abstention") {
    reasoning.push("The system abstained rather than presenting an unsupported answer.");
  }

  if (answerDisposition === "context_gathering_response") {
    reasoning.push("The system requested required Visitor Context before answering.");
  }

  if (answerDisposition === "technical_failure") {
    reasoning.push("A technical failure prevented product answer rendering.");
  }

  if (diagnostics.length > 0) {
    reasoning.push(...diagnostics);
  }

  return reasoning;
}

function createValidationInspection(
  run: RunState | null,
  diagnostics: string[],
  answerDisposition: GuideSiteValidationInspection["summary"]["answerDisposition"],
): GuideSiteValidationInspection {
  return {
    summary: {
      answerDisposition,
      promptUnderstandingValid: run?.promptUnderstandingValidation?.valid ?? null,
      answerCompositionValid: run?.answerCompositionValidation?.valid ?? null,
      reasoning: createValidationReasoning(run, answerDisposition, diagnostics),
    },
    details: {
      promptUnderstanding: run?.promptUnderstandingValidation ?? null,
      answerComposition: run?.answerCompositionValidation ?? null,
      rejectedAnswerComposition: run?.rejectedAnswerComposition ?? null,
    },
  };
}

function createProviderInspection(run: RunState | null): GuideSiteProviderInspection {
  const providerTrace = run?.promptUnderstandingProvider ?? null;

  return {
    summary: {
      provider: providerTrace?.provider ?? null,
      model: providerTrace?.model ?? null,
      diagnosticCount: providerTrace?.diagnostics.length ?? 0,
    },
    details: providerTrace,
  };
}

function createRawStructuredOutputInspection(run: RunState | null): GuideSiteRawStructuredOutputInspection {
  const providerTrace = run?.promptUnderstandingProvider ?? null;
  const providerParsedOutput = providerTrace?.parsedOutput ?? null;
  const promptUnderstanding = run?.understanding ?? null;
  const retrieval = run?.retrieval ?? null;
  const answerComposition = run?.answerComposition ?? null;
  const rejectedAnswerComposition = run?.rejectedAnswerComposition ?? null;

  return {
    summary: {
      hasProviderRawOutput: providerTrace?.rawOutput !== null && providerTrace?.rawOutput !== undefined,
      hasProviderParsedOutput: providerParsedOutput !== null && providerParsedOutput !== undefined,
      hasPromptUnderstanding: promptUnderstanding !== null,
      hasRetrieval: retrieval !== null,
      hasAnswerComposition: answerComposition !== null,
      hasRejectedAnswerComposition: rejectedAnswerComposition !== null,
    },
    details: {
      providerRawOutput: providerTrace?.rawOutput ?? null,
      providerParsedOutput,
      promptUnderstanding,
      retrieval,
      answerComposition,
      rejectedAnswerComposition,
    },
  };
}

function createOperatorInspection(
  run: RunState | null,
  diagnostics: string[] = [],
  answerDisposition: GuideSiteValidationInspection["summary"]["answerDisposition"] = "not_rendered",
): GuideSiteOperatorInspection {
  return {
    promptUnderstanding: createPromptUnderstandingInspection(run),
    retrieval: createRetrievalInspection(run),
    validation: createValidationInspection(run, diagnostics, answerDisposition),
    diagnostics: {
      summary: diagnostics,
      details: diagnostics,
    },
    providerMetadata: createProviderInspection(run),
    rawStructuredOutput: createRawStructuredOutputInspection(run),
  };
}

function collectContextNeedRationales(answerComposition: AnswerComposition): Map<string, string> {
  const rationalesByContextNeedId = new Map<string, string>();

  for (const section of answerComposition.sections) {
    if (section.kind !== "context_needs" || !section.items) {
      continue;
    }

    for (const item of section.items) {
      if (!rationalesByContextNeedId.has(item)) {
        rationalesByContextNeedId.set(item, section.body);
      }
    }
  }

  return rationalesByContextNeedId;
}

function joinRequiredPromptRationales(rationales: string[]): string | null {
  const uniqueRationales = [...new Set(rationales)];

  if (uniqueRationales.length === 0) {
    return null;
  }

  return uniqueRationales.join(" ");
}

function createRequiredQuestionControlledReplies(prompt: SuggestedPrompt): GuideSiteSuggestedPromptSummary[] {
  return prompt.contextNeeds.flatMap((contextNeed) =>
    (REQUIRED_CONTEXT_CONTROLLED_REPLY_OPTIONS[contextNeed] ?? []).map((reply) => ({
      id: `${prompt.id}_${reply.idSuffix}`,
      text: reply.text,
      purpose: prompt.purpose,
    })),
  );
}

function splitSuggestedPrompts(run: RunState, answerComposition: AnswerComposition): {
  requiredQuestions: GuideSiteRequiredQuestion[];
  suggestedPrompts: GuideSiteSuggestedPromptSummary[];
} {
  const contextNeedRationales = collectContextNeedRationales(answerComposition);
  const unresolvedContextNeeds = new Set(run.understanding ? collectUnresolvedContextNeeds(run) : []);
  const requiredPrompts = new Map<string, GuideSiteRequiredQuestion>();
  const optionalPrompts: GuideSiteSuggestedPromptSummary[] = [];

  for (const prompt of answerComposition.suggestedPrompts) {
    const promptSummary: GuideSiteSuggestedPromptSummary = {
      id: prompt.id,
      text: prompt.text,
      purpose: prompt.purpose,
    };

    if (
      unresolvedContextNeeds.size > 0 &&
      !prompt.contextNeeds.some((contextNeed) => unresolvedContextNeeds.has(contextNeed))
    ) {
      continue;
    }

    const matchingRequiredRationales = prompt.contextNeeds
      .map((contextNeed) => contextNeedRationales.get(contextNeed))
      .filter((rationale): rationale is string => rationale !== undefined);

    if (matchingRequiredRationales.length > 0) {
      requiredPrompts.set(prompt.id, {
        id: prompt.id,
        text: prompt.text,
        rationale: joinRequiredPromptRationales(matchingRequiredRationales),
        controlledReplies: createRequiredQuestionControlledReplies(prompt),
      });
      continue;
    }

    optionalPrompts.push(promptSummary);
  }

  return {
    requiredQuestions: [...requiredPrompts.values()],
    suggestedPrompts: optionalPrompts,
  };
}

function mapContextGatheringPresentation(
  run: RunState,
  answerComposition: AnswerComposition,
  conversationalFraming?: string,
): GuideSiteContextGatheringResponsePresentation {
  const prompts = splitSuggestedPrompts(run, answerComposition);

  return {
    status: "context_gathering_response",
    conversationalFraming: conversationalFraming ?? answerComposition.conversationalFraming,
    requiredQuestions: prompts.requiredQuestions,
    suggestedPrompts: prompts.suggestedPrompts,
  };
}

function mapAssembledAnswerPresentation(answerComposition: AnswerComposition): GuideSiteAssembledAnswerPresentation {
  const sections = collectPresentationSections(answerComposition);

  return {
    status: "assembled_answer",
    completeness: answerComposition.status === "partial" ? "partial" : "complete",
    conversationalFraming: answerComposition.conversationalFraming,
    sections,
    citations: collectAnswerCitations(sections),
  };
}

function mapResponsibleAbstentionPresentation(
  answerComposition: AnswerComposition,
  conversationalFraming?: string,
): GuideSiteResponsibleAbstentionPresentation {
  const suggestedNextSteps = answerComposition.suggestedPrompts.map((prompt) => prompt.text);

  return {
    status: "responsible_abstention",
    conversationalFraming: conversationalFraming ?? answerComposition.conversationalFraming,
    nextSteps: suggestedNextSteps.length > 0 ? suggestedNextSteps : ["Provide more context in a follow-up turn."],
  };
}

function mapTechnicalFailurePresentation(): GuideSiteTechnicalFailurePresentation {
  return {
    status: "technical_failure",
    title: "Technical failure",
    message: "The GuideSite turn failed before a product answer could be rendered.",
  };
}

function mapValidationFailurePresentation(
  run: RunState,
  diagnostics: string[],
  options: { camp?: GuideSiteCampThemeStub } = {},
): GuideSitePresentation {
  return {
    camp: resolveCampTheme(options),
    answer: mapTechnicalFailurePresentation(),
    operatorDiagnostics: createOperatorDiagnostics(
      {
        ...run,
        status: "validation_failed",
      },
      diagnostics,
    ),
    journeyTimeline: createJourneyTimeline(run),
    operatorInspection: createOperatorInspection(
      {
        ...run,
        status: "validation_failed",
      },
      diagnostics,
      "technical_failure",
    ),
  };
}

function createGatedOperatorDiagnostics(run: RunState, diagnostics: string[]): GuideSiteOperatorDiagnostics {
  return createOperatorDiagnostics(run, [...run.diagnostics, ...diagnostics]);
}

export function createGuideSiteLoadingPresentation(options: { camp?: GuideSiteCampThemeStub } = {}): GuideSitePresentation {
  const camp = resolveCampTheme(options);

  return {
    camp,
    answer: {
      status: "loading",
      headline: `${camp.campName} answer presentation`,
      message: "Loading the operator demo surface.",
    },
    operatorDiagnostics: createOperatorDiagnostics(null),
    journeyTimeline: createJourneyTimeline(null),
    operatorInspection: createOperatorInspection(null, [], "loading"),
  };
}

export function createGuideSiteTechnicalFailurePresentation(
  diagnostics: string[],
  options: { camp?: GuideSiteCampThemeStub } = {},
): GuideSitePresentation {
  return {
    camp: resolveCampTheme(options),
    answer: mapTechnicalFailurePresentation(),
    operatorDiagnostics: createOperatorDiagnostics(null, diagnostics),
    journeyTimeline: createJourneyTimeline(null),
    operatorInspection: createOperatorInspection(null, diagnostics, "technical_failure"),
  };
}

export function mapGuideSiteRunStateToPresentation(
  run: RunState | null,
  options: { camp?: GuideSiteCampThemeStub } = {},
): GuideSitePresentation {
  if (!run || run.status === "started") {
    return createGuideSiteLoadingPresentation(options);
  }

  const camp = resolveCampTheme(options);

  if (run.status === "prompt_understanding_failed" || run.status === "retrieval_failed" || run.status === "validation_failed") {
    return {
      camp,
      answer: mapTechnicalFailurePresentation(),
      operatorDiagnostics: createOperatorDiagnostics(run, run.diagnostics),
      journeyTimeline: createJourneyTimeline(run),
      operatorInspection: createOperatorInspection(run, run.diagnostics, "technical_failure"),
    };
  }

  if (run.answerCompositionValidation && !run.answerCompositionValidation.valid) {
    return mapValidationFailurePresentation(run, [
      ...run.diagnostics,
      ...run.answerCompositionValidation.diagnostics,
    ], options);
  }

  const operatorDiagnostics = createOperatorDiagnostics(run, run.diagnostics);
  const answerComposition = run.answerComposition;

  if (!answerComposition) {
    return {
      camp,
      answer: mapTechnicalFailurePresentation(),
      operatorDiagnostics,
      journeyTimeline: createJourneyTimeline(run),
      operatorInspection: createOperatorInspection(run, run.diagnostics, "technical_failure"),
    };
  }

  if (answerComposition.status === "needs_context") {
    return {
      camp,
      answer: mapContextGatheringPresentation(run, answerComposition),
      operatorDiagnostics,
      journeyTimeline: createJourneyTimeline(run),
      operatorInspection: createOperatorInspection(run, run.diagnostics, "context_gathering_response"),
    };
  }

  if (answerComposition.status === "fallback") {
    return {
      camp,
      answer: mapResponsibleAbstentionPresentation(answerComposition),
      operatorDiagnostics,
      journeyTimeline: createJourneyTimeline(run),
      operatorInspection: createOperatorInspection(run, run.diagnostics, "responsible_abstention"),
    };
  }

  const unresolvedContextNeeds = run.understanding ? collectUnresolvedContextNeeds(run) : [];
  const hasUnresolvedContextNeeds = unresolvedContextNeeds.length > 0;
  const hasSourceBackedCoverage = run.retrieval?.coverage.status === "source_backed";

  if (answerComposition.status === "answered" || answerComposition.status === "partial") {
    if (hasUnresolvedContextNeeds) {
      return {
        camp,
        answer: mapContextGatheringPresentation(
          run,
          answerComposition,
          "The GuideSite needs more Visitor Context before it can honestly answer.",
        ),
        operatorDiagnostics: createGatedOperatorDiagnostics(run, [
          `assembled_answer_gated_by_unresolved_context_needs: ${unresolvedContextNeeds.join(", ")}`,
        ]),
        journeyTimeline: createJourneyTimeline(run),
        operatorInspection: createOperatorInspection(run, [
          ...run.diagnostics,
          `assembled_answer_gated_by_unresolved_context_needs: ${unresolvedContextNeeds.join(", ")}`,
        ], "context_gathering_response"),
      };
    }

    if (answerComposition.status === "partial" || !hasSourceBackedCoverage) {
      return {
        camp,
        answer: mapResponsibleAbstentionPresentation(answerComposition, "The GuideSite cannot responsibly answer this prompt yet."),
        operatorDiagnostics: createGatedOperatorDiagnostics(run, [
          answerComposition.status === "partial"
            ? "assembled_answer_gated_by_partial_source_coverage"
            : "assembled_answer_gated_by_insufficient_source_coverage",
        ]),
        journeyTimeline: createJourneyTimeline(run),
        operatorInspection: createOperatorInspection(run, [
          ...run.diagnostics,
          answerComposition.status === "partial"
            ? "assembled_answer_gated_by_partial_source_coverage"
            : "assembled_answer_gated_by_insufficient_source_coverage",
        ], "responsible_abstention"),
      };
    }

    return {
      camp,
      answer: mapAssembledAnswerPresentation(answerComposition),
      operatorDiagnostics,
      journeyTimeline: createJourneyTimeline(run),
      operatorInspection: createOperatorInspection(run, run.diagnostics, "assembled_answer"),
    };
  }

  throw new Error(`Unsupported GuideSite answer composition status: ${(answerComposition as AnswerComposition).status}`);
}
