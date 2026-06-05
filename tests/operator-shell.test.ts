import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import OperatorPage from "../app/operator/page.js";

test("operator shell renders the canonical demo surface", () => {
  const markup = renderToStaticMarkup(OperatorPage());

  for (const expected of [
    /Operator Demo Surface/,
    /GuideSite operator shell/,
    /Parent-shaped output placeholder/,
    /Is overnight camp right for my 8-year-old\?/,
    /Foundation checks/,
    /App Router root and operator routes are mounted\./,
    /Operator shell stays separate from the Parent-shaped answer canvas\./,
  ]) {
    assert.match(markup, expected);
  }
});

test("global CSS imports Tailwind 4 and the PostCSS plugin is configured", () => {
  const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const postcssConfig = readFileSync(join(process.cwd(), "postcss.config.mjs"), "utf8");

  assert.match(globalsCss, /@import "tailwindcss";/);
  assert.match(postcssConfig, /"@tailwindcss\/postcss"/);
});
