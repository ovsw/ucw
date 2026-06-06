import assert from "node:assert/strict";
import test from "node:test";
import { createGuideSiteMemoryStores, startGuideSiteRun } from "../../src/guidesite-mvp/run-lifecycle.js";
import {
  ULTIMATE_CAMP_WEBSITE_THEME_STUB,
  createGuideSiteLoadingPresentation,
  mapGuideSiteRunStateToPresentation,
} from "../../src/guidesite-mvp/presentation-dto.js";
import type { AnswerComposition, RunState } from "../../src/guidesite-mvp/types.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

function createBaseRun(): RunState {
  const stores = createGuideSiteMemoryStores();
  return startGuideSiteRun({
    promptText: canonicalPrompt,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_presentation_dto",
    createRunId: () => "run_presentation_dto",
  }).run;
}

test("presentation DTO exposes the Ultimate Camp Website theme stub and loading state", () => {
  const presentation = createGuideSiteLoadingPresentation();

  assert.deepEqual(ULTIMATE_CAMP_WEBSITE_THEME_STUB, {
    campId: "ultimate-camp-website",
    campName: "Ultimate Camp Website",
    answerAccent: "amber",
    surfaceTone: "warm-sand",
    operatorChrome: "slate",
  });
  assert.equal(presentation.camp.campId, "ultimate-camp-website");
  assert.equal(presentation.answer.status, "loading");
  assert.equal(presentation.operatorDiagnostics.runStatus, "loading");
});

test("presentation DTO maps required questions apart from optional suggested prompts", () => {
  const run = createBaseRun();
  const answerComposition: AnswerComposition = {
    status: "needs_context",
    conversationalFraming: "More Visitor Context is needed before the GuideSite can answer honestly.",
    sections: [
      {
        kind: "context_needs",
        title: "Missing Visitor Context",
        body: "The next turn should gather the minimum required context before the answer can continue.",
        items: ["prior_sleepaway_experience"],
      },
      {
        kind: "context_needs",
        title: "Readiness Context",
        body: "The next turn should ask how the child responds to separation and new routines.",
        items: ["child_readiness"],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "Internal diagnostics remain operator-only.",
      },
    ],
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
      {
        id: "prompt_child_readiness",
        purpose: "gather_fit_context",
        text: "How does your child handle new routines away from home?",
        contextNeeds: ["child_readiness"],
        concerns: ["child_readiness"],
        templateId: "ask_child_readiness",
      },
      {
        id: "prompt_compare_options",
        purpose: "compare_options",
        text: "Would you like to compare overnight and day camp options?",
        contextNeeds: ["compare_options"],
        concerns: [],
        templateId: "compare_camp_options",
      },
    ],
    citations: [],
    diagnostics: ["needs_visitor_context"],
  };
  const contextualRun: RunState = {
    ...run,
    status: "composed",
    answerComposition,
    diagnostics: ["needs_visitor_context"],
  };

  const presentation = mapGuideSiteRunStateToPresentation(contextualRun);

  assert.equal(presentation.answer.status, "context_gathering_response");
  assert.deepEqual(presentation.answer.requiredQuestions, [
    {
      id: "prompt_prior_sleepaway_experience",
      text: "Has your child slept away from home before?",
      rationale: "The next turn should gather the minimum required context before the answer can continue.",
      controlledReplies: [
        {
          id: "prompt_prior_sleepaway_experience",
          text: "Has your child slept away from home before?",
          purpose: "gather_fit_context",
        },
      ],
    },
    {
      id: "prompt_child_readiness",
      text: "How does your child handle new routines away from home?",
      rationale: "The next turn should ask how the child responds to separation and new routines.",
      controlledReplies: [
        {
          id: "prompt_child_readiness",
          text: "How does your child handle new routines away from home?",
          purpose: "gather_fit_context",
        },
      ],
    },
  ]);
  assert.deepEqual(presentation.answer.suggestedPrompts, [
    {
      id: "prompt_compare_options",
      text: "Would you like to compare overnight and day camp options?",
      purpose: "compare_options",
    },
  ]);
  assert.equal(presentation.operatorDiagnostics.diagnostics[0], "needs_visitor_context");
});

test("presentation DTO suppresses already-answered required prompts from the required question list", () => {
  const run = createBaseRun();
  const answerComposition: AnswerComposition = {
    status: "needs_context",
    conversationalFraming: "More Visitor Context is needed before the GuideSite can answer honestly.",
    sections: [
      {
        kind: "context_needs",
        title: "Missing Visitor Context",
        body: "The next turn should gather the minimum required context before the answer can continue.",
        items: ["prior_sleepaway_experience", "child_readiness"],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "Internal diagnostics remain operator-only.",
      },
    ],
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
      {
        id: "prompt_child_readiness",
        purpose: "gather_fit_context",
        text: "How does your child handle new routines away from home?",
        contextNeeds: ["child_readiness"],
        concerns: ["child_readiness"],
        templateId: "ask_child_readiness",
      },
    ],
    citations: [],
    diagnostics: ["needs_visitor_context"],
  };
  const repeatedTurnRun: RunState = {
    ...run,
    status: "composed",
    understanding: {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
      facts: {
        prior_sleepaway_experience: {
          value: "slept_with_grandparents",
          provenance: {
            source: "explicit",
            promptText: "She has slept at her grandparents' house a few times.",
          },
        },
      },
      concerns: [
        {
          key: "homesickness",
          label: "Homesickness",
          status: "open",
          provenance: "implied",
        },
        {
          key: "child_readiness",
          label: "Child Readiness",
          status: "open",
          provenance: "implied",
        },
      ],
      retrievalNeeds: ["overnight_readiness", "homesickness_support"],
      contextNeeds: ["prior_sleepaway_experience", "child_readiness"],
    },
    answerComposition,
  };

  const presentation = mapGuideSiteRunStateToPresentation(repeatedTurnRun);

  assert.equal(presentation.answer.status, "context_gathering_response");
  assert.deepEqual(presentation.answer.requiredQuestions, [
    {
      id: "prompt_child_readiness",
      text: "How does your child handle new routines away from home?",
      rationale: "The next turn should gather the minimum required context before the answer can continue.",
      controlledReplies: [
        {
          id: "prompt_child_readiness",
          text: "How does your child handle new routines away from home?",
          purpose: "gather_fit_context",
        },
      ],
    },
  ]);
  assert.deepEqual(presentation.answer.suggestedPrompts, []);
});

test("presentation DTO maps source-backed assembled answers with lightweight citations", () => {
  const run = createBaseRun();
  const answerComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The approved source material explains how overnight camp supports the Child.",
    sections: [
      {
        kind: "summary",
        title: "Summary",
        body: "The camp offers overnight programming for age-appropriate campers.",
        sourceRefs: [
          {
            sourceId: "program_overnight",
            sourceType: "campProgram",
            title: "Overnight Camp Program",
            fieldPath: "summary",
            sourceRevision: "mock_rev_program_overnight_001",
          },
        ],
      },
      {
        kind: "concerns",
        title: "Concerns",
        body: "The homesickness policy outlines the support path.",
        items: ["homesickness"],
        sourceRefs: [
          {
            sourceId: "policy_homesickness",
            sourceType: "policy",
            title: "Homesickness Support Policy",
            fieldPath: "summary",
            sourceRevision: "mock_rev_policy_homesickness_001",
          },
        ],
      },
      {
        kind: "diagnostics",
        title: "Diagnostics",
        body: "Provider metadata stays out of the Parent-shaped answer output.",
      },
    ],
    suggestedPrompts: [],
    citations: ["program_overnight", "policy_homesickness"],
    diagnostics: [],
  };
  const answeredRun: RunState = {
    ...run,
    status: "composed",
    retrieval: {
      adapterId: "fixture",
      adapterLabel: "Fixture",
      needs: [],
      concerns: [],
      results: [
        {
          sourceId: "program_overnight",
          sourceType: "campProgram",
          title: "Overnight Camp Program",
          rank: 1,
          fieldPath: "summary",
          sourceRevision: "mock_rev_program_overnight_001",
        },
        {
          sourceId: "policy_homesickness",
          sourceType: "policy",
          title: "Homesickness Support Policy",
          rank: 2,
          fieldPath: "summary",
          sourceRevision: "mock_rev_policy_homesickness_001",
        },
      ],
      diagnostics: [],
      coverage: {
        status: "source_backed",
        matchedSourceIds: ["program_overnight", "policy_homesickness"],
      },
    },
    answerComposition,
    promptUnderstandingProvider: {
      provider: "openai",
      model: "gpt-test",
      rawOutput: null,
      parsedOutput: null,
      diagnostics: [],
    },
  };

  const presentation = mapGuideSiteRunStateToPresentation(answeredRun);

  assert.equal(presentation.answer.status, "assembled_answer");
  assert.equal(presentation.answer.completeness, "complete");
  assert.equal(presentation.answer.sections.length, 2);
  assert.deepEqual(presentation.answer.sections[0].citations, [
    {
      sourceId: "program_overnight",
      label: "Overnight Camp Program",
    },
  ]);
  assert.deepEqual(presentation.answer.citations, [
    {
      sourceId: "program_overnight",
      label: "Overnight Camp Program",
    },
    {
      sourceId: "policy_homesickness",
      label: "Homesickness Support Policy",
    },
  ]);
  assert.equal("provider" in presentation.answer, false);
  assert.equal("model" in presentation.answer, false);
  assert.equal(presentation.operatorDiagnostics.provider, "openai");
  assert.equal(presentation.operatorDiagnostics.model, "gpt-test");
});

test("presentation DTO gates answered output back to context gathering when required context is unresolved", () => {
  const run = createBaseRun();
  const answerComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The source-backed answer is ready.",
    sections: [
      {
        kind: "context_needs",
        title: "Missing Visitor Context",
        body: "The next turn should gather the minimum required context before the answer can continue.",
        items: ["prior_sleepaway_experience"],
      },
      {
        kind: "summary",
        title: "Summary",
        body: "The camp offers overnight programming for age-appropriate campers.",
        sourceRefs: [
          {
            sourceId: "program_overnight",
            sourceType: "campProgram",
            title: "Overnight Camp Program",
            fieldPath: "summary",
            sourceRevision: "mock_rev_program_overnight_001",
          },
        ],
      },
    ],
    suggestedPrompts: [
      {
        id: "prompt_prior_sleepaway_experience",
        purpose: "gather_fit_context",
        text: "Has your child slept away from home before?",
        contextNeeds: ["prior_sleepaway_experience"],
        concerns: ["homesickness"],
        templateId: "ask_sleepaway_experience",
      },
    ],
    citations: ["program_overnight"],
    diagnostics: [],
  };
  const unresolvedContextRun: RunState = {
    ...run,
    status: "composed",
    understanding: {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
      facts: {
        child_age: {
          value: 8,
          provenance: {
            source: "explicit",
            promptText: "8-year-old",
          },
        },
      },
      concerns: [],
      retrievalNeeds: ["overnight_readiness"],
      contextNeeds: ["prior_sleepaway_experience"],
    },
    retrieval: {
      adapterId: "fixture",
      adapterLabel: "Fixture",
      needs: ["overnight_readiness"],
      concerns: [],
      results: [
        {
          sourceId: "program_overnight",
          sourceType: "campProgram",
          title: "Overnight Camp Program",
          rank: 1,
          fieldPath: "summary",
          sourceRevision: "mock_rev_program_overnight_001",
        },
      ],
      diagnostics: [],
      coverage: {
        status: "source_backed",
        matchedSourceIds: ["program_overnight"],
      },
    },
    answerComposition,
  };

  const presentation = mapGuideSiteRunStateToPresentation(unresolvedContextRun);

  assert.equal(presentation.answer.status, "context_gathering_response");
  assert.deepEqual(presentation.answer.requiredQuestions, [
    {
      id: "prompt_prior_sleepaway_experience",
      text: "Has your child slept away from home before?",
      rationale: "The next turn should gather the minimum required context before the answer can continue.",
      controlledReplies: [
        {
          id: "prompt_prior_sleepaway_experience",
          text: "Has your child slept away from home before?",
          purpose: "gather_fit_context",
        },
      ],
    },
  ]);
  assert.equal(presentation.operatorDiagnostics.diagnostics[0], "assembled_answer_gated_by_unresolved_context_needs: prior_sleepaway_experience");
});

test("presentation DTO gates incomplete source coverage back to responsible abstention", () => {
  const run = createBaseRun();
  const answerComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The source-backed answer is ready.",
    sections: [
      {
        kind: "summary",
        title: "Summary",
        body: "The camp offers overnight programming for age-appropriate campers.",
        sourceRefs: [
          {
            sourceId: "program_overnight",
            sourceType: "campProgram",
            title: "Overnight Camp Program",
            fieldPath: "summary",
            sourceRevision: "mock_rev_program_overnight_001",
          },
        ],
      },
    ],
    suggestedPrompts: [],
    citations: ["program_overnight"],
    diagnostics: [],
  };
  const incompleteCoverageRun: RunState = {
    ...run,
    status: "composed",
    understanding: {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
      facts: {
        child_age: {
          value: 8,
          provenance: {
            source: "explicit",
            promptText: "8-year-old",
          },
        },
      },
      concerns: [],
      retrievalNeeds: ["overnight_readiness"],
      contextNeeds: [],
    },
    retrieval: {
      adapterId: "fixture",
      adapterLabel: "Fixture",
      needs: ["overnight_readiness"],
      concerns: [],
      results: [],
      diagnostics: ["fixture_retrieval_empty"],
      coverage: {
        status: "empty_retrieval",
        matchedSourceIds: [],
      },
    },
    answerComposition,
  };

  const presentation = mapGuideSiteRunStateToPresentation(incompleteCoverageRun);

  assert.equal(presentation.answer.status, "responsible_abstention");
  assert.equal(presentation.answer.conversationalFraming, "The GuideSite cannot responsibly answer this prompt yet.");
  assert.equal(presentation.operatorDiagnostics.diagnostics[0], "assembled_answer_gated_by_insufficient_source_coverage");
});

test("presentation DTO maps abstention distinctly from technical failure", () => {
  const run = createBaseRun();
  const abstainingRun: RunState = {
    ...run,
    status: "fallback",
    answerComposition: {
      status: "fallback",
      conversationalFraming: "The GuideSite cannot responsibly answer this prompt yet.",
      sections: [
        {
          kind: "diagnostics",
          title: "Fallback",
          body: "The current slice has no approved source-backed answer for this prompt.",
        },
      ],
      suggestedPrompts: [],
      citations: [],
      diagnostics: ["unknown_prompt_fallback"],
    },
  };
  const failedRun: RunState = {
    ...run,
    status: "retrieval_failed",
    diagnostics: ["retrieval_failed: fixture retrieval broke"],
  };

  const abstention = mapGuideSiteRunStateToPresentation(abstainingRun);
  const technicalFailure = mapGuideSiteRunStateToPresentation(failedRun);

  assert.equal(abstention.answer.status, "responsible_abstention");
  assert.match(abstention.answer.nextSteps[0], /Provide more context/);
  assert.equal(technicalFailure.answer.status, "technical_failure");
  assert.equal(technicalFailure.answer.title, "Technical failure");
  assert.equal(technicalFailure.operatorDiagnostics.diagnostics[0], "retrieval_failed: fixture retrieval broke");
});
