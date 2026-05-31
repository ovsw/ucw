import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { runRetrievalWorkbench } from "../../src/retrieval-workbench/workbench.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("default comparison renders deterministic, Sanity keyword, and Sanity hybrid strategies", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/seed.json");
  const seenQueries: string[] = [];
  const report = await runRetrievalWorkbench({
    fixturePath: "fixtures/retrieval-workbench/seed.json",
    env: {
      SANITY_PROJECT_ID: "project-123",
      SANITY_DATASET: "prototype",
      SANITY_API_VERSION: "2025-05-01",
      SANITY_READ_TOKEN: "read-token",
    },
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      const query = body.query ?? "";

      seenQueries.push(query);

      if (query.includes('order(_id asc)')) {
        return createJsonResponse({
          result: fixture.documents.map((document) => ({
            _id: document._id,
            _type: document._type,
          })),
        });
      }

      return createJsonResponse({
        result: [],
      });
    },
  });

  assert.match(report.report, /Retrieval strategy comparison report/);
  assert.match(report.report, /Strategy: Deterministic/);
  assert.match(report.report, /Strategy: Sanity Keyword/);
  assert.match(report.report, /Strategy: Sanity Hybrid/);
  assert.ok(seenQueries.some((query) => query.includes('text::semanticSimilarity($searchQuery)')));
  assert.ok(seenQueries.some((query) => query.includes('order(_id asc)')));
});

test("default comparison stops before retrieval when Sanity fixture parity is missing", async () => {
  const seenQueries: string[] = [];

  await assert.rejects(
    async () =>
      runRetrievalWorkbench({
        fixturePath: "fixtures/retrieval-workbench/seed.json",
        env: {
          SANITY_PROJECT_ID: "project-123",
          SANITY_DATASET: "prototype",
          SANITY_API_VERSION: "2025-05-01",
        },
        fetchImpl: async (_input, init) => {
          const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
          const query = body.query ?? "";

          seenQueries.push(query);

          if (query.includes('order(_id asc)')) {
            return createJsonResponse({
              result: [{ _id: "concern-allergy-medical-safety", _type: "concern" }],
            });
          }

          throw new Error("retrieval should not run after parity failure");
        },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Sanity fixture parity check failed/);
      assert.match(error.message, /Missing documents/);
      return true;
    },
  );

  assert.deepEqual(seenQueries.filter((query) => query.includes("text::query($searchQuery)")), []);
});
