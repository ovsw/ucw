import assert from "node:assert/strict";
import test from "node:test";
import { collectUnresolvedContextNeeds } from "../../src/guidesite-mvp/context-needs.js";
import { createGuideSiteMemoryStores, startGuideSiteRun } from "../../src/guidesite-mvp/run-lifecycle.js";
import type { RunState } from "../../src/guidesite-mvp/types.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("collectUnresolvedContextNeeds removes resolved and duplicate context needs", () => {
  const stores = createGuideSiteMemoryStores();
  const run = startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_context_needs",
    createRunId: () => "run_context_needs",
  }).run;

  const contextualRun: RunState = {
    ...run,
    understanding: {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion:
        "Assess whether overnight camp is a good fit for the Parent's Child after learning about prior sleepaway experience.",
      facts: {
        prior_sleepaway_experience: {
          value: "slept_with_grandparents",
          provenance: {
            source: "explicit",
            promptText: "She has slept at her grandparents' house a few times.",
          },
        },
      },
      concerns: [],
      retrievalNeeds: [],
      contextNeeds: [
        "prior_sleepaway_experience",
        "child_readiness",
        "child_readiness",
      ],
    },
  };

  assert.deepEqual(collectUnresolvedContextNeeds(contextualRun), ["child_readiness"]);
});
