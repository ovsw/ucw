export type SanityQueryConfig = {
  projectId: string;
  dataset: string;
  apiVersion: string;
  readToken?: string;
};

export type SanitySeedConfig = SanityQueryConfig & {
  writeToken: string;
};

export type SanityConfigEnv = {
  SANITY_PROJECT_ID?: string;
  SANITY_DATASET?: string;
  SANITY_API_VERSION?: string;
  SANITY_READ_TOKEN?: string;
  SANITY_WRITE_TOKEN?: string;
};

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function missingConfigError(workflow: "query" | "seed", missingKeys: string[]): Error {
  return new Error(
    `Missing required Sanity config for ${workflow} workflow: ${missingKeys.join(", ")}.`,
  );
}

export function readSanityQueryConfig(env: SanityConfigEnv = process.env as SanityConfigEnv): SanityQueryConfig {
  const projectId = normalize(env.SANITY_PROJECT_ID);
  const dataset = normalize(env.SANITY_DATASET);
  const apiVersion = normalize(env.SANITY_API_VERSION);

  const missingKeys: string[] = [];

  if (!projectId) {
    missingKeys.push("SANITY_PROJECT_ID");
  }

  if (!dataset) {
    missingKeys.push("SANITY_DATASET");
  }

  if (!apiVersion) {
    missingKeys.push("SANITY_API_VERSION");
  }

  if (missingKeys.length > 0) {
    throw missingConfigError("query", missingKeys);
  }

  const readToken = normalize(env.SANITY_READ_TOKEN);

  return {
    projectId: projectId as string,
    dataset: dataset as string,
    apiVersion: apiVersion as string,
    ...(readToken ? { readToken } : {}),
  };
}

export function readSanitySeedConfig(env: SanityConfigEnv = process.env as SanityConfigEnv): SanitySeedConfig {
  const queryConfig = readSanityQueryConfig(env);
  const writeToken = normalize(env.SANITY_WRITE_TOKEN);

  if (!writeToken) {
    throw missingConfigError("seed", ["SANITY_WRITE_TOKEN"]);
  }

  return {
    ...queryConfig,
    writeToken,
  };
}
