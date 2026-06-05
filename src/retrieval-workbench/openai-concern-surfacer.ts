import {
  concernSurfacingJsonSchema,
  validateConcernSurfacingResult,
} from "./concern-surfacing.ts";
import type {
  ConcernSurfacer,
  ConcernSurfacingCatalogEntry,
  ConcernSurfacingResult,
} from "./concern-surfacing-types.ts";

export const DEFAULT_OPENAI_CONCERN_SURFACER_MODEL = "gpt-4o-mini";

export type OpenAIConcernSurfacerConfig = {
  apiKey: string;
  model: string;
};

export type OpenAIConcernSurfacerEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_CONCERN_SURFACER_MODEL?: string;
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

export function readOpenAIConcernSurfacerConfig(
  env: OpenAIConcernSurfacerEnv = process.env,
): OpenAIConcernSurfacerConfig {
  const apiKey = normalize(env.OPENAI_API_KEY);

  if (!apiKey) {
    throw new Error("Missing required OpenAI config for Concern Surfacing: OPENAI_API_KEY.");
  }

  return {
    apiKey,
    model: normalize(env.OPENAI_CONCERN_SURFACER_MODEL) ?? DEFAULT_OPENAI_CONCERN_SURFACER_MODEL,
  };
}

function buildOpenAIConcernSurfacingRequest(
  model: string,
  prompt: string,
  catalog: ConcernSurfacingCatalogEntry[],
): Record<string, unknown> {
  return {
    model,
    input: [
      {
        role: "system",
        content:
          "You are a Concern Surfacer for a retrieval workbench. Classify the Prompt only against the approved Concern catalog. Return approved Concern ids that are semantically implied by the Prompt and report possible missing Concerns separately. Do not select, name, search for, or rank Content Entities.",
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          approvedConcernCatalog: catalog,
        }),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "concern_surfacing_result",
        description: "Approved Concern ids implied by the Prompt plus report-only missing Concern candidates.",
        strict: true,
        schema: concernSurfacingJsonSchema,
      },
    },
  };
}

async function readOpenAIResponseJson(response: Response): Promise<OpenAIResponsesPayload> {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Concern Surfacing request failed with ${response.status} ${response.statusText}: ${errorText}`);
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
    throw new Error("OpenAI Concern Surfacing request was refused.");
  }

  throw new Error("OpenAI Concern Surfacing response did not include output text.");
}

function parseOutputJson(outputText: string): unknown {
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error(
      `OpenAI Concern Surfacing response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function createOpenAIConcernSurfacer(
  config: OpenAIConcernSurfacerConfig,
  fetchImpl: typeof fetch = fetch,
): ConcernSurfacer {
  return {
    async surfaceConcerns(
      prompt: string,
      catalog: ConcernSurfacingCatalogEntry[],
    ): Promise<ConcernSurfacingResult> {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(buildOpenAIConcernSurfacingRequest(config.model, prompt, catalog)),
      });
      const payload = await readOpenAIResponseJson(response);
      const rawResult = parseOutputJson(extractOutputText(payload));

      return validateConcernSurfacingResult(rawResult, catalog);
    },
  };
}
