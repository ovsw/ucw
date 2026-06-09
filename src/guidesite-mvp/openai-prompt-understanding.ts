import { z } from "zod";
import type {
  PromptUnderstanding,
  PromptUnderstandingProviderTrace,
  PromptUnderstandingSessionContext,
} from "./types.ts";

export const DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL = "gpt-4o-mini";

export type OpenAIPromptUnderstandingConfig = {
  apiKey: string;
  model: string;
};

export type OpenAIPromptUnderstandingEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_PROMPT_UNDERSTANDING_MODEL?: string;
};
export type OpenAIPromptUnderstandingConfigReadOptions = {
  requireExplicitModel?: boolean;
  errorContext?: string;
};


export type PromptUnderstandingProviderResult = {
  understanding: PromptUnderstanding;
  trace: PromptUnderstandingProviderTrace;
};

export type PromptUnderstandingProvider = {
  understandPrompt(
    promptText: string,
    context?: PromptUnderstandingSessionContext,
  ): Promise<PromptUnderstandingProviderResult>;
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

const visitorFactSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  provenance: z.object({
    source: visitorFactSourceSchema,
    promptText: z.string(),
  }),
});
const providerFactSchema = visitorFactSchema.extend({
  key: z.string(),
});

const promptUnderstandingProviderOutputSchema = z
  .object({
    goal: z.union([focusGoalSchema, z.literal("unknown")]),
    promptType: z.enum(["fit", "factual", "unknown"]),
    fitQuestion: z.string().nullable(),
    facts: z.union([z.record(visitorFactSchema), z.array(providerFactSchema)]),
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
      type: "array",
      description:
        "Explicit facts extracted from the typed prompt. Use an empty array when the prompt gives no concrete facts.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "value", "provenance"],
        properties: {
          key: {
            type: "string",
            description: "Stable snake_case fact key, e.g. child_age or prior_sleepaway_experience.",
          },
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
                description: "Exact substring from the typed prompt supporting this fact.",
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
  env: OpenAIPromptUnderstandingEnv = process.env as OpenAIPromptUnderstandingEnv,
  options: OpenAIPromptUnderstandingConfigReadOptions = {},
): OpenAIPromptUnderstandingConfig {
  const apiKey = normalize(env.OPENAI_API_KEY);
  const model = normalize(env.OPENAI_PROMPT_UNDERSTANDING_MODEL);
  const missingKeys: string[] = [];

  if (!apiKey) {
    missingKeys.push("OPENAI_API_KEY");
  }

  if (options.requireExplicitModel && !model) {
    missingKeys.push("OPENAI_PROMPT_UNDERSTANDING_MODEL");
  }

  if (missingKeys.length > 0) {
    const context = options.errorContext ?? "GuideSite Prompt Understanding";
    throw new Error(`Missing required OpenAI config for ${context}: ${missingKeys.join(", ")}.`);
  }

  return {
    apiKey: apiKey as string,
    model: model ?? DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL,
  };
}

function buildOpenAIPromptUnderstandingRequest(
  model: string,
  promptText: string,
  context?: PromptUnderstandingSessionContext,
): Record<string, unknown> {
  const userPayload: Record<string, unknown> = {
    prompt: promptText,
  };

  if (context) {
    userPayload.session = context.session;
  }

  return {
    model,
    input: [
      {
        role: "system",
        content:
          "You perform only GuideSite Prompt Understanding. Return structured Prompt Understanding for the typed Prompt and supplied Session context. Do not compose final answers, invent source-backed claims, mutate Session State, or produce Session Patch operations. Return facts as an array of {key,value,provenance}; provenance.promptText must be an exact substring from the typed Prompt.",
      },
      {
        role: "user",
        content: JSON.stringify(userPayload),
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

type PromptUnderstandingProviderOutput = z.infer<typeof promptUnderstandingProviderOutputSchema>;

function normalizePromptUnderstandingProviderOutput(output: PromptUnderstandingProviderOutput): PromptUnderstanding {
  const facts = Array.isArray(output.facts)
    ? Object.fromEntries(output.facts.map((fact) => [fact.key, { value: fact.value, provenance: fact.provenance }]))
    : output.facts;

  return {
    ...output,
    facts,
  };
}

export function validatePromptUnderstandingProviderOutput(rawOutput: string): PromptUnderstanding {
  const parsedOutput = parseOutputJson(rawOutput);
  const validation = promptUnderstandingProviderOutputSchema.safeParse(parsedOutput);

  if (!validation.success) {
    throw new PromptUnderstandingProviderError("OpenAI Prompt Understanding response failed local schema validation.", {
      rawOutput,
      parsedOutput,
      diagnostics: validation.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    });
  }

  return normalizePromptUnderstandingProviderOutput(validation.data);
}

export function createOpenAIPromptUnderstandingProvider(
  config: OpenAIPromptUnderstandingConfig,
  fetchImpl: typeof fetch = fetch,
): PromptUnderstandingProvider {
  return {
    async understandPrompt(
      promptText: string,
      context?: PromptUnderstandingSessionContext,
    ): Promise<PromptUnderstandingProviderResult> {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAIPromptUnderstandingRequest(config.model, promptText, context)),
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
