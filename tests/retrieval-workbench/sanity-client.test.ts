import assert from "node:assert/strict";
import test from "node:test";
import { executeSanityRetrievalQueryPlan } from "../../src/retrieval-workbench/sanity-client.js";
import type { SanityQueryConfig } from "../../src/retrieval-workbench/sanity-config.js";
import { buildSanityKeywordQueryPlan } from "../../src/retrieval-workbench/sanity-retrieval.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const config: SanityQueryConfig = {
  projectId: "project-123",
  dataset: "prototype",
  apiVersion: "2025-05-01",
};

test("executeSanityRetrievalQueryPlan merges direct and concern-bridge content entity hits", async () => {
  const requests: Array<{ query: string; params: Record<string, unknown> }> = [];
  const plan = buildSanityKeywordQueryPlan("My child has medication and packing concerns.");

  const result = await executeSanityRetrievalQueryPlan(plan, config, async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      query: string;
      params: Record<string, unknown>;
    };

    requests.push(body);

    if (body.query.includes("relatedConcerns[]._ref")) {
      assert.deepEqual(body.params.matchedConcernIds, ["concern-health", "concern-packing"]);

      return createJsonResponse({
        result: [
          {
            _id: "parent-requirement-health-form",
            _type: "parentRequirement",
            title: "Health form requirement",
            relatedConcernIds: ["concern-health"],
          },
          {
            _id: "policy-medical-care",
            _type: "policy",
            title: "Medical care policy",
            relatedConcernIds: ["concern-health"],
          },
          {
            _id: "checklist-packing",
            _type: "checklist",
            title: "Packing checklist",
            relatedConcernIds: ["concern-packing"],
          },
          {
            _id: "irrelevant-zero-score-match",
            _type: "policy",
            title: "Ignored zero score match",
            relatedConcernIds: ["concern-zero"],
          },
        ],
      });
    }

    if (body.query.includes('_type == "concern"')) {
      return createJsonResponse({
        result: [
          {
            _id: "concern-health",
            _type: "concern",
            title: "Medication and health forms",
            _score: 10,
          },
          {
            _id: "concern-packing",
            _type: "concern",
            title: "Packing for camp",
            _score: 5,
          },
          {
            _id: "concern-zero",
            _type: "concern",
            title: "Unmatched concern",
            _score: 0,
          },
        ],
      });
    }

    return createJsonResponse({
      result: [
        {
          _id: "parent-requirement-health-form",
          _type: "parentRequirement",
          title: "Health form requirement",
          _score: 7.5,
        },
        {
          _id: "checklist-packing",
          _type: "checklist",
          title: "Packing checklist",
          _score: 2,
        },
      ],
    });
  });

  assert.deepEqual(result.matchedConcerns.map((match) => [match._id, match.score, match.rank]), [
    ["concern-health", 10, 1],
    ["concern-packing", 5, 2],
    ["concern-zero", 0, 3],
  ]);
  assert.deepEqual(result.directContentEntities.map((match) => [match._id, match.score, match.rank]), [
    ["parent-requirement-health-form", 7.5, 1],
    ["checklist-packing", 2, 2],
  ]);
  assert.deepEqual(result.mergedContentEntities.map((match) => [match._id, match.score, match.rank]), [
    ["parent-requirement-health-form", 11, 1],
    ["checklist-packing", 3.75, 2],
    ["policy-medical-care", 3.5, 3],
  ]);

  const mergedHealthForm = result.mergedContentEntities[0];
  assert.deepEqual(
    mergedHealthForm.sources.map((source) => source.kind),
    ["direct", "concernExpansion"],
  );
  assert.deepEqual(
    result.mergedContentEntities.find((match) => match._id === "policy-medical-care")?.sources.map((source) => source.kind),
    ["concernExpansion"],
  );
  assert.ok(requests.some((request) => request.query.includes("relatedConcerns[]._ref")));
});
