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
  assert.equal(presentation.operatorInspection.validation.summary.answerDisposition, "loading");
  assert.equal(presentation.operatorInspection.rawStructuredOutput.summary.hasPromptUnderstanding, false);
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
        kind: "sources",
        title: "Sources",
        body: "Approved source material from the fixture retrieval adapter was retrieved for the assembled answer.",
        items: [
          "Overnight Camp Program (program_overnight)",
          "Homesickness Support Policy (policy_homesickness)",
        ],
        sourceRefs: [
          {
            sourceId: "program_overnight",
            sourceType: "campProgram",
            title: "Overnight Camp Program",
            fieldPath: "summary",
            sourceRevision: "mock_rev_program_overnight_001",
          },
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
      concerns: [
        {
          key: "homesickness",
          label: "Homesickness",
          status: "open",
          provenance: "implied",
        },
      ],
      retrievalNeeds: ["overnight_readiness"],
      contextNeeds: [],
    },
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
      rawOutput: "{\"goal\":\"assess_fit\"}",
      parsedOutput: { goal: "assess_fit" },
      diagnostics: [],
    },
    promptUnderstandingValidation: {
      valid: true,
      diagnostics: [],
    },
    answerCompositionValidation: {
      valid: true,
      diagnostics: [],
    },
  };

  const presentation = mapGuideSiteRunStateToPresentation(answeredRun);

  assert.equal(presentation.answer.status, "assembled_answer");
  assert.equal(presentation.answer.completeness, "complete");
  assert.equal(presentation.answer.sections.length, 2);
  assert.equal(presentation.answer.sections.some((section) => section.title === "Sources"), false);
  assert.deepEqual(presentation.answer.sections[0].citations, [
    {
      label: "Overnight Camp Program",
    },
  ]);
  assert.deepEqual(presentation.answer.citations, [
    {
      label: "Overnight Camp Program",
    },
    {
      label: "Homesickness Support Policy",
    },
  ]);
  assert.equal("sourceType" in presentation.answer.sections[0].citations[0], false);
  assert.equal("fieldPath" in presentation.answer.sections[0].citations[0], false);
  assert.equal("sourceRevision" in presentation.answer.sections[0].citations[0], false);
  assert.equal("provider" in presentation.answer, false);
  assert.equal("model" in presentation.answer, false);
  assert.deepEqual(presentation.journeyTimeline.prompts, [
    {
      runId: "run_presentation_dto",
      text: canonicalPrompt,
      source: "typed",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(presentation.journeyTimeline.visitorContext, [
    {
      key: "child_age",
      label: "Child Age",
      value: "8",
      source: "explicit",
    },
  ]);
  assert.deepEqual(presentation.journeyTimeline.concerns, [
    {
      key: "homesickness",
      label: "Homesickness",
      status: "addressed",
    },
  ]);
  assert.equal(presentation.operatorDiagnostics.provider, "openai");
  assert.equal(presentation.operatorDiagnostics.model, "gpt-test");
  assert.equal(presentation.operatorInspection.providerMetadata.summary.provider, "openai");
  assert.equal(presentation.operatorInspection.providerMetadata.summary.model, "gpt-test");
  assert.equal(presentation.operatorInspection.retrieval.summary.coverageStatus, "source_backed");
  assert.equal(
    presentation.operatorInspection.retrieval.summary.coverageExplanation,
    "Retrieval found 2 matched Sources of Truth for the assembled answer.",
  );
  assert.deepEqual(presentation.operatorInspection.retrieval.summary.retrievalDiagnostics, []);
  assert.deepEqual(presentation.operatorInspection.retrieval.summary.editorialGaps, []);
  assert.deepEqual(presentation.operatorInspection.retrieval.sourceCoverage, [
    {
      sourceId: "program_overnight",
      sourceType: "campProgram",
      title: "Overnight Camp Program",
      rank: 1,
      fieldPath: "summary",
      sourceRevision: "mock_rev_program_overnight_001",
      matched: true,
    },
    {
      sourceId: "policy_homesickness",
      sourceType: "policy",
      title: "Homesickness Support Policy",
      rank: 2,
      fieldPath: "summary",
      sourceRevision: "mock_rev_policy_homesickness_001",
      matched: true,
    },
  ]);
  assert.deepEqual(presentation.operatorInspection.promptUnderstanding.summary, {
    goal: "assess_fit",
    promptType: "fit",
    fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
    factCount: 1,
    concernCount: 1,
    retrievalNeeds: ["overnight_readiness"],
    contextNeeds: [],
  });
  assert.equal(presentation.operatorInspection.validation.summary.answerDisposition, "assembled_answer");
  assert.equal(presentation.operatorInspection.validation.summary.promptUnderstandingValid, true);
  assert.equal(presentation.operatorInspection.validation.summary.answerCompositionValid, true);
  assert.equal(presentation.operatorInspection.rawStructuredOutput.summary.hasProviderRawOutput, true);
  assert.deepEqual(presentation.operatorInspection.rawStructuredOutput.details.providerParsedOutput, { goal: "assess_fit" });
  assert.equal(presentation.operatorInspection.rawStructuredOutput.details.providerRawOutput, "{\"goal\":\"assess_fit\"}");
  assert.doesNotMatch(JSON.stringify(presentation.answer), /program_overnight|policy_homesickness|mock_rev_|fieldPath|sourceRevision/);
  assert.match(JSON.stringify(presentation.operatorInspection.retrieval.details), /program_overnight/);
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
  assert.equal(presentation.answer.conversationalFraming, "The GuideSite needs more Visitor Context before it can honestly answer.");
  assert.doesNotMatch(presentation.answer.conversationalFraming, /source-backed answer is ready/i);
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

test("presentation DTO hides invalid answer candidates behind technical failure", () => {
  const run = createBaseRun();
  const invalidAnswerComposition: AnswerComposition = {
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
  const invalidAnswerRun: RunState = {
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
      ],
      diagnostics: [],
      coverage: {
        status: "source_backed",
        matchedSourceIds: ["program_overnight"],
      },
    },
    answerComposition: invalidAnswerComposition,
    answerCompositionValidation: {
      valid: false,
      diagnostics: ["answer_composition_citation_program_overnight_unsupported_source_ref"],
    },
    rejectedAnswerComposition: invalidAnswerComposition,
  };

  const presentation = mapGuideSiteRunStateToPresentation(invalidAnswerRun);

  assert.equal(presentation.answer.status, "technical_failure");
  assert.match(presentation.answer.message, /failed before a product answer could be rendered/i);
  assert.equal(presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.deepEqual(presentation.operatorDiagnostics.diagnostics, [
    "answer_composition_citation_program_overnight_unsupported_source_ref",
  ]);
  assert.equal(presentation.operatorInspection.validation.summary.answerDisposition, "technical_failure");
  assert.equal(presentation.operatorInspection.validation.summary.answerCompositionValid, false);
  assert.match(presentation.operatorInspection.validation.summary.reasoning[0] ?? "", /failed validation/);
  assert.equal(
    presentation.operatorInspection.rawStructuredOutput.details.rejectedAnswerComposition?.status,
    "answered",
  );
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
      diagnostics: [
        "insufficient_fixture_sources: no approved fixture sources matched retrieval needs overnight_readiness or concerns (none)",
      ],
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
  assert.equal(presentation.operatorInspection.validation.summary.answerDisposition, "responsible_abstention");
  assert.match(presentation.operatorInspection.validation.summary.reasoning[0] ?? "", /abstained/);
  assert.equal(presentation.operatorInspection.retrieval.summary.coverageStatus, "empty_retrieval");
  assert.equal(
    presentation.operatorInspection.retrieval.summary.coverageExplanation,
    "No approved Sources of Truth matched the validated Prompt Understanding, so the answer cannot assemble from source-backed material.",
  );
  assert.deepEqual(presentation.operatorInspection.retrieval.summary.editorialGaps, [
    "Missing approved Sources of Truth for the validated retrieval needs or concerns.",
    "insufficient_fixture_sources: no approved fixture sources matched retrieval needs overnight_readiness or concerns (none)",
  ]);
  assert.deepEqual(presentation.operatorInspection.retrieval.summary.retrievalDiagnostics, [
    "insufficient_fixture_sources: no approved fixture sources matched retrieval needs overnight_readiness or concerns (none)",
  ]);
  assert.deepEqual(presentation.operatorInspection.retrieval.details?.diagnostics, [
    "insufficient_fixture_sources: no approved fixture sources matched retrieval needs overnight_readiness or concerns (none)",
  ]);
  assert.doesNotMatch(JSON.stringify(presentation.answer), /insufficient_fixture_sources|Sources of Truth|sourceId|sourceRevision/);
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
  assert.equal(abstention.operatorInspection.validation.summary.answerDisposition, "responsible_abstention");
  assert.equal(technicalFailure.operatorInspection.validation.summary.answerDisposition, "technical_failure");
  assert.match(technicalFailure.operatorInspection.validation.summary.reasoning[0] ?? "", /technical failure/i);
});
