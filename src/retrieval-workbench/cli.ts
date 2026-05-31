import { resolve } from "node:path";
import { loadFixture } from "./load-fixture.js";
import { printFixtureValidationError } from "./fixture-errors.js";
import { summarizeFixture } from "./fixture-summary.js";
import { renderRetrievalWorkbenchReport } from "./report.js";

const fixturePath = resolve(process.argv[2] ?? "fixtures/retrieval-workbench/seed.json");

try {
  const fixture = await loadFixture(fixturePath);
  const { concernCount, nonConcernCount, contentEntityTypes } = summarizeFixture(fixture);

  console.log("Retrieval workbench fixture loaded");
  console.log(`Fixture: ${fixturePath}`);
  console.log(`Concerns: ${concernCount}`);
  console.log(`Non-Concern Content Entities: ${nonConcernCount}`);
  console.log(`Gold-set Parent Prompts: ${fixture.goldSet.length}`);
  console.log(`Content Entity types: ${contentEntityTypes.join(", ")}`);
  console.log("");
  console.log(renderRetrievalWorkbenchReport(fixture));
} catch (error) {
  printFixtureValidationError("Retrieval workbench fixture validation failed", error);

  process.exitCode = 1;
}
