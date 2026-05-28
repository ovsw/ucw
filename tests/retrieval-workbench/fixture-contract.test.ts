import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { ZodError } from "zod";
import { retrievalWorkbenchFixtureSchema } from "../../src/retrieval-workbench/fixture-schema.js";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";

type SeedFixture = {
  fixtureVersion: 1;
  description: string;
  documents: Array<Record<string, unknown> & { _id: string; _type: string }>;
  goldSet: Array<
    Record<string, unknown> & {
      _id: string;
      expectedConcernIds: string[];
      requiredContentEntityIds: string[];
      supportingContentEntityIds?: string[];
      requiredSourceOfTruthIds?: string[];
    }
  >;
};

async function readSeedFixture(): Promise<SeedFixture> {
  const rawFixture = await readFile("fixtures/retrieval-workbench/seed.json", "utf8");
  return JSON.parse(rawFixture) as SeedFixture;
}

function cloneFixture(fixture: SeedFixture): SeedFixture {
  return structuredClone(fixture);
}

function validationMessages(error: unknown): string[] {
  assert.ok(error instanceof ZodError);
  return error.issues.map((issue) => issue.message);
}

test("seed fixture satisfies the issue #1 fixture contract", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/seed.json");
  const concerns = fixture.documents.filter((document) => document._type === "concern");
  const contentEntities = fixture.documents.filter((document) => document._type !== "concern");

  assert.equal(concerns.length, 8);
  assert.equal(contentEntities.length, 19);
  assert.equal(fixture.goldSet.length, 10);
});

test("fixture contract rejects a corpus with too few Concern documents", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  const concernIdsToRemove = fixture.documents
    .filter((document) => document._type === "concern")
    .slice(0, 3)
    .map((document) => document._id);

  fixture.documents = fixture.documents.filter((document) => !concernIdsToRemove.includes(document._id));

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 6 to 8 Concern documents/);
});

test("fixture contract rejects a corpus with too many Concern documents", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.documents.push({
    _id: "concern-extra",
    _type: "concern",
    title: "Extra concern",
    contentMap: "Extra concern that exceeds the issue #1 seed corpus bounds.",
    concernArea: "extra",
    parentSignals: ["extra"],
  });

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 6 to 8 Concern documents/);
});

test("fixture contract rejects a corpus with too few non-Concern Content Entities", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  const contentEntityIdsToRemove = fixture.documents
    .filter((document) => document._type !== "concern")
    .slice(0, 5)
    .map((document) => document._id);

  fixture.documents = fixture.documents.filter((document) => !contentEntityIdsToRemove.includes(document._id));

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 15 to 25 non-Concern Content Entities/);
});

test("fixture contract rejects a corpus with too many non-Concern Content Entities", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  const extraContentEntities = Array.from({ length: 7 }, (_, index) => ({
    _id: `extra-content-entity-${index}`,
    _type: "policy",
    title: `Extra Content Entity ${index}`,
    contentMap: "Extra Content Entity that exceeds the issue #1 seed corpus bounds.",
    relatedConcerns: [{ _type: "reference", _ref: "concern-allergy-medical-safety" }],
  }));

  fixture.documents.push(...extraContentEntities);

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 15 to 25 non-Concern Content Entities/);
});

test("fixture contract rejects a corpus with too few gold-set Parent Prompts", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.goldSet = fixture.goldSet.slice(0, 7);

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 8 to 12 gold-set Parent Prompts/);
});

test("fixture contract rejects a corpus with too many gold-set Parent Prompts", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  const extraPrompts = Array.from({ length: 3 }, (_, index) => ({
    _id: `prompt-extra-${index}`,
    prompt: "Can camp answer this extra parent question?",
    expectedConcernIds: ["concern-allergy-medical-safety"],
    requiredContentEntityIds: ["policy-medical-care"],
  }));

  fixture.goldSet.push(...extraPrompts);

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected 8 to 12 gold-set Parent Prompts/);
});

test("fixture contract rejects duplicate document ids", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.documents[1]._id = fixture.documents[0]._id;

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Duplicate document id/);
});

test("fixture contract rejects Content Entity references to missing Concerns", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  const contentEntity = fixture.documents.find((document) => document._type !== "concern");
  assert.ok(contentEntity);
  contentEntity.relatedConcerns = [{ _type: "reference", _ref: "concern-does-not-exist" }];

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /relatedConcerns must reference an existing Concern id/);
});

test("fixture contract rejects gold-set expectations that point at missing documents", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.goldSet[0].requiredContentEntityIds = ["policy-does-not-exist"];

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Gold-set prompt references missing document id/);
});

test("fixture contract rejects expected Concern ids that point at non-Concern documents", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.goldSet[0].expectedConcernIds = ["policy-medical-care"];

  const result = retrievalWorkbenchFixtureSchema.safeParse(fixture);

  assert.equal(result.success, false);
  assert.match(validationMessages(result.error).join("\n"), /Expected Concern id is not a Concern document/);
});

test("workbench CLI exits cleanly for a valid fixture", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/retrieval-workbench/cli.ts"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Retrieval workbench fixture loaded/);
  assert.match(result.stdout, /Concerns: 8/);
  assert.match(result.stdout, /Non-Concern Content Entities: 19/);
  assert.match(result.stdout, /Gold-set Parent Prompts: 10/);
});

test("workbench CLI exits non-zero and reports validation errors for an invalid fixture", async () => {
  const fixture = cloneFixture(await readSeedFixture());
  fixture.goldSet[0].requiredContentEntityIds = ["missing-document"];

  const tempDirectory = mkdtempSync(join(tmpdir(), "retrieval-workbench-"));
  const fixturePath = join(tempDirectory, "invalid-seed.json");
  writeFileSync(fixturePath, JSON.stringify(fixture));

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/retrieval-workbench/cli.ts", fixturePath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Retrieval workbench fixture validation failed/);
  assert.match(result.stderr, /Gold-set prompt references missing document id/);
});
