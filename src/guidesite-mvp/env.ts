import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OpenAIPromptUnderstandingEnv } from "./openai-prompt-understanding.ts";
import type { SanityConfigEnv } from "../retrieval-workbench/sanity-config.ts";

export const DEFAULT_GUIDESITE_MVP_ENV_FILE_PATH = ".env";

function parseDotenvValue(value: string): string {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export type GuideSiteMvpEnv = OpenAIPromptUnderstandingEnv & SanityConfigEnv;

export function parseGuideSiteMvpDotenv(contents: string): GuideSiteMvpEnv {
  const env: GuideSiteMvpEnv = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const assignment = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const separatorIndex = assignment.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = assignment.slice(0, separatorIndex).trim();
    const value = parseDotenvValue(assignment.slice(separatorIndex + 1));

    if (
      key === "OPENAI_API_KEY" ||
      key === "OPENAI_PROMPT_UNDERSTANDING_MODEL" ||
      key === "SANITY_PROJECT_ID" ||
      key === "SANITY_DATASET" ||
      key === "SANITY_API_VERSION" ||
      key === "SANITY_READ_TOKEN" ||
      key === "SANITY_WRITE_TOKEN"
    ) {
      env[key] = value;
    }
  }

  return env;
}

export function readGuideSiteMvpDotenv(path = DEFAULT_GUIDESITE_MVP_ENV_FILE_PATH): GuideSiteMvpEnv {
  const resolvedPath = resolve(path);

  if (!existsSync(resolvedPath)) {
    return {};
  }

  return parseGuideSiteMvpDotenv(readFileSync(resolvedPath, "utf8"));
}

export function mergeGuideSiteMvpEnv(options: {
  env?: GuideSiteMvpEnv;
  envFilePath?: string;
}): GuideSiteMvpEnv {
  return {
    ...readGuideSiteMvpDotenv(options.envFilePath),
    ...(options.env ?? process.env),
  };
}

export function mergeGuideSiteMvpOpenAIEnv(options: {
  env?: OpenAIPromptUnderstandingEnv;
  envFilePath?: string;
}): OpenAIPromptUnderstandingEnv {
  const mergedEnv = mergeGuideSiteMvpEnv(options);
  const { OPENAI_API_KEY, OPENAI_PROMPT_UNDERSTANDING_MODEL } = mergedEnv;

  return {
    OPENAI_API_KEY,
    OPENAI_PROMPT_UNDERSTANDING_MODEL,
  };
}
