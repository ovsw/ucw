import assert from "node:assert/strict";
import test from "node:test";
import { loadFixture } from "../../src/retrieval-workbench/load-fixture.js";
import { buildSanityHybridQueryPlan, buildSanityKeywordQueryPlan } from "../../src/retrieval-workbench/sanity-retrieval.js";

const regressionCases = [
  {
    promptId: "prompt-allergy-epipen",
    shapedQuery: "peanut allergy carries epipen keep safe safety",
  },
  {
    promptId: "prompt-first-time-homesick",
    shapedQuery: "daughter never slept away home gets homesick homesickness readiness overnight",
  },
  {
    promptId: "prompt-price-refund",
    shapedQuery:
      "much pricing affordability budget cost tuition payment due schedule deposit deposits happens cancel cancellation refund refunds",
  },
  {
    promptId: "prompt-swim-weak-swimmer",
    shapedQuery: "not strong swim swimming waterfront water still join lake activities safe safety",
  },
  {
    promptId: "prompt-bullying-and-homesickness",
    shapedQuery: "shy nervous social bully bullying unsafe reporting homesickness days",
  },
  {
    promptId: "prompt-phone-contact",
    shapedQuery: "phone electronics not allowed know nervous homesickness readiness doing okay",
  },
  {
    promptId: "prompt-day-camp-alternative",
    shapedQuery: "overnight homesickness readiness now day gentler option",
  },
];

test("Sanity query plans shape known noisy parent prompts before text::query search", async () => {
  const fixture = await loadFixture("fixtures/retrieval-workbench/generated.json");

  for (const { promptId, shapedQuery } of regressionCases) {
    const prompt = fixture.goldSet.find((entry) => entry._id === promptId);

    assert.ok(prompt, `missing regression prompt ${promptId}`);
    assert.equal(buildSanityKeywordQueryPlan(prompt.prompt).searchQuery, shapedQuery);
    assert.equal(buildSanityHybridQueryPlan(prompt.prompt).searchQuery, shapedQuery);
  }
});
