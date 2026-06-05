import type {
  PromptUnderstanding,
  PromptUnderstandingValidationResult,
} from "./types.ts";

export type PromptUnderstandingAssessment =
  | {
      accepted: true;
      understanding: PromptUnderstanding;
      diagnostics: [];
    }
  | {
      accepted: false;
      understanding: null;
      diagnostics: string[];
    };

export function validatePromptUnderstandingMeaning(
  understanding: PromptUnderstanding,
): PromptUnderstandingValidationResult {
  const diagnostics: string[] = [];

  if (understanding.goal === "unknown") {
    diagnostics.push("prompt_understanding_goal_required");
  }

  if (understanding.promptType === "unknown") {
    diagnostics.push("prompt_understanding_prompt_type_required");
  }

  if (understanding.promptType === "fit" && !understanding.fitQuestion?.trim()) {
    diagnostics.push("prompt_understanding_fit_question_required");
  }

  for (const [factKey, fact] of Object.entries(understanding.facts)) {
    if (!fact.provenance.promptText.trim()) {
      diagnostics.push(`prompt_understanding_fact_${factKey}_prompt_text_required`);
    }

    if (fact.provenance.source !== "explicit") {
      diagnostics.push(`prompt_understanding_fact_${factKey}_explicit_provenance_required`);
    }
  }

  understanding.concerns.forEach((concern, index) => {
    if (!concern.key.trim()) {
      diagnostics.push(`prompt_understanding_concern_${index}_key_required`);
    }

    if (!concern.label.trim()) {
      diagnostics.push(`prompt_understanding_concern_${index}_label_required`);
    }
  });

  understanding.retrievalNeeds.forEach((need, index) => {
    if (!need.trim()) {
      diagnostics.push(`prompt_understanding_retrieval_need_${index}_required`);
    }
  });

  understanding.contextNeeds.forEach((need, index) => {
    if (!need.trim()) {
      diagnostics.push(`prompt_understanding_context_need_${index}_required`);
    }
  });

  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}

export function assessPromptUnderstandingCandidate(
  understanding: PromptUnderstanding,
): PromptUnderstandingAssessment {
  const validation = validatePromptUnderstandingMeaning(understanding);

  if (!validation.valid) {
    return {
      accepted: false,
      understanding: null,
      diagnostics: validation.diagnostics,
    };
  }

  return {
    accepted: true,
    understanding,
    diagnostics: [],
  };
}
