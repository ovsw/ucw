import type { AnswerComposition, AnswerCompositionSection, RunState, SuggestedPrompt } from "./types.ts";
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
  sourceId: string;
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

export interface GuideSiteOperatorDiagnostics {
  runId: string | null;
  sessionId: string | null;
  runStatus: RunState["status"] | "loading";
  provider: string | null;
  model: string | null;
  diagnostics: string[];
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
    sourceId: sourceRef.sourceId,
    label: sourceRef.title,
  }));
}

function collectPresentationSections(answerComposition: AnswerComposition): GuideSitePresentationSection[] {
  return answerComposition.sections
    .filter((section) => section.kind !== "diagnostics")
    .map((section) => ({
      title: section.title,
      body: section.body,
      items: section.items,
      citations: collectSectionCitations(section),
    }));
}

function collectAnswerCitations(sections: GuideSitePresentationSection[]): GuideSiteCitation[] {
  const citationsBySourceId = new Map<string, GuideSiteCitation>();

  for (const section of sections) {
    for (const citation of section.citations) {
      if (!citationsBySourceId.has(citation.sourceId)) {
        citationsBySourceId.set(citation.sourceId, citation);
      }
    }
  }

  return [...citationsBySourceId.values()];
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

function splitSuggestedPrompts(run: RunState, answerComposition: AnswerComposition): {
  requiredQuestions: GuideSiteRequiredQuestion[];
  suggestedPrompts: GuideSiteSuggestedPromptSummary[];
} {
  const contextNeedRationales = collectContextNeedRationales(answerComposition);
  const unresolvedContextNeeds = run.understanding ? new Set(collectUnresolvedContextNeeds(run)) : null;
  const requiredPrompts = new Map<string, GuideSiteRequiredQuestion>();
  const optionalPrompts: GuideSiteSuggestedPromptSummary[] = [];

  for (const prompt of answerComposition.suggestedPrompts) {
    const promptSummary: GuideSiteSuggestedPromptSummary = {
      id: prompt.id,
      text: prompt.text,
      purpose: prompt.purpose,
    };
    if (unresolvedContextNeeds) {
      const unresolvedPromptContextNeeds = prompt.contextNeeds.filter((contextNeed) =>
        unresolvedContextNeeds.has(contextNeed),
      );
      if (unresolvedPromptContextNeeds.length === 0) {
        continue;
      }
    }

    const matchingRequiredRationales = prompt.contextNeeds
      .map((contextNeed) => contextNeedRationales.get(contextNeed))
      .filter((rationale): rationale is string => rationale !== undefined);

    if (matchingRequiredRationales.length > 0) {
      requiredPrompts.set(prompt.id, {
        id: prompt.id,
        text: prompt.text,
        rationale: joinRequiredPromptRationales(matchingRequiredRationales),
        controlledReplies: [promptSummary],
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
): GuideSiteContextGatheringResponsePresentation {
  const prompts = splitSuggestedPrompts(run, answerComposition);

  return {
    status: "context_gathering_response",
    conversationalFraming: answerComposition.conversationalFraming,
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
): GuideSiteResponsibleAbstentionPresentation {
  const suggestedNextSteps = answerComposition.suggestedPrompts.map((prompt) => prompt.text);

  return {
    status: "responsible_abstention",
    conversationalFraming: answerComposition.conversationalFraming,
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
  const operatorDiagnostics = createOperatorDiagnostics(run, run.diagnostics);

  switch (run.status) {
    case "prompt_understanding_failed":
    case "retrieval_failed":
    case "validation_failed":
      return {
        camp,
        answer: mapTechnicalFailurePresentation(),
        operatorDiagnostics,
      };
  }

  const answerComposition = run.answerComposition;
  if (!answerComposition) {
    return {
      camp,
      answer: mapTechnicalFailurePresentation(),
      operatorDiagnostics,
    };
  }

  switch (answerComposition.status) {
    case "needs_context":
      return {
        camp,
        answer: mapContextGatheringPresentation(run, answerComposition),
        operatorDiagnostics,
      };
    case "answered":
    case "partial":
      return {
        camp,
        answer: mapAssembledAnswerPresentation(answerComposition),
        operatorDiagnostics,
      };
    case "fallback":
      return {
        camp,
        answer: mapResponsibleAbstentionPresentation(answerComposition),
        operatorDiagnostics,
      };
  }

  throw new Error(`Unsupported GuideSite answer composition status: ${(answerComposition as AnswerComposition).status}`);
}
