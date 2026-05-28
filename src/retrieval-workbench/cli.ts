import { resolve } from "node:path";
import { ZodError } from "zod";
import { loadFixture } from "./load-fixture.js";

const fixturePath = resolve(process.argv[2] ?? "fixtures/retrieval-workbench/seed.json");

try {
  const fixture = await loadFixture(fixturePath);
  const concernCount = fixture.documents.filter((document) => document._type === "concern").length;
  const contentEntityCount = fixture.documents.length - concernCount;
  const contentEntityTypes = [
    ...new Set(
      fixture.documents
        .filter((document) => document._type !== "concern")
        .map((document) => document._type)
        .sort(),
    ),
  ];

  console.log("Retrieval workbench fixture loaded");
  console.log(`Fixture: ${fixturePath}`);
  console.log(`Concerns: ${concernCount}`);
  console.log(`Non-Concern Content Entities: ${contentEntityCount}`);
  console.log(`Gold-set Parent Prompts: ${fixture.goldSet.length}`);
  console.log(`Content Entity types: ${contentEntityTypes.join(", ")}`);
} catch (error) {
  console.error("Retrieval workbench fixture validation failed");

  if (error instanceof ZodError) {
    for (const issue of error.issues) {
      console.error(`- ${issue.path.join(".") || "(root)"}: ${issue.message}`);
    }
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
}
