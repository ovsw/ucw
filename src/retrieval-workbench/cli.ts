import { printFixtureValidationError } from "./fixture-errors.js";
import { printRetrievalWorkbenchFailure, runRetrievalWorkbench } from "./workbench.js";
import { ZodError } from "zod";

const cliArgs = process.argv.slice(2);
const deterministicOnly = cliArgs.includes("--deterministic-only");
const fixtureArg = cliArgs.find((arg) => !arg.startsWith("--"));

try {
  const result = await runRetrievalWorkbench({
    fixturePath: fixtureArg,
    deterministicOnly,
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
