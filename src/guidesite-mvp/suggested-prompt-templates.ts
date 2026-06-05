import type { SuggestedPrompt } from "./types.ts";

export type ContextNeed = "prior_sleepaway_experience" | "child_readiness";

export interface ApprovedContextNeedPromptTemplate {
  templateId: string;
  text: string;
  purpose: SuggestedPrompt["purpose"];
  concerns: readonly string[];
}

export const approvedContextNeedPromptTemplates = {
  prior_sleepaway_experience: {
    templateId: "ask_sleepaway_experience",
    text: "Has your child slept away from home before?",
    purpose: "gather_fit_context",
    concerns: ["homesickness"],
  },
  child_readiness: {
    templateId: "ask_child_readiness",
    text: "How does your child usually handle new routines or time away from you?",
    purpose: "gather_fit_context",
    concerns: ["child_readiness"],
  },
} as const satisfies Record<ContextNeed, ApprovedContextNeedPromptTemplate>;

export function getApprovedContextNeedPromptTemplate(contextNeed: string): ApprovedContextNeedPromptTemplate | null {
  return Object.prototype.hasOwnProperty.call(approvedContextNeedPromptTemplates, contextNeed)
    ? approvedContextNeedPromptTemplates[contextNeed as ContextNeed]
    : null;
}
