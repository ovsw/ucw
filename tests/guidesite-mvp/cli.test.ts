import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GUIDESITE_MVP_PROMPT,
  parseGuideSiteMvpCliArgs,
  runGuideSiteMvpCli,
} from "../../src/guidesite-mvp/cli.js";

test("GuideSite MVP CLI defaults to the canonical Prompt and commits the walking skeleton", () => {
  const output = runGuideSiteMvpCli([]);

  assert.match(output, new RegExp(`Prompt: ${DEFAULT_GUIDESITE_MVP_PROMPT.replace("?", "\\?")}`));
  assert.match(output, /Prompt Understanding:/);
  assert.match(output, /"goal": "assess_fit"/);
  assert.match(output, /Answer Composition:/);
  assert.match(output, /"status": "needs_context"/);
  assert.match(output, /Session Patch:/);
  assert.match(output, /Committed Session State:/);
  assert.match(output, /"revision": 2/);
  assert.match(output, /Has your child slept away from home before\?/);
});

test("GuideSite MVP CLI accepts a typed Prompt and shows the fallback path", () => {
  const output = runGuideSiteMvpCli(["Can", "you", "plan", "my", "whole", "summer?"]);

  assert.match(output, /Prompt: Can you plan my whole summer\?/);
  assert.match(output, /"status": "fallback"/);
  assert.match(output, /unknown_prompt_fallback/);
  assert.match(output, /Session Patch:\nnull/);
  assert.match(output, /Committed Session State:\nnull/);
});

test("GuideSite MVP CLI argument parsing joins unquoted Prompt text and defaults when empty", () => {
  assert.deepEqual(parseGuideSiteMvpCliArgs([]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["  "]), {
    promptText: DEFAULT_GUIDESITE_MVP_PROMPT,
  });
  assert.deepEqual(parseGuideSiteMvpCliArgs(["Is", "overnight", "camp", "right?"]), {
    promptText: "Is overnight camp right?",
  });
});
