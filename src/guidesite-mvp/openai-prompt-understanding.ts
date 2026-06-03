import { z } from "zod";
import type { PromptUnderstanding, PromptUnderstandingProviderTrace } from "./types.js";

export const DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL = "gpt-4o-mini";

export type OpenAIPromptUnderstandingConfig = {
  apiKey: string;
  model: string;
};

export type OpenAIPromptUnderstandingEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_PROMPT_UNDERSTANDING_MODEL?: string;
};

export type PromptUnderstandingProviderResult = {
  understanding: PromptUnderstanding;
  trace: PromptUnderstandingProviderTrace;
};

export type PromptUnderstandingProvider = {
  understandPrompt(promptText: string): Promise<PromptUnderstandingProviderResult>;
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

const visitorFactSourceSchema = z.enum(["explicit", "inferred"]);
const concernStatusSchema = z.enum(["open", "addressed", "deferred"]);
const focusGoalSchema = z.enum(["answer_factual", "assess_fit", "gather_context", "address_concern", "compare_options"]);

const promptUnderstandingSchema = z
  .object({
    goal: z.union([focusGoalSchema, z.literal("unknown")]),
    promptType: z.enum(["fit", "factual", "unknown"]),
    fitQuestion: z.string().nullable(),
    facts: z.record(
      z.object({
        value: z.union([z.string(), z.number(), z.boolean()]),
        provenance: z.object({
          source: visitorFactSourceSchema,
          promptText: z.string(),
        }),
      }),
    ),
    concerns: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: concernStatusSchema,
        provenance: z.enum(["explicit", "implied"]),
      }),
    ),
    retrievalNeeds: z.array(z.string()),
    contextNeeds: z.array(z.string()),
  })
  .strict();

export const promptUnderstandingJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["goal", "promptType", "fitQuestion", "facts", "concerns", "retrievalNeeds", "contextNeeds"],
  properties: {
    goal: {
      enum: ["answer_factual", "assess_fit", "gather_context", "address_concern", "compare_options", "unknown"],
    },
    promptType: {
      enum: ["fit", "factual", "unknown"],
    },
    fitQuestion: {
      type: ["string", "null"],
    },
    facts: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["value", "provenance"],
        properties: {
          value: {
            type: ["string", "number", "boolean"],
          },
          provenance: {
            type: "object",
            additionalProperties: false,
            required: ["source", "promptText"],
            properties: {
              source: {
                enum: ["explicit", "inferred"],
              },
              promptText: {
                type: "string",
              },
            },
          },
        },
      },
    },
    concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "label", "status", "provenance"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          status: { enum: ["open", "addressed", "deferred"] },
          provenance: { enum: ["explicit", "implied"] },
        },
      },
    },
    retrievalNeeds: {
      type: "array",
      items: { type: "string" },
    },
    contextNeeds: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export class PromptUnderstandingProviderError extends Error {
  readonly rawOutput: string | null;
  readonly parsedOutput: unknown;
  readonly diagnostics: string[];

  constructor(message: string, options: { rawOutput?: string | null; parsedOutput?: unknown; diagnostics?: string[] } = {}) {
    super(message);
    this.name = "PromptUnderstandingProviderError";
    this.rawOutput = options.rawOutput ?? null;
    this.parsedOutput = options.parsedOutput ?? null;
    this.diagnostics = options.diagnostics ?? [message];
  }
}

export function readOpenAIPromptUnderstandingConfig(
  env: OpenAIPromptUnderstandingEnv = process.env,
): OpenAIPromptUnderstandingConfig {
  const apiKey = normalize(env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("Missing required OpenAI config for GuideSite Prompt Understanding: OPENAI_API_KEY.");
  }

  return {
    apiKey,
    model: normalize(env.OPENAI_PROMPT_UNDERSTANDING_MODEL) ?? DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL,
  };
}

function buildOpenAIPromptUnderstandingRequest(model: string, promptText: string): Record<string, unknown> {
  return {
    model,
    input: [
      {
        role: "system",
        content:
          "You perform only GuideSite Prompt Understanding. Return structured Prompt Understanding for the typed Prompt. Do not compose final answers, invent source-backed claims, mutate Session State, or produce Session Patch operations.",
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt: promptText,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "guidesite_prompt_understanding",
        description: "Validated GuideSite Prompt Understanding candidate.",
        strict: true,
        schema: promptUnderstandingJsonSchema,
      },
    },
  };
}

async function readOpenAIResponseJson(response: Response): Promise<OpenAIResponsesPayload> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new PromptUnderstandingProviderError(
      `OpenAI Prompt Understanding request failed with ${response.status} ${response.statusText}: ${errorText}`,
      {
        rawOutput: errorText,
      },
    );
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
    throw new PromptUnderstandingProviderError("OpenAI Prompt Understanding request was refused.", {
      rawOutput: JSON.stringify(payload),
    });
  }

  throw new PromptUnderstandingProviderError("OpenAI Prompt Understanding response did not include output text.", {
    rawOutput: JSON.stringify(payload),
  });
}

function parseOutputJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new PromptUnderstandingProviderError(
      `OpenAI Prompt Understanding response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      {
        rawOutput: outputText,
      },
    );
  }
}

export function validatePromptUnderstandingProviderOutput(rawOutput: string): PromptUnderstanding {
  const parsedOutput = parseOutputJson(rawOutput);
  const validation = promptUnderstandingSchema.safeParse(parsedOutput);

  if (!validation.success) {
    throw new PromptUnderstandingProviderError("OpenAI Prompt Understanding response failed local schema validation.", {
      rawOutput,
      parsedOutput,
      diagnostics: validation.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    });
  }

  return validation.data;
}

export function createOpenAIPromptUnderstandingProvider(
  config: OpenAIPromptUnderstandingConfig,
  fetchImpl: typeof fetch = fetch,
): PromptUnderstandingProvider {
  return {
    async understandPrompt(promptText: string): Promise<PromptUnderstandingProviderResult> {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAIPromptUnderstandingRequest(config.model, promptText)),
      });
      const payload = await readOpenAIResponseJson(response);
      const rawOutput = extractOutputText(payload);
      const understanding = validatePromptUnderstandingProviderOutput(rawOutput);

      return {
        understanding,
        trace: {
          provider: "openai",
          model: config.model,
          rawOutput,
          parsedOutput: understanding,
          diagnostics: [],
        },
      };
    },
  };
}
