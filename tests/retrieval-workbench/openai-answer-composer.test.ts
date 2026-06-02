import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENAI_ANSWER_COMPOSER_MODEL,
  createOpenAIAnswerComposer,
  readOpenAIAnswerComposerConfig,
} from "../../src/retrieval-workbench/openai-answer-composer.js";
import type { AnswerComposerInput } from "../../src/retrieval-workbench/answer-composition.js";

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

const composerInput: AnswerComposerInput = {
  promptId: "prompt-alpha",
  parentPrompt: "How would camp handle this?",
  requiredContentEntityIds: ["entity-alpha"],
  requiredSourceOfTruthIds: ["entity-alpha"],
  sourceStrategy: {
    id: "sanityHybrid",
    label: "Sanity Hybrid",
  },
  sourceMaterials: [
    {
      sourceId: "entity-alpha",
      sourceType: "policy",
      title: "Entity Alpha",
      rank: 1,
      score: 10,
      snippets: [
        {
          sourceId: "entity-alpha",
          snippetId: "entity-alpha:contentMap",
          field: "contentMap",
          text: "Entity alpha content.",
        },
      ],
    },
  ],
};

test("OpenAI Answer Composer config requires an API key and trims the optional model override", () => {
  assert.throws(
    () => readOpenAIAnswerComposerConfig({}),
    /Missing required OpenAI config for Answer Composer: OPENAI_API_KEY/,
  );

  assert.deepEqual(readOpenAIAnswerComposerConfig({ OPENAI_API_KEY: " key " }), {
    apiKey: "key",
    model: DEFAULT_OPENAI_ANSWER_COMPOSER_MODEL,
  });

  assert.deepEqual(
    readOpenAIAnswerComposerConfig({
      OPENAI_API_KEY: "key",
      OPENAI_ANSWER_COMPOSER_MODEL: " gpt-test ",
    }),
    {
      apiKey: "key",
      model: "gpt-test",
    },
  );
});

test("OpenAI Answer Composer uses fetch, Structured Outputs, and local citation validation", async () => {
  let capturedInput: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const composer = createOpenAIAnswerComposer(
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
                  status: "composed",
                  draft: "Camp uses the alpha policy.",
                  citedSources: [
                    {
                      sourceId: "entity-alpha",
                      snippetId: "entity-alpha:contentMap",
                      claimIds: ["claim-1"],
                    },
                  ],
                  claims: [
                    {
                      claimId: "claim-1",
                      text: "The alpha source supports the answer.",
                      evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
                    },
                  ],
                  diagnostics: {
                    unsupportedClaims: [],
                    missingSourceOfTruth: [],
                    followUpQuestions: [],
                  },
                }),
              },
            ],
          },
        ],
      });
    },
  );

  const result = await composer.compose(composerInput);
  const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as {
    model?: string;
    input?: Array<{ role: string; content: string }>;
    text?: { format?: { type?: string; name?: string; strict?: boolean; schema?: { required?: string[] } } };
  };
  const userPayload = JSON.parse(requestBody.input?.[1]?.content ?? "{}") as {
    promptId?: string;
    sourceStrategy?: { id?: string };
    sourceMaterials?: unknown[];
  };

  assert.equal(capturedInput, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer test-key");
  assert.equal(requestBody.model, "gpt-test");
  assert.equal(requestBody.text?.format?.type, "json_schema");
  assert.equal(requestBody.text?.format?.name, "answer_composition_result");
  assert.equal(requestBody.text?.format?.strict, true);
  assert.ok(requestBody.text?.format?.schema?.required?.includes("diagnostics"));
  assert.equal(userPayload.promptId, "prompt-alpha");
  assert.equal(userPayload.sourceStrategy?.id, "sanityHybrid");
  assert.deepEqual(userPayload.sourceMaterials, composerInput.sourceMaterials);
  assert.equal(result.draft, "Camp uses the alpha policy.");
});

test("OpenAI Answer Composer rejects provider output with invalid citation references", async () => {
  const composer = createOpenAIAnswerComposer(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () =>
      createJsonResponse({
        output_text: JSON.stringify({
          status: "composed",
          draft: "Camp uses an unknown policy.",
          citedSources: [],
          claims: [
            {
              claimId: "claim-1",
              text: "Unknown citation.",
              evidence: [{ sourceId: "entity-missing", snippetId: "entity-missing:contentMap" }],
            },
          ],
          diagnostics: {
            unsupportedClaims: [],
            missingSourceOfTruth: [],
            followUpQuestions: [],
          },
        }),
      }),
  );

  await assert.rejects(
    () => composer.compose(composerInput),
    /unknown source ids: entity-missing/,
  );
});

test("OpenAI Answer Composer repairs invalid cited source claim ids using matching claim evidence", async () => {
  const composer = createOpenAIAnswerComposer(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () =>
      createJsonResponse({
        output_text: JSON.stringify({
          status: "composed",
          draft: "Camp uses the alpha policy.",
          citedSources: [
            {
              sourceId: "entity-alpha",
              snippetId: "entity-alpha:contentMap",
              claimIds: ["deposit-details", "refund-details"],
            },
          ],
          claims: [
            {
              claimId: "claim-1",
              text: "The alpha source supports the answer.",
              evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
            },
          ],
          diagnostics: {
            unsupportedClaims: [],
            missingSourceOfTruth: [],
            followUpQuestions: [],
          },
        }),
      }),
  );

  const result = await composer.compose(composerInput);

  assert.deepEqual(result.citedSources[0]?.claimIds, ["claim-1"]);
  assert.deepEqual(result.citationDiagnostics, [
    "Repaired cited source claim IDs for entity-alpha#entity-alpha:contentMap: removed deposit-details, refund-details; added claim-1",
  ]);
});

test("OpenAI Answer Composer rebuilds cited sources from claim evidence when provider claim ids are unrecoverable", async () => {
  const inputWithUnrelatedCitedSource: AnswerComposerInput = {
    ...composerInput,
    sourceMaterials: [
      ...composerInput.sourceMaterials,
      {
        sourceId: "entity-beta",
        sourceType: "policy",
        title: "Entity Beta",
        rank: 2,
        score: 8,
        snippets: [
          {
            sourceId: "entity-beta",
            snippetId: "entity-beta:title",
            field: "title",
            text: "Entity Beta",
          },
        ],
      },
    ],
  };
  const composer = createOpenAIAnswerComposer(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () =>
      createJsonResponse({
        output_text: JSON.stringify({
          status: "composed",
          draft: "Camp uses the alpha policy.",
          citedSources: [
            {
              sourceId: "entity-beta",
              snippetId: "entity-beta:title",
              claimIds: ["6"],
            },
          ],
          claims: [
            {
              claimId: "claim-1",
              text: "The alpha source supports the answer.",
              evidence: [{ sourceId: "entity-alpha", snippetId: "entity-alpha:contentMap" }],
            },
          ],
          diagnostics: {
            unsupportedClaims: [],
            missingSourceOfTruth: [],
            followUpQuestions: [],
          },
        }),
      }),
  );

  const result = await composer.compose(inputWithUnrelatedCitedSource);

  assert.equal(result.citedSources[0]?.sourceId, "entity-alpha");
  assert.deepEqual(result.citedSources[0]?.claimIds, ["claim-1"]);
  assert.deepEqual(result.citationDiagnostics, [
    "Rebuilt cited source list from claim evidence after invalid cited source claim IDs: 6; cited sources: 1",
  ]);
});
