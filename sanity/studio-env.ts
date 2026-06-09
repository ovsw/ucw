export type SanityStudioConfigEnv = {
  NEXT_PUBLIC_SANITY_PROJECT_ID?: string;
  NEXT_PUBLIC_SANITY_DATASET?: string;
};

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function missingConfigError(missingKeys: string[]): Error {
  return new Error(`Missing required Sanity Studio config: ${missingKeys.join(", ")}.`);
}

export function readSanityStudioConfig(
  env: SanityStudioConfigEnv = {
    NEXT_PUBLIC_SANITY_PROJECT_ID: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
    NEXT_PUBLIC_SANITY_DATASET: process.env.NEXT_PUBLIC_SANITY_DATASET,
  },
): { projectId: string; dataset: string } {
  const projectId = normalize(env.NEXT_PUBLIC_SANITY_PROJECT_ID);
  const dataset = normalize(env.NEXT_PUBLIC_SANITY_DATASET);

  const missingKeys: string[] = [];

  if (!projectId) {
    missingKeys.push("NEXT_PUBLIC_SANITY_PROJECT_ID");
  }

  if (!dataset) {
    missingKeys.push("NEXT_PUBLIC_SANITY_DATASET");
  }

  if (missingKeys.length > 0) {
    throw missingConfigError(missingKeys);
  }

  return {
    projectId: projectId as string,
    dataset: dataset as string,
  };
}
