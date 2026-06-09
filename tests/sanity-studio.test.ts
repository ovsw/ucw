import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { readSanityStudioConfig } from "../sanity/studio-env.js";

test("Sanity Studio config requires public project and dataset values", () => {
  assert.throws(
    () => {
      readSanityStudioConfig({});
    },
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Missing required Sanity Studio config/);
      assert.match(error.message, /NEXT_PUBLIC_SANITY_PROJECT_ID/);
      assert.match(error.message, /NEXT_PUBLIC_SANITY_DATASET/);
      return true;
    },
  );
});

test("Sanity Studio config uses direct public env references for client bundling", () => {
  const envSource = readFileSync(join(process.cwd(), "sanity/studio-env.ts"), "utf8");

  assert.match(
    envSource,
    /NEXT_PUBLIC_SANITY_PROJECT_ID:\s*process\.env\.NEXT_PUBLIC_SANITY_PROJECT_ID/,
  );
  assert.match(
    envSource,
    /NEXT_PUBLIC_SANITY_DATASET:\s*process\.env\.NEXT_PUBLIC_SANITY_DATASET/,
  );
  assert.doesNotMatch(envSource, /process\.env\s+as\s+SanityStudioConfigEnv/);
});

test("Sanity Studio config is mounted at /admin with the current source schema", async () => {
  const originalProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
  const originalDataset = process.env.NEXT_PUBLIC_SANITY_DATASET;

  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = "project-123";
  process.env.NEXT_PUBLIC_SANITY_DATASET = "prototype";

  try {
    const module = await import("../sanity.config.js");
    const studioConfig = module.default;

    assert.equal(studioConfig.basePath, "/admin");

    const schemaTypeNames = studioConfig.schema.types.map(({ name }) => name).sort();

    for (const expectedType of ["concern", "policy", "program", "guide", "transportationRoute"]) {
      assert.ok(schemaTypeNames.includes(expectedType));
    }
  } finally {
    if (originalProjectId === undefined) {
      delete process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
    } else {
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID = originalProjectId;
    }

    if (originalDataset === undefined) {
      delete process.env.NEXT_PUBLIC_SANITY_DATASET;
    } else {
      process.env.NEXT_PUBLIC_SANITY_DATASET = originalDataset;
    }
  }
});

test("the admin route mounts NextStudio without going through the operator flow", () => {
  const pageSource = readFileSync(join(process.cwd(), "app/admin/[[...tool]]/page.tsx"), "utf8");

  assert.match(pageSource, /NextStudio/);
  assert.match(pageSource, /sanity\.config\.ts/);
  assert.match(pageSource, /export const dynamic = "force-static"/);
  assert.doesNotMatch(pageSource, /operator-demo-client|guide-site-gui-service/);
});
