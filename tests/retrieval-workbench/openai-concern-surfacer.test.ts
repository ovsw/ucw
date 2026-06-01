import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENAI_CONCERN_SURFACER_MODEL,
  createOpenAIConcernSurfacer,
  readOpenAIConcernSurfacerConfig,
} from "../../src/retrieval-workbench/openai-concern-surfacer.js";
import type { ConcernSurfacingCatalogEntry } from "../../src/retrieval-workbench/concern-surfacing-types.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const catalog: ConcernSurfacingCatalogEntry[] = [
  {
    _id: "concern-pricing-affordability",
    title: "Pricing and affordability",
    contentMap: "Parent concern about tuition, refunds, deposits, and whether camp fits the family budget.",
  },
];

test("OpenAI Concern Surfacing config requires an API key and trims the optional model override", () => {
  assert.throws(
    () => readOpenAIConcernSurfacerConfig({}),
    /Missing required OpenAI config for Concern Surfacing: OPENAI_API_KEY/,
  );

  assert.deepEqual(readOpenAIConcernSurfacerConfig({ OPENAI_API_KEY: " key " }), {
    apiKey: "key",
    model: DEFAULT_OPENAI_CONCERN_SURFACER_MODEL,
  });

  assert.deepEqual(
    readOpenAIConcernSurfacerConfig({
      OPENAI_API_KEY: "key",
      OPENAI_CONCERN_SURFACER_MODEL: " gpt-test ",
    }),
    {
      apiKey: "key",
      model: "gpt-test",
    },
  );
});

test("OpenAI Concern Surfacer uses fetch, Structured Outputs, and local catalog validation", async () => {
  let capturedInput: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const surfacer = createOpenAIConcernSurfacer(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async (input, init) => {
      capturedInput = input;
      capturedInit = init;

      return createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  surfacedConcerns: [
                    {
                      concernId: "concern-pricing-affordability",
                      rationale: "The prompt implies refund and plan-change questions.",
                    },
                  ],
                  missingConcernCandidates: [],
                }),
              },
            ],
          },
        ],
      });
    },
  );

  const result = await surfacer.surfaceConcerns("Can we switch plans?", catalog);
  const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as {
    model?: string;
    input?: Array<{ role: string; content: string }>;
    text?: { format?: { type?: string; strict?: boolean; schema?: { required?: string[] } } };
  };
  const userPayload = JSON.parse(requestBody.input?.[1]?.content ?? "{}") as {
    prompt?: string;
    approvedConcernCatalog?: ConcernSurfacingCatalogEntry[];
  };

  assert.equal(capturedInput, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer test-key");
  assert.equal(requestBody.model, "gpt-test");
  assert.equal(requestBody.text?.format?.type, "json_schema");
  assert.equal(requestBody.text?.format?.strict, true);
  assert.ok(requestBody.text?.format?.schema?.required?.includes("missingConcernCandidates"));
  assert.equal(userPayload.prompt, "Can we switch plans?");
  assert.deepEqual(userPayload.approvedConcernCatalog, catalog);
  assert.deepEqual(result, {
    surfacedConcerns: [
      {
        concernId: "concern-pricing-affordability",
        rationale: "The prompt implies refund and plan-change questions.",
      },
    ],
    missingConcernCandidates: [],
  });
});

test("OpenAI Concern Surfacer rejects provider output that names unknown approved Concern ids", async () => {
  const surfacer = createOpenAIConcernSurfacer(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () =>
      createJsonResponse({
        output_text: JSON.stringify({
          surfacedConcerns: [
            {
              concernId: "concern-not-approved",
              rationale: "The provider cannot invent approved Concern ids.",
            },
          ],
          missingConcernCandidates: [],
        }),
      }),
  );

  await assert.rejects(
    () => surfacer.surfaceConcerns("Can we switch plans?", catalog),
    /unknown approved Concern ids: concern-not-approved/,
  );
});
