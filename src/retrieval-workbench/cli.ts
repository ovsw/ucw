import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { printFixtureValidationError } from "./fixture-errors.js";
import {
  printRetrievalWorkbenchFailure,
  runRetrievalWorkbench,
  type RetrievalWorkbenchConcernSurfacer,
} from "./workbench.js";
import { ZodError } from "zod";

type NodeErrnoException = Error & {
  code?: string;
};

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return error instanceof Error && "code" in error;
}

function loadRootEnvFile(): void {
  try {
    loadEnvFile(resolve(".env"));
  } catch (error) {
    if (isNodeErrnoException(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function readConcernSurfacerOption(args: string[]): RetrievalWorkbenchConcernSurfacer {
  const option = args.find((arg) => arg.startsWith("--concern-surfacer"));

  if (!option) {
    return "none";
  }

  const [flag, value] = option.split("=", 2);

  if (flag !== "--concern-surfacer" || !value) {
    throw new Error("Use --concern-surfacer=openai or --concern-surfacer=none.");
  }

  if (value !== "openai" && value !== "none") {
    throw new Error(`Unknown Concern Surfacer: ${value}. Use openai or none.`);
  }

  return value;
}

const cliArgs = process.argv.slice(2);
const deterministicOnly = cliArgs.includes("--deterministic-only");
const fixtureArg = cliArgs.find((arg) => !arg.startsWith("--"));

try {
  loadRootEnvFile();

  const result = await runRetrievalWorkbench({
    fixturePath: fixtureArg,
    deterministicOnly,
    concernSurfacer: readConcernSurfacerOption(cliArgs),
  });

  for (const line of result.summaryLines) {
    console.log(line);
  }

  console.log("");
  console.log(result.report);
} catch (error) {
  if (error instanceof ZodError) {
    printFixtureValidationError("Retrieval workbench fixture validation failed", error);
  } else {
    printRetrievalWorkbenchFailure(error);
  }

  process.exitCode = 1;
}
