import { readFile } from "node:fs/promises";
import { retrievalWorkbenchFixtureSchema } from "./fixture-schema.ts";
import type { ParsedRetrievalWorkbenchFixture } from "./fixture-schema.ts";

export async function loadFixture(path: string): Promise<ParsedRetrievalWorkbenchFixture> {
  const rawFixture = await readFile(path, "utf8");
  const parsedJson: unknown = JSON.parse(rawFixture);

  return retrievalWorkbenchFixtureSchema.parse(parsedJson);
}
