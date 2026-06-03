import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL,
  PromptUnderstandingProviderError,
  createOpenAIPromptUnderstandingProvider,
  readOpenAIPromptUnderstandingConfig,
} from "../../src/guidesite-mvp/openai-prompt-understanding.js";

const validUnderstanding = {
  goal: "assess_fit",
  promptType: "fit",
  fitQuestion: "Assess whether overnight camp is a good fit.",
  facts: {
    child_age: {
      value: 8,
      provenance: {
        source: "explicit",
        promptText: "8-year-old",
      },
    },
  },
  concerns: [
    {
      key: "homesickness",
      label: "Homesickness",
      status: "open",
      provenance: "implied",
    },
  ],
  retrievalNeeds: ["overnight_readiness"],
  contextNeeds: ["prior_sleepaway_experience"],
};

function createJsonResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: {
      "content-type": "application/json",
    },
  });
}

test("OpenAI Prompt Understanding config requires an API key and trims the optional model override", () => {
  assert.throws(
    () => readOpenAIPromptUnderstandingConfig({}),
    /Missing required OpenAI config for GuideSite Prompt Understanding: OPENAI_API_KEY/,
  );

  assert.deepEqual(readOpenAIPromptUnderstandingConfig({ OPENAI_API_KEY: " key " }), {
    apiKey: "key",
    model: DEFAULT_OPENAI_PROMPT_UNDERSTANDING_MODEL,
  });

  assert.deepEqual(
    readOpenAIPromptUnderstandingConfig({
      OPENAI_API_KEY: " key ",
      OPENAI_PROMPT_UNDERSTANDING_MODEL: " gpt-test ",
    }),
    {
      apiKey: "key",
      model: "gpt-test",
    },
  );
});

test("OpenAI Prompt Understanding uses fetch, Structured Outputs, and local schema validation", async () => {
  let capturedInput: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  const provider = createOpenAIPromptUnderstandingProvider(
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
                text: JSON.stringify(validUnderstanding),
              },
            ],
          },
        ],
      });
    },
  );

  const result = await provider.understandPrompt("Is overnight camp right for my 8-year-old?");
  const requestBody = JSON.parse(String(capturedInit?.body ?? "{}")) as {
    model?: string;
    input?: Array<{ role: string; content: string }>;
    text?: { format?: { type?: string; strict?: boolean; schema?: { required?: string[] } } };
  };
  const userPayload = JSON.parse(requestBody.input?.[1]?.content ?? "{}") as { prompt?: string };

  assert.equal(capturedInput, "https://api.openai.com/v1/responses");
  assert.equal(capturedInit?.method, "POST");
  assert.equal((capturedInit?.headers as Record<string, string>).authorization, "Bearer test-key");
  assert.equal(requestBody.model, "gpt-test");
  assert.equal(requestBody.text?.format?.type, "json_schema");
  assert.equal(requestBody.text?.format?.strict, true);
  assert.ok(requestBody.text?.format?.schema?.required?.includes("contextNeeds"));
  assert.equal(userPayload.prompt, "Is overnight camp right for my 8-year-old?");
  assert.deepEqual(result.understanding, validUnderstanding);
  assert.deepEqual(result.trace, {
    provider: "openai",
    model: "gpt-test",
    rawOutput: JSON.stringify(validUnderstanding),
    parsedOutput: validUnderstanding,
    diagnostics: [],
  });
});

test("OpenAI Prompt Understanding rejects invalid JSON while preserving raw provider output", async () => {
  const provider = createOpenAIPromptUnderstandingProvider(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () => createJsonResponse({ output_text: "not-json" }),
  );

  await assert.rejects(
    () => provider.understandPrompt("Is camp right?"),
    (error) => {
      assert.ok(error instanceof PromptUnderstandingProviderError);
      assert.match(error.message, /was not valid JSON/);
      assert.equal(error.rawOutput, "not-json");
      return true;
    },
  );
});

test("OpenAI Prompt Understanding rejects refusals and HTTP failures", async () => {
  const refusedProvider = createOpenAIPromptUnderstandingProvider(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () =>
      createJsonResponse({
        output: [
          {
            type: "message",
            content: [{ type: "refusal", refusal: "no" }],
          },
        ],
      }),
  );
  const httpFailureProvider = createOpenAIPromptUnderstandingProvider(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () => new Response("bad gateway", { status: 502, statusText: "Bad Gateway" }),
  );

  await assert.rejects(() => refusedProvider.understandPrompt("Is camp right?"), /request was refused/);
  await assert.rejects(() => httpFailureProvider.understandPrompt("Is camp right?"), /502 Bad Gateway: bad gateway/);
});

test("OpenAI Prompt Understanding rejects invalid schema output while preserving parsed provider output", async () => {
  const invalidOutput = {
    ...validUnderstanding,
    facts: {
      child_age: {
        value: { nested: "not allowed" },
        provenance: {
          source: "explicit",
          promptText: "8-year-old",
        },
      },
    },
  };
  const provider = createOpenAIPromptUnderstandingProvider(
    {
      apiKey: "test-key",
      model: "gpt-test",
    },
    async () => createJsonResponse({ output_text: JSON.stringify(invalidOutput) }),
  );

  await assert.rejects(
    () => provider.understandPrompt("Is camp right?"),
    (error) => {
      assert.ok(error instanceof PromptUnderstandingProviderError);
      assert.match(error.message, /failed local schema validation/);
      assert.deepEqual(error.parsedOutput, invalidOutput);
      assert.ok(error.diagnostics.some((diagnostic) => diagnostic.includes("facts.child_age.value")));
      return true;
    },
  );
});
