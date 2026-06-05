import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadFixture } from "./load-fixture.ts";
import { printFixtureValidationError } from "./fixture-errors.ts";
import { generatedFixtureDocuments, generatedFixtureGoldSet } from "./generated-fixture-source.ts";
import { retrievalWorkbenchFixtureSchema } from "./fixture-schema.ts";
import { summarizeFixture } from "./fixture-summary.ts";

const DEFAULT_SEED_PATH = "fixtures/retrieval-workbench/seed.json";
const DEFAULT_OUTPUT_PATH = "fixtures/retrieval-workbench/generated.json";
const GENERATED_FIXTURE_DESCRIPTION =
  "Generated retrieval workbench corpus expanded from the hand-written seed fixture using archived Canadian Adventure Camp source notes.";

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }

  return args[index + 1];
}

function parseOutputPath(args: string[]): string {
  const outputPath = readFlagValue(args, "--output");
  if (outputPath && !outputPath.startsWith("-")) {
    return resolve(outputPath);
  }

  const positional = args.find((arg, index) => {
    const previous = args[index - 1];
    return !arg.startsWith("-") && previous !== "--output" && previous !== "--seed";
  });

  return resolve(positional ?? DEFAULT_OUTPUT_PATH);
}

function parseSeedPath(args: string[]): string {
  return resolve(readFlagValue(args, "--seed") ?? DEFAULT_SEED_PATH);
}

async function main(): Promise<void> {
  try {
    const args = process.argv.slice(2);
    const outputPath = parseOutputPath(args);
    const seedPath = parseSeedPath(args);
    const seedFixture = await loadFixture(seedPath);

    const generatedFixture = retrievalWorkbenchFixtureSchema.parse({
      ...seedFixture,
      description: GENERATED_FIXTURE_DESCRIPTION,
      documents: [...seedFixture.documents, ...generatedFixtureDocuments],
      goldSet: [...seedFixture.goldSet, ...generatedFixtureGoldSet],
    });

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(generatedFixture, null, 2)}\n`, "utf8");

    const { concernCount, nonConcernCount } = summarizeFixture(generatedFixture);

    console.log("Generated retrieval workbench fixture");
    console.log(`Seed fixture: ${seedPath}`);
    console.log(`Output fixture: ${outputPath}`);
    console.log(`Concerns: ${concernCount}`);
    console.log(`Non-Concern Content Entities: ${nonConcernCount}`);
    console.log(`Gold-set Parent Prompts: ${generatedFixture.goldSet.length}`);
  } catch (error) {
    printFixtureValidationError("Retrieval workbench fixture generation failed", error);

    process.exitCode = 1;
  }
}

await main();
