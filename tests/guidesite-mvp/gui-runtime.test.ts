import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_GUI_RUNTIME_MODE,
  readGuideSiteGuiRuntimeConfig,
} from "../../src/guidesite-mvp/gui-runtime.js";

test("GUI runtime config defaults to live mode and requires Sanity config", () => {
  assert.equal(DEFAULT_GUIDESITE_GUI_RUNTIME_MODE, "live");

  assert.throws(
    () => readGuideSiteGuiRuntimeConfig({ env: {} }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Missing required Sanity config for query workflow/);
      assert.match(error.message, /SANITY_PROJECT_ID/);
      assert.match(error.message, /SANITY_DATASET/);
      assert.match(error.message, /SANITY_API_VERSION/);
      return true;
    },
  );
});

test("GUI runtime config requires explicit OpenAI prompt understanding config in live mode", () => {
  assert.throws(
    () =>
      readGuideSiteGuiRuntimeConfig({
        env: {
          SANITY_PROJECT_ID: "project-123",
          SANITY_DATASET: "production",
          SANITY_API_VERSION: "2025-02-19",
        },
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Missing required OpenAI config for GuideSite GUI live mode/);
      assert.match(error.message, /OPENAI_API_KEY/);
      assert.match(error.message, /OPENAI_PROMPT_UNDERSTANDING_MODEL/);
      return true;
    },
  );
});

test("GUI runtime config accepts valid live mode config without any dummy fallback model", () => {
  const config = readGuideSiteGuiRuntimeConfig({
    env: {
      SANITY_PROJECT_ID: " project-123 ",
      SANITY_DATASET: " production ",
      SANITY_API_VERSION: " 2025-02-19 ",
      SANITY_READ_TOKEN: " read-token ",
      OPENAI_API_KEY: " openai-key ",
      OPENAI_PROMPT_UNDERSTANDING_MODEL: " gpt-test ",
    },
  });

  assert.deepEqual(config, {
    runtimeMode: "live",
    retrievalMode: "sanity",
    sanityQueryConfig: {
      projectId: "project-123",
      dataset: "production",
      apiVersion: "2025-02-19",
      readToken: "read-token",
    },
    promptUnderstandingConfig: {
      apiKey: "openai-key",
      model: "gpt-test",
    },
  });
});

test("GUI runtime config requires explicit fixture mode instead of silently falling back from live mode", () => {
  assert.throws(
    () =>
      readGuideSiteGuiRuntimeConfig({
        env: {
          GUIDESITE_GUI_RUNTIME_MODE: "live",
          OPENAI_API_KEY: "openai-key",
          OPENAI_PROMPT_UNDERSTANDING_MODEL: "gpt-test",
        },
      }),
    /Missing required Sanity config for query workflow/,
  );
});

test("GUI runtime config accepts explicit fixture mode without live demo config", () => {
  const config = readGuideSiteGuiRuntimeConfig({
    env: {
      GUIDESITE_GUI_RUNTIME_MODE: "fixture",
    },
  });

  assert.deepEqual(config, {
    runtimeMode: "fixture",
    retrievalMode: "fixture",
  });
});

test("GUI runtime config rejects unknown runtime modes", () => {
  assert.throws(
    () =>
      readGuideSiteGuiRuntimeConfig({
        env: {
          GUIDESITE_GUI_RUNTIME_MODE: "preview",
        },
      }),
    /Unknown GuideSite GUI runtime mode: preview\. Use live or fixture\./,
  );
});
