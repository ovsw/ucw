import assert from "node:assert/strict";
import test from "node:test";
import { readSanityQueryConfig, readSanitySeedConfig } from "../../src/retrieval-workbench/sanity-config.js";

test("query config requires the Sanity project id, dataset, and API version", () => {
  assert.throws(
    () => {
      readSanityQueryConfig({});
    },
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

test("query config preserves explicit values and optional read token", () => {
  const config = readSanityQueryConfig({
    SANITY_PROJECT_ID: "  project-123  ",
    SANITY_DATASET: "  prototype  ",
    SANITY_API_VERSION: "  2025-05-01  ",
    SANITY_READ_TOKEN: "  read-token  ",
  });

  assert.deepEqual(config, {
    projectId: "project-123",
    dataset: "prototype",
    apiVersion: "2025-05-01",
    readToken: "read-token",
  });
});

test("seed config requires a write token in addition to query config", () => {
  assert.throws(
    () => {
      readSanitySeedConfig({
        SANITY_PROJECT_ID: "project-123",
        SANITY_DATASET: "prototype",
        SANITY_API_VERSION: "2025-05-01",
      });
    },
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Missing required Sanity config for seed workflow/);
      assert.match(error.message, /SANITY_WRITE_TOKEN/);
      return true;
    },
  );
});

test("seed config reuses query config values when every required value is present", () => {
  const config = readSanitySeedConfig({
    SANITY_PROJECT_ID: "project-123",
    SANITY_DATASET: "prototype",
    SANITY_API_VERSION: "2025-05-01",
    SANITY_WRITE_TOKEN: "write-token",
    SANITY_READ_TOKEN: "read-token",
  });

  assert.deepEqual(config, {
    projectId: "project-123",
    dataset: "prototype",
    apiVersion: "2025-05-01",
    readToken: "read-token",
    writeToken: "write-token",
  });
});
