import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvFile } from "node:process";
import { DEFAULT_ANSWER_COMPOSER_TOP_K } from "./answer-source-material.ts";
import { printFixtureValidationError } from "./fixture-errors.ts";
import {
  printRetrievalWorkbenchFailure,
  runRetrievalWorkbench,
  type RetrievalWorkbenchConcernSurfacer,
} from "./workbench.ts";
import type { RetrievalWorkbenchAnswerComposer } from "./answer-composition.ts";
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

export type ParsedRetrievalWorkbenchCliArgs = {
  fixturePath?: string;
  deterministicOnly: boolean;
  concernSurfacer: RetrievalWorkbenchConcernSurfacer;
  answerComposer: RetrievalWorkbenchAnswerComposer;
  answerComposerTopK: number;
};

export function readConcernSurfacerOption(args: string[]): RetrievalWorkbenchConcernSurfacer {
  const option = args.find((arg) => arg === "--concern-surfacer" || arg.startsWith("--concern-surfacer="));

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

export function readAnswerComposerOption(args: string[]): RetrievalWorkbenchAnswerComposer {
  const option = args.find((arg) => arg === "--answer-composer" || arg.startsWith("--answer-composer="));

  if (!option) {
    return "none";
  }

  const [flag, value] = option.split("=", 2);

  if (flag !== "--answer-composer" || !value) {
    throw new Error("Use --answer-composer=openai or --answer-composer=none.");
  }

  if (value !== "openai" && value !== "none") {
    throw new Error(`Unknown Answer Composer: ${value}. Use openai or none.`);
  }

  return value;
}

export function readAnswerComposerTopKOption(args: string[]): number {
  const option = args.find((arg) => arg === "--answer-composer-top-k" || arg.startsWith("--answer-composer-top-k="));

  if (!option) {
    return DEFAULT_ANSWER_COMPOSER_TOP_K;
  }

  const [flag, value] = option.split("=", 2);

  if (flag !== "--answer-composer-top-k" || !value) {
    throw new Error("Use --answer-composer-top-k=<positive integer>.");
  }

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("Answer Composer top-k must be a positive integer.");
  }

  return Number(value);
}

export function parseRetrievalWorkbenchCliArgs(args: string[]): ParsedRetrievalWorkbenchCliArgs {
  return {
    fixturePath: args.find((arg) => !arg.startsWith("--")),
    deterministicOnly: args.includes("--deterministic-only"),
    concernSurfacer: readConcernSurfacerOption(args),
    answerComposer: readAnswerComposerOption(args),
    answerComposerTopK: readAnswerComposerTopKOption(args),
  };
}

export async function main(cliArgs = process.argv.slice(2)): Promise<void> {
  const parsedArgs = parseRetrievalWorkbenchCliArgs(cliArgs);

  try {
    loadRootEnvFile();

    const result = await runRetrievalWorkbench({
      fixturePath: parsedArgs.fixturePath,
      deterministicOnly: parsedArgs.deterministicOnly,
      concernSurfacer: parsedArgs.concernSurfacer,
      answerComposer: parsedArgs.answerComposer,
      answerComposerTopK: parsedArgs.answerComposerTopK,
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
