import { mergeGuideSiteMvpEnv, type GuideSiteMvpEnv } from "./env.ts";
import { readOpenAIPromptUnderstandingConfig, type OpenAIPromptUnderstandingConfig } from "./openai-prompt-understanding.ts";
import { readSanityQueryConfig, type SanityQueryConfig } from "../retrieval-workbench/sanity-config.ts";

export const DEFAULT_GUIDESITE_GUI_RUNTIME_MODE = "live";

export type GuideSiteGuiRuntimeMode = "live" | "fixture";

export type GuideSiteGuiRuntimeEnv = GuideSiteMvpEnv & {
  GUIDESITE_GUI_RUNTIME_MODE?: string;
};


export type GuideSiteGuiRuntimeConfig =
  | {
      runtimeMode: "live";
      retrievalMode: "sanity";
      sanityQueryConfig: SanityQueryConfig;
      promptUnderstandingConfig: OpenAIPromptUnderstandingConfig;
    }
  | {
      runtimeMode: "fixture";
      retrievalMode: "fixture";
    };

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
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
    promptUnderstandingConfig: readOpenAIPromptUnderstandingConfig(mergedEnv, {
      requireExplicitModel: true,
      errorContext: "GuideSite GUI live mode",
    }),
  };
}
