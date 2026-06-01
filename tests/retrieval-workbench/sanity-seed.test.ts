import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import {
  buildSanitySeedDocuments,
  compareSanitySeedParity,
  seedSanityFixture,
} from "../../src/retrieval-workbench/sanity-seed.js";

test("seed workflow upserts only fixture documents and preserves their ids", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const upsertedDocumentIds: string[] = [];

  const result = await seedSanityFixture(fixture, {
    async upsertDocuments(documents) {
      upsertedDocumentIds.push(...documents.map((document) => document._id));
    },
    async listDocuments() {
      return fixture.documents.map((document) => ({
        _id: document._id,
        _type: document._type,
      }));
    },
  });

  assert.deepEqual(upsertedDocumentIds, fixture.documents.map((document) => document._id));
  assert.deepEqual(result.documents, buildSanitySeedDocuments(fixture));
  assert.equal(result.parity.isExactMatch, true);
  assert.deepEqual(result.parity.missingDocumentIds, []);
  assert.deepEqual(result.parity.extraDocumentIds, []);
  assert.deepEqual(result.parity.typeMismatches, []);
});

test("seed workflow denormalizes related Concern titles onto Content Entities", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const seedDocuments = buildSanitySeedDocuments(fixture);

  assert.equal(
    seedDocuments.find((document) => document._id === "policy-medical-care")?.relatedConcernTitles,
    "Allergy and medical safety",
  );
  assert.equal(
    seedDocuments.find((document) => document._id === "procedure-homesickness-support")?.relatedConcernTitles,
    "Homesickness and child readiness",
  );
  assert.equal(
    seedDocuments.find((document) => document._id === "concern-allergy-medical-safety")?.relatedConcernTitles,
    undefined,
  );
});

test("seed parity comparison reports missing, extra, and type-mismatched Sanity documents", () => {
  const parity = compareSanitySeedParity(
    [
      { _id: "concern-a", _type: "concern" },
      { _id: "policy-b", _type: "policy" },
      { _id: "session-c", _type: "session" },
    ],
    [
      { _id: "concern-a", _type: "concern" },
      { _id: "policy-b", _type: "guide" },
      { _id: "extra-d", _type: "policy" },
      { _id: "_.groups.public", _type: "system.group" },
      { _id: "_.retention._maximum_project", _type: "system.retention" },
    ],
  );

  assert.deepEqual(parity.missingDocumentIds, ["session-c"]);
  assert.deepEqual(parity.extraDocumentIds, ["extra-d"]);
  assert.deepEqual(parity.typeMismatches, [
    {
      id: "policy-b",
      expectedType: "policy",
      actualType: "guide",
    },
  ]);
  assert.equal(parity.isExactMatch, false);
  assert.equal(parity.hasWarnings, true);
});

test("seed parity comparison ignores Sanity system documents", () => {
  const parity = compareSanitySeedParity(
    [{ _id: "concern-a", _type: "concern" }],
    [
      { _id: "concern-a", _type: "concern" },
      { _id: "_.groups.public", _type: "system.group" },
      { _id: "_.groups.sanity.viewer", _type: "system.group" },
    ],
  );

  assert.equal(parity.isExactMatch, true);
  assert.deepEqual(parity.missingDocumentIds, []);
  assert.deepEqual(parity.extraDocumentIds, []);
  assert.deepEqual(parity.typeMismatches, []);
});
