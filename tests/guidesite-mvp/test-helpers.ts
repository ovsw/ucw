import type { PromptUnderstandingProvider } from "../../src/guidesite-mvp/openai-prompt-understanding.js";
import type { PromptUnderstanding } from "../../src/guidesite-mvp/types.js";

export const canonicalGuideSitePrompt = "Is overnight camp right for my 8-year-old?";

export const canonicalGuideSiteUnderstanding: PromptUnderstanding = {
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

export function createFakePromptUnderstandingProvider(
  understanding: PromptUnderstanding = canonicalGuideSiteUnderstanding,
): PromptUnderstandingProvider {
  return {
    async understandPrompt() {
      return {
        understanding,
        trace: {
          provider: "fake",
          model: "fake-guidesite-prompt-understanding",
          rawOutput: JSON.stringify(understanding),
          parsedOutput: understanding,
          diagnostics: [],
        },
      };
    },
  };
}
