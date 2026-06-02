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

test("default comparison renders deterministic, Sanity keyword, Sanity hybrid, and planned hybrid strategies", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  const seenQueries: string[] = [];
  const seenSearchQueries: string[] = [];
  let openAIRequestCount = 0;
  const report = await runRetrievalWorkbench({
    fixturePath: "fixtures/retrieval-workbench/generated.json",
    env: {
      SANITY_PROJECT_ID: "project-123",
      SANITY_DATASET: "prototype",
      SANITY_API_VERSION: "2025-05-01",
      SANITY_READ_TOKEN: "read-token",
    },
    fetchImpl: async (input, init) => {
      if (String(input).includes("api.openai.com")) {
        openAIRequestCount += 1;
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string; params?: { searchQuery?: string } };
      const query = body.query ?? "";

      seenQueries.push(query);
      if (body.params?.searchQuery) {
        seenSearchQueries.push(body.params.searchQuery);
      }

      if (query.includes('order(_id asc)')) {
        return createJsonResponse({
          result: [
            ...fixture.documents.map((document) => ({
              _id: document._id,
              _type: document._type,
            })),
            { _id: "_.groups.public", _type: "system.group" },
            { _id: "_.retention._maximum_project", _type: "system.retention" },
          ],
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
  assert.match(report.report, /Strategy: Sanity Hybrid \+ Planner/);
  assert.ok(seenQueries.some((query) => query.includes('text::semanticSimilarity($searchQuery)')));
  assert.ok(seenQueries.some((query) => query.includes('order(_id asc)')));
  assert.ok(seenQueries.some((query) => query.includes('!(_id in path("_.*"))')));
  assert.ok(
    seenSearchQueries.some(
      (query) => query.includes("registration cancellation refund") && query.includes("plan change"),
    ),
  );
  assert.equal(openAIRequestCount, 0);
});

test("OpenAI Concern Surfacing is opt-in and validates OpenAI config before retrieval", async () => {
  let requestCount = 0;

  await assert.rejects(
    async () =>
      runRetrievalWorkbench({
        fixturePath: "fixtures/retrieval-workbench/generated.json",
        concernSurfacer: "openai",
        env: {
          SANITY_PROJECT_ID: "project-123",
          SANITY_DATASET: "prototype",
          SANITY_API_VERSION: "2025-05-01",
        },
        fetchImpl: async () => {
          requestCount += 1;
          throw new Error("retrieval should not run without OpenAI config");
        },
      }),
    /Missing required OpenAI config for Concern Surfacing: OPENAI_API_KEY/,
  );

  assert.equal(requestCount, 0);
});

test("OpenAI Answer Composer is opt-in, comparison-only, and validates OpenAI config before retrieval", async () => {
  let requestCount = 0;

  await assert.rejects(
    async () =>
      runRetrievalWorkbench({
        fixturePath: "fixtures/retrieval-workbench/generated.json",
        deterministicOnly: true,
        answerComposer: "openai",
        env: {
          SANITY_PROJECT_ID: "project-123",
          SANITY_DATASET: "prototype",
          SANITY_API_VERSION: "2025-05-01",
          OPENAI_API_KEY: "openai-key",
        },
        fetchImpl: async () => {
          requestCount += 1;
          throw new Error("retrieval should not run in deterministic-only mode");
        },
      }),
    /OpenAI Answer Composer requires comparison mode/,
  );

  await assert.rejects(
    async () =>
      runRetrievalWorkbench({
        fixturePath: "fixtures/retrieval-workbench/generated.json",
        answerComposer: "openai",
        env: {
          SANITY_PROJECT_ID: "project-123",
          SANITY_DATASET: "prototype",
          SANITY_API_VERSION: "2025-05-01",
        },
        fetchImpl: async () => {
          requestCount += 1;
          throw new Error("retrieval should not run without OpenAI config");
        },
      }),
    /Missing required OpenAI config for Answer Composer: OPENAI_API_KEY/,
  );

  assert.equal(requestCount, 0);
});

test("OpenAI Concern Surfacing adds a comparison strategy and report-only missing Concern diagnostics", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  let openAIRequestCount = 0;
  const report = await runRetrievalWorkbench({
    fixturePath: "fixtures/retrieval-workbench/generated.json",
    concernSurfacer: "openai",
    env: {
      SANITY_PROJECT_ID: "project-123",
      SANITY_DATASET: "prototype",
      SANITY_API_VERSION: "2025-05-01",
      SANITY_READ_TOKEN: "read-token",
      OPENAI_API_KEY: "openai-key",
    },
    fetchImpl: async (input, init) => {
      if (String(input).includes("api.openai.com")) {
        openAIRequestCount += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          input?: Array<{ role: string; content: string }>;
        };
        const userPayload = JSON.parse(body.input?.[1]?.content ?? "{}") as {
          prompt?: string;
          approvedConcernCatalog?: Array<{ _id: string }>;
        };
        const isDayCampPrompt = userPayload.prompt?.includes("day camp or another gentler option") ?? false;

        assert.ok(userPayload.approvedConcernCatalog?.some((entry) => entry._id === "concern-pricing-affordability"));
        assert.equal(
          userPayload.approvedConcernCatalog?.some((entry) => entry._id === "policy-registration-cancellation"),
          false,
        );

        return createJsonResponse({
          output_text: JSON.stringify({
            surfacedConcerns: isDayCampPrompt
              ? [
                  {
                    concernId: "concern-pricing-affordability",
                    rationale: "The prompt implies plan-change and affordability questions around a gentler option.",
                  },
                ]
              : [],
            missingConcernCandidates: isDayCampPrompt
              ? [
                  {
                    description: "Day-camp transition fit",
                    rationale: "The catalog has readiness and pricing, but not a day-camp transition concern.",
                  },
                ]
              : [],
          }),
        });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      const query = body.query ?? "";

      if (query.includes('order(_id asc)')) {
        return createJsonResponse({
          result: [
            ...fixture.documents.map((document) => ({
              _id: document._id,
              _type: document._type,
            })),
            { _id: "_.groups.public", _type: "system.group" },
            { _id: "_.retention._maximum_project", _type: "system.retention" },
          ],
        });
      }

      return createJsonResponse({
        result: [],
      });
    },
  });

  assert.equal(openAIRequestCount, fixture.goldSet.length);
  assert.match(report.report, /Strategy: Sanity Hybrid \+ OpenAI Concern Surfacing/);
  assert.match(report.report, /Concern surfacing:/);
  assert.match(
    report.report,
    /Pricing and affordability \[concern-pricing-affordability\]: The prompt implies plan-change/,
  );
  assert.match(report.report, /Missing Concern candidates:/);
  assert.match(report.report, /Day-camp transition fit: The catalog has readiness and pricing/);
  assert.doesNotMatch(
    report.report,
    /prompt-day-camp-alternative[\s\S]*Required content hits:[^\n]*Registration and cancellation policy/,
  );
});

test("OpenAI Answer Composer runs after Sanity Hybrid retrieval and renders report-only drafts", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");
  let answerComposerRequestCount = 0;
  const report = await runRetrievalWorkbench({
    fixturePath: "fixtures/retrieval-workbench/generated.json",
    answerComposer: "openai",
    answerComposerTopK: 25,
    env: {
      SANITY_PROJECT_ID: "project-123",
      SANITY_DATASET: "prototype",
      SANITY_API_VERSION: "2025-05-01",
      SANITY_READ_TOKEN: "read-token",
      OPENAI_API_KEY: "openai-key",
    },
    fetchImpl: async (input, init) => {
      if (String(input).includes("api.openai.com")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          input?: Array<{ role: string; content: string }>;
          text?: { format?: { name?: string } };
        };
        assert.equal(body.text?.format?.name, "answer_composition_result");
        const userPayload = JSON.parse(body.input?.[1]?.content ?? "{}") as {
          promptId?: string;
          sourceStrategy?: { id?: string };
          sourceMaterials?: Array<{
            sourceId: string;
            snippets: Array<{ sourceId: string; snippetId: string }>;
          }>;
        };
        const firstSource = userPayload.sourceMaterials?.[0];
        const firstSnippet = firstSource?.snippets[0];

        assert.ok(firstSource);
        assert.ok(firstSnippet);
        assert.equal(userPayload.sourceStrategy?.id, "sanityHybrid");
        answerComposerRequestCount += 1;

        return createJsonResponse({
          output_text: JSON.stringify({
            status: "composed",
            draft: `Draft for ${userPayload.promptId}`,
            citedSources: [
              {
                sourceId: firstSource.sourceId,
                snippetId: firstSnippet.snippetId,
                claimIds: ["claim-1"],
              },
            ],
            claims: [
              {
                claimId: "claim-1",
                text: "The draft uses the selected source material.",
                evidence: [
                  {
                    sourceId: firstSnippet.sourceId,
                    snippetId: firstSnippet.snippetId,
                  },
                ],
              },
            ],
            diagnostics: {
              unsupportedClaims: [],
              missingSourceOfTruth: [],
              followUpQuestions: [],
            },
          }),
        });
      }

      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      const query = body.query ?? "";

      if (query.includes('order(_id asc)')) {
        return createJsonResponse({
          result: [
            ...fixture.documents.map((document) => ({
              _id: document._id,
              _type: document._type,
            })),
            { _id: "_.groups.public", _type: "system.group" },
            { _id: "_.retention._maximum_project", _type: "system.retention" },
          ],
        });
      }

      if (query.includes('_type == "concern"')) {
        return createJsonResponse({
          result: fixture.documents
            .filter((document) => document._type === "concern")
            .map((document, index) => ({
              _id: document._id,
              _type: document._type,
              title: document.title,
              _score: 100 - index,
            })),
        });
      }

      if (query.includes('_type != "concern"')) {
        return createJsonResponse({
          result: fixture.documents
            .filter((document) => document._type !== "concern")
            .map((document, index) => ({
              _id: document._id,
              _type: document._type,
              title: document.title,
              _score: 100 - index,
            })),
        });
      }

      return createJsonResponse({
        result: fixture.documents
          .filter((document) => document._type !== "concern")
          .map((document) => ({
            _id: document._id,
            _type: document._type,
            title: document.title,
            relatedConcernIds: "relatedConcerns" in document ? (document.relatedConcerns ?? []).map((ref) => ref._ref) : [],
          })),
      });
    },
  });

  assert.equal(answerComposerRequestCount, fixture.goldSet.length);
  assert.match(report.report, /Answer Composer Harness \(report-only\)/);
  assert.match(report.report, /Source strategy: Sanity Hybrid \[sanityHybrid\]/);
  assert.match(report.report, /Draft for prompt-allergy-epipen/);
  assert.match(report.report, /Strategy summary:/);
  assert.match(report.report, /Strategy: Sanity Hybrid/);
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
