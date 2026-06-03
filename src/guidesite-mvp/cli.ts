import { pathToFileURL } from "node:url";
import {
  buildHardcodedSessionPatch,
  commitSessionPatch,
  createGuideSiteMemoryStores,
  renderGuideSiteRunOperatorOutput,
  startGuideSiteRun,
  withHardcodedUnderstandingAndComposition,
} from "./run-lifecycle.js";

export const DEFAULT_GUIDESITE_MVP_PROMPT = "Is overnight camp right for my 8-year-old?";

export type ParsedGuideSiteMvpCliArgs = {
  promptText: string;
};

export function parseGuideSiteMvpCliArgs(args: string[]): ParsedGuideSiteMvpCliArgs {
  const promptText = args.join(" ").trim();

  return {
    promptText: promptText || DEFAULT_GUIDESITE_MVP_PROMPT,
  };
}

export function runGuideSiteMvpCli(args: string[]): string {
  const parsedArgs = parseGuideSiteMvpCliArgs(args);
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: parsedArgs.promptText,
    stores,
  });
  const composedRun = withHardcodedUnderstandingAndComposition(started.run);

  if (composedRun.answerComposition?.status !== "needs_context") {
    return renderGuideSiteRunOperatorOutput(composedRun);
  }

  const patch = buildHardcodedSessionPatch(composedRun);
  const committed = commitSessionPatch({
    stores,
    run: composedRun,
    patch,
  });

  return renderGuideSiteRunOperatorOutput(committed.run);
}

export async function main(cliArgs = process.argv.slice(2)): Promise<void> {
  try {
    console.log(runGuideSiteMvpCli(cliArgs));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
