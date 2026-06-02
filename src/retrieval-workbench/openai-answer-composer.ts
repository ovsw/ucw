import {
  answerComposerJsonSchema,
  validateAnswerComposerProviderResultDetailed,
} from "./answer-composer-contract.js";
import type { AnswerComposer, AnswerComposerInput } from "./answer-composition.js";

export const DEFAULT_OPENAI_ANSWER_COMPOSER_MODEL = "gpt-4o-mini";

export type OpenAIAnswerComposerConfig = {
  apiKey: string;
  model: string;
};

export type OpenAIAnswerComposerEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_ANSWER_COMPOSER_MODEL?: string;
};

type OpenAIResponseContentItem = {
  type?: string;
  text?: unknown;
  refusal?: unknown;
};

type OpenAIResponseOutputItem = {
  type?: string;
  content?: OpenAIResponseContentItem[];
};

type OpenAIResponsesPayload = {
  output_text?: unknown;
  output?: OpenAIResponseOutputItem[];
};

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function readOpenAIAnswerComposerConfig(
  env: OpenAIAnswerComposerEnv = process.env,
): OpenAIAnswerComposerConfig {
  const apiKey = normalize(env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("Missing required OpenAI config for Answer Composer: OPENAI_API_KEY.");
  }

  return {
    apiKey,
    model: normalize(env.OPENAI_ANSWER_COMPOSER_MODEL) ?? DEFAULT_OPENAI_ANSWER_COMPOSER_MODEL,
  };
}

function buildOpenAIAnswerComposerRequest(
  model: string,
  input: AnswerComposerInput,
): Record<string, unknown> {
  return {
    model,
    input: [
      {
        role: "system",
        content:
          "You are an Answer Composer Harness for a retrieval workbench. Draft a short parent-facing answer using only the supplied Content Entity snippets. Every factual claim must cite snippet evidence. Do not invent policy details, pricing, dates, capacities, medical promises, safety guarantees, eligibility rules, or commitments not supported by the snippets. Report unresolved gaps as diagnostics and follow-up questions. This is report-only prototype output, not production answer generation.",
      },
      {
        role: "user",
        content: JSON.stringify({
          promptId: input.promptId,
          parentPrompt: input.parentPrompt,
          sourceStrategy: input.sourceStrategy,
          requiredContentEntityIds: input.requiredContentEntityIds,
          requiredSourceOfTruthIds: input.requiredSourceOfTruthIds,
          sourceMaterials: input.sourceMaterials,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "answer_composition_result",
        description:
          "Report-only source-grounded answer draft with claim evidence, citations, unsupported-claim diagnostics, source-of-truth gaps, and follow-up questions.",
        strict: true,
        schema: answerComposerJsonSchema,
      },
    },
  };
}

async function readOpenAIResponseJson(response: Response): Promise<OpenAIResponsesPayload> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Answer Composer request failed with ${response.status} ${response.statusText}: ${errorText}`);
  }

  return (await response.json()) as OpenAIResponsesPayload;
}

function extractOutputText(payload: OpenAIResponsesPayload): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const outputText = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text as string)
    .join("");

  if (outputText && outputText.trim().length > 0) {
    return outputText;
  }

  const refusal = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "refusal" || content.refusal);

  if (refusal) {
    throw new Error("OpenAI Answer Composer request was refused.");
  }

  throw new Error("OpenAI Answer Composer response did not include output text.");
}

function parseOutputJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error(
      `OpenAI Answer Composer response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function createOpenAIAnswerComposer(
  config: OpenAIAnswerComposerConfig,
  fetchImpl: typeof fetch = fetch,
): AnswerComposer {
  return {
    async compose(input: AnswerComposerInput) {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAIAnswerComposerRequest(config.model, input)),
      });
      const payload = await readOpenAIResponseJson(response);
      const rawResult = parseOutputJson(extractOutputText(payload));
      const validated = validateAnswerComposerProviderResultDetailed(rawResult, input.sourceMaterials, {
        repairCitedSourceClaimIds: true,
        context: {
          promptId: input.promptId,
          sourceStrategyId: input.sourceStrategy.id,
          selectedSourceIds: input.sourceMaterials.map((material) => material.sourceId),
        },
      });

      return {
        ...validated.result,
        citationDiagnostics: validated.citationDiagnostics,
      };
    },
  };
}
