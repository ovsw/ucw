import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = process.cwd();

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

test("repo-level check script covers the GUI typecheck and build path", () => {
  const packageJson = JSON.parse(readRepoFile("package.json")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.check, "pnpm typecheck && pnpm build:gui");
  assert.equal(packageJson.scripts?.typecheck, "pnpm typecheck:ts && pnpm typecheck:gui");
  assert.equal(packageJson.scripts?.["build:gui"], "next build");
});

test("App Router bootstraps the root route into the operator surface", () => {
  const homePageSource = readRepoFile("app/page.tsx");
  const rootLayoutSource = readRepoFile("app/layout.tsx");
  const operatorPageSource = readRepoFile("app/operator/page.tsx");
  const adminPageSource = readRepoFile("app/admin/[[...tool]]/page.tsx");

  assert.match(homePageSource, /redirect\("\/operator"\)/);
  assert.match(rootLayoutSource, /GuideSite Operator Demo Surface/);
  assert.match(operatorPageSource, /createGuideSiteGuiService/);
  assert.match(operatorPageSource, /OperatorDemoClient/);
  assert.match(adminPageSource, /NextStudio/);
});

test("operator inspection drawer exposes source metadata, editorial gaps, and raw source diagnostics", () => {
  const operatorClientSource = readRepoFile("app/operator/operator-demo-client.tsx");

  assert.match(operatorClientSource, /Source ID:/);
  assert.match(operatorClientSource, /Field path:/);
  assert.match(operatorClientSource, /Revision:/);
  assert.match(operatorClientSource, /Editorial gaps/);
  assert.match(operatorClientSource, /Raw source diagnostics/);
});
