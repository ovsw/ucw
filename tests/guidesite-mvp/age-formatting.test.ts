import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChildAge,
  getIndefiniteArticleForAge,
} from "../../src/guidesite-mvp/age-formatting.js";

test("age formatting returns the spoken article for supported child ages", () => {
  assert.equal(getIndefiniteArticleForAge(7), "a");
  assert.equal(getIndefiniteArticleForAge(8), "an");
  assert.equal(getIndefiniteArticleForAge(11), "an");
  assert.equal(getIndefiniteArticleForAge(18), "an");
  assert.equal(getIndefiniteArticleForAge(21), "a");
});

test("age formatting normalizes child ages before rendering the phrase", () => {
  assert.equal(formatChildAge(7), "a 7-year-old");
  assert.equal(formatChildAge(-8.9), "an 8-year-old");
});
