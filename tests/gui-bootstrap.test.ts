import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("repo-level check script covers the GUI typecheck and build path", () => {
  const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.check, "pnpm typecheck && pnpm build:gui");
  assert.equal(packageJson.scripts?.typecheck, "pnpm typecheck:ts && pnpm typecheck:gui");
  assert.equal(packageJson.scripts?.["build:gui"], "next build");
});

test("App Router bootstraps the root route into the operator surface", () => {
  const homePageSource = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
  const rootLayoutSource = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
  const operatorPageSource = readFileSync(join(process.cwd(), "app/operator/page.tsx"), "utf8");
  const adminPageSource = readFileSync(join(process.cwd(), "app/admin/[[...tool]]/page.tsx"), "utf8");

  assert.match(homePageSource, /redirect\("\/operator"\)/);
  assert.match(rootLayoutSource, /GuideSite Operator Demo Surface/);
  assert.match(operatorPageSource, /createGuideSiteGuiService/);
  assert.match(operatorPageSource, /OperatorDemoClient/);
  assert.match(adminPageSource, /NextStudio/);
});
