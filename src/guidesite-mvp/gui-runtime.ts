import { mergeGuideSiteMvpEnv, type GuideSiteMvpEnv } from "./env.js";
import { readSanityQueryConfig, type SanityQueryConfig } from "../retrieval-workbench/sanity-config.js";

export const DEFAULT_GUIDESITE_GUI_RUNTIME_MODE = "live";

export type GuideSiteGuiRuntimeMode = "live" | "fixture";

export type GuideSiteGuiRuntimeEnv = GuideSiteMvpEnv & {
  GUIDESITE_GUI_RUNTIME_MODE?: string;
};

export type GuideSiteGuiPromptUnderstandingConfig = {
  apiKey: string;
  model: string;
};

export type GuideSiteGuiRuntimeConfig =
  | {
      runtimeMode: "live";
      retrievalMode: "sanity";
      sanityQueryConfig: SanityQueryConfig;
      promptUnderstandingConfig: GuideSiteGuiPromptUnderstandingConfig;
    }
  | {
      runtimeMode: "fixture";
      retrievalMode: "fixture";
    };

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readGuideSiteGuiPromptUnderstandingConfig(
  env: GuideSiteGuiRuntimeEnv,
): GuideSiteGuiPromptUnderstandingConfig {
  const apiKey = normalize(env.OPENAI_API_KEY);
  const model = normalize(env.OPENAI_PROMPT_UNDERSTANDING_MODEL);
  if (!apiKey || !model) {
    const missingKeys: string[] = [];

    if (!apiKey) {
      missingKeys.push("OPENAI_API_KEY");
    }

    if (!model) {
      missingKeys.push("OPENAI_PROMPT_UNDERSTANDING_MODEL");
    }

    throw new Error(
      `Missing required OpenAI config for GuideSite GUI live mode: ${missingKeys.join(", ")}.`,
    );
  }

  return {
    apiKey,
    model,
  };
}

function readGuideSiteGuiRuntimeMode(env: GuideSiteGuiRuntimeEnv): GuideSiteGuiRuntimeMode {
  const runtimeMode = normalize(env.GUIDESITE_GUI_RUNTIME_MODE) ?? DEFAULT_GUIDESITE_GUI_RUNTIME_MODE;

  switch (runtimeMode) {
    case "live":
    case "fixture":
      return runtimeMode;
    default:
      throw new Error(`Unknown GuideSite GUI runtime mode: ${runtimeMode}. Use live or fixture.`);
  }
}

export function readGuideSiteGuiRuntimeConfig(options: {
  env?: GuideSiteGuiRuntimeEnv;
  envFilePath?: string;
} = {}): GuideSiteGuiRuntimeConfig {
  const mergedEnv: GuideSiteGuiRuntimeEnv = mergeGuideSiteMvpEnv({
    env: options.env,
    envFilePath: options.envFilePath,
  });
  const runtimeMode = readGuideSiteGuiRuntimeMode(mergedEnv);

  if (runtimeMode === "fixture") {
    return {
      runtimeMode,
      retrievalMode: "fixture",
    };
  }

  return {
    runtimeMode,
    retrievalMode: "sanity",
    sanityQueryConfig: readSanityQueryConfig(mergedEnv),
    promptUnderstandingConfig: readGuideSiteGuiPromptUnderstandingConfig(mergedEnv),
  };
}
