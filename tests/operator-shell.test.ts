import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import OperatorPage from "../app/operator/page.js";
import OperatorLoading from "../app/operator/loading.js";
import { DEFAULT_GUIDESITE_GUI_RUN_STORE_DIRECTORY, DEFAULT_GUIDESITE_GUI_SESSION_STORE_DIRECTORY } from "../app/operator/guide-site-gui-service.js";

test("operator shell starts with a blank parent prompt form", async () => {
  const previousRuntimeMode = process.env.GUIDESITE_GUI_RUNTIME_MODE;
  process.env.GUIDESITE_GUI_RUNTIME_MODE = "fixture";

  try {
    const markup = renderToStaticMarkup(await OperatorPage());

    for (const expected of [
      /GuideSite demo/,
      /Start here/,
      /Ask a parent question\./,
      /First parent question/,
      /Understand prompt/,
      /placeholder="Is overnight camp right for my 8-year-old\?"/,
      /Submit the first parent question to start/,
      /Admin/,
      /href="\/admin"/,
      /Progress/,
      /What we know/,
      /Show history/,
      /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/,
      /lg:sticky/,
      /data-camp-id="ultimate-camp-website"/,
      /data-answer-accent="amber"/,
      /sm:flex-row/,
      /focus-visible:ring-2/,
    ]) {
      assert.match(markup, expected);
    }
    for (const forbidden of [
      /Technical failure/,
      /Can’t answer yet/,
      /Answer ready/,
      /Question to ask/,
      /Parent question/,
      /New demo/,
      /name="sessionId"/,
      /Get the missing parent details/,
      /Questions to ask/,
      /GuideSite operator shell/,
      /Parent-shaped output/,
      /Context Gathering Response/,
      /Operator Demo Surface/,
      /Controlled prompts first/,
      /Session state is not editable/i,
    ]) {
      assert.doesNotMatch(markup, forbidden);
    }
    assert.doesNotMatch(markup, /uncertain/i);
    assert.doesNotMatch(markup, /chat transcript/i);
    assert.doesNotMatch(markup, /NextStudio/);
    assert.doesNotMatch(markup, /Sanity Studio embedded/i);
  } finally {
    rmSync(join(process.cwd(), DEFAULT_GUIDESITE_GUI_SESSION_STORE_DIRECTORY), {
      recursive: true,
      force: true,
    });
    rmSync(join(process.cwd(), DEFAULT_GUIDESITE_GUI_RUN_STORE_DIRECTORY), {
      recursive: true,
      force: true,
    });
    if (previousRuntimeMode === undefined) {
      delete process.env.GUIDESITE_GUI_RUNTIME_MODE;
    } else {
      process.env.GUIDESITE_GUI_RUNTIME_MODE = previousRuntimeMode;
    }
  }
});

test("operator loading route stays simple and readable", () => {
  const markup = renderToStaticMarkup(OperatorLoading());

  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /Loading the operator view/);
  assert.match(markup, /Preparing the parent question, progress panel, and answer state/);
});

test("global CSS imports Tailwind 4 and the PostCSS plugin is configured", () => {
  const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const postcssConfig = readFileSync(join(process.cwd(), "postcss.config.mjs"), "utf8");

  assert.match(globalsCss, /@import "tailwindcss";/);
  assert.match(globalsCss, /--ucw-answer-surface: #fffaf1;/);
  assert.match(globalsCss, /--ucw-answer-accent: #b45309;/);
  assert.match(postcssConfig, /"@tailwindcss\/postcss"/);
});
