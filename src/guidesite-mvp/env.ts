import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OpenAIPromptUnderstandingEnv } from "./openai-prompt-understanding.js";

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

export function parseGuideSiteMvpDotenv(contents: string): OpenAIPromptUnderstandingEnv {
  const env: OpenAIPromptUnderstandingEnv = {};

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

    if (key === "OPENAI_API_KEY" || key === "OPENAI_PROMPT_UNDERSTANDING_MODEL") {
      env[key] = value;
    }
  }

  return env;
}

export function readGuideSiteMvpDotenv(path = DEFAULT_GUIDESITE_MVP_ENV_FILE_PATH): OpenAIPromptUnderstandingEnv {
  const resolvedPath = resolve(path);

  if (!existsSync(resolvedPath)) {
    return {};
  }

  return parseGuideSiteMvpDotenv(readFileSync(resolvedPath, "utf8"));
}

export function mergeGuideSiteMvpOpenAIEnv(options: {
  env?: OpenAIPromptUnderstandingEnv;
  envFilePath?: string;
}): OpenAIPromptUnderstandingEnv {
  return {
    ...readGuideSiteMvpDotenv(options.envFilePath),
    ...(options.env ?? process.env),
  };
}
