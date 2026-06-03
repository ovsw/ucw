import assert from "node:assert/strict";
import test from "node:test";
import {
  createFixtureGuideSiteRetrievalAdapter,
  loadCanonicalGuideSiteSourcePack,
} from "../../src/guidesite-mvp/fixture-retrieval.js";
import { canonicalGuideSiteUnderstanding } from "./test-helpers.js";

test("fixture retrieval adapter exposes the canonical GuideSite retrieval seam", () => {
  const adapter = createFixtureGuideSiteRetrievalAdapter(loadCanonicalGuideSiteSourcePack());

  assert.equal(adapter.id, "fixture");
  assert.equal(adapter.label, "Canonical Fixture");

  const retrieval = adapter.retrieve(canonicalGuideSiteUnderstanding);

  assert.deepEqual(retrieval.needs, ["overnight_readiness", "homesickness_support"]);
  assert.deepEqual(retrieval.concerns, ["homesickness", "child_readiness"]);
  assert.deepEqual(
    retrieval.results.map((result) => ({
      sourceId: result.sourceId,
      sourceType: result.sourceType,
      rank: result.rank,
      fieldPath: result.fieldPath,
      sourceRevision: result.sourceRevision,
    })),
    [
      {
        sourceId: "concern_homesickness",
        sourceType: "concern",
        rank: 1,
        fieldPath: "summary",
        sourceRevision: "mock_rev_concern_homesickness_001",
      },
      {
        sourceId: "program_overnight",
        sourceType: "campProgram",
        rank: 2,
        fieldPath: "summary",
        sourceRevision: "mock_rev_program_overnight_001",
      },
      {
        sourceId: "policy_homesickness",
        sourceType: "policy",
        rank: 3,
        fieldPath: "summary",
        sourceRevision: "mock_rev_policy_homesickness_001",
      },
      {
        sourceId: "policy_parent_communication",
        sourceType: "policy",
        rank: 4,
        fieldPath: "summary",
        sourceRevision: "mock_rev_policy_parent_communication_001",
      },
    ],
  );
  assert.deepEqual(retrieval.coverage, {
    status: "source_backed",
    matchedSourceIds: [
      "concern_homesickness",
      "program_overnight",
      "policy_homesickness",
      "policy_parent_communication",
    ],
  });
  assert.deepEqual(retrieval.diagnostics, []);
});

test("fixture retrieval adapter returns empty source coverage and diagnostics for unsupported context", () => {
  const adapter = createFixtureGuideSiteRetrievalAdapter(loadCanonicalGuideSiteSourcePack());

  const retrieval = adapter.retrieve({
    ...canonicalGuideSiteUnderstanding,
    concerns: [
      {
        key: "transportation",
        label: "Transportation",
        status: "open",
        provenance: "explicit",
      },
    ],
    retrievalNeeds: ["bus_schedule"],
    contextNeeds: ["pickup_location"],
  });

  assert.deepEqual(retrieval.results, []);
  assert.deepEqual(retrieval.coverage, {
    status: "empty_retrieval",
    matchedSourceIds: [],
  });
  assert.deepEqual(retrieval.diagnostics, [
    "insufficient_fixture_sources: no approved fixture sources matched retrieval needs bus_schedule or concerns transportation",
  ]);
});
