import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createGuideSiteMemoryStores, startGuideSiteRun, withProviderBackedUnderstandingAndComposition } from "../src/guidesite-mvp/run-lifecycle.js";
import { createGuideSiteFileRunStore } from "../src/guidesite-mvp/run-store.js";
import { createGuideSiteFileSessionStore } from "../src/guidesite-mvp/session-store.js";
import { runGuideSiteMvpTurn } from "../src/guidesite-mvp/turn.js";
import { createSanityGuideSiteRetrievalAdapter } from "../src/guidesite-mvp/sanity-retrieval.js";
import { createFakePromptUnderstandingProvider, homesicknessConcernUnderstanding } from "./guidesite-mvp/test-helpers.js";
import type { AnswerComposition, PromptUnderstanding, RunState } from "../src/guidesite-mvp/types.js";
import type { GuideSiteRetrievalAdapter } from "../src/guidesite-mvp/fixture-retrieval.js";
import { createGuideSiteLoadingPresentation, createGuideSiteStartPresentation, mapGuideSiteRunStateToPresentation, type GuideSitePresentation } from "../src/guidesite-mvp/presentation-dto.js";
import {
  DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
  createGuideSiteGuiService,
  type GuideSiteGuiActionResult,
} from "../app/operator/guide-site-gui-service.js";
import {
  createGuideSiteOperatorDemoActions,
} from "../app/operator/actions.js";
import OperatorDemoClient from "../app/operator/operator-demo-client.js";

const priorSleepawayYesReply = "Yes, with grandparents.";
const priorSleepawayNoReply = "No, not yet - she has not slept away from home.";
const childReadinessPositiveReply = "Yes, handles new routines well and asks adults for help.";
const childReadinessNeedsSupportReply = "Needs more readiness support with new routines and time away.";
const canonicalChildReadinessFreeformReply = "She handles new routines and time away from us well";
const concerningChildReadinessFreeformReply = "She is not comfortable being away from us overnight.";
const vagueChildReadinessFreeformReply = "Kind of ready, maybe.";
const unknownChildReadinessFreeformReply = "She might settle eventually.";

type GuideSiteGuiService = ReturnType<typeof createGuideSiteGuiService>;

async function submitCanonicalPrompt(service: GuideSiteGuiService, sessionId: string): Promise<GuideSiteGuiActionResult> {
  return service.submitPrompt({
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    createSessionId: () => sessionId,
  });
}

function createAnsweredRun(): RunState {
  const stores = createGuideSiteMemoryStores();
  const started = startGuideSiteRun({
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    stores,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    createSessionId: () => "session_operator_gui_boundary",
    createRunId: () => "run_operator_gui_boundary",
  }).run;

  const answerComposition: AnswerComposition = {
    status: "answered",
    conversationalFraming: "The source-backed answer is ready for the operator surface.",
    sections: [
      {
        kind: "summary",
        title: "Summary",
        body: "The answer stays product-shaped and source-backed.",
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
    citations: ["Overnight Camp Program"],
    diagnostics: ["composer_used_source_backed_sections"],
  };

  return {
    ...started,
    status: "composed",
    understanding: {
      goal: "assess_fit",
      promptType: "fit",
      fitQuestion: "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
      facts: {
        childAge: {
          value: 8,
          provenance: {
            source: "explicit",
            promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
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
      retrievalNeeds: ["overnight camp program"],
      contextNeeds: [],
    },
    promptUnderstandingProvider: {
      provider: "openai",
      model: "gpt-test",
      rawOutput: "{\"goal\":\"assess_fit\"}",
      parsedOutput: {
        goal: "assess_fit",
      },
      diagnostics: ["provider_trace_available"],
    },
    promptUnderstandingValidation: {
      valid: true,
      diagnostics: [],
    },
    retrieval: {
      adapterId: "fixture",
      adapterLabel: "Fixture",
      needs: ["overnight camp program"],
      concerns: ["homesickness"],
      results: [
        {
          sourceId: "program_overnight",
          sourceType: "campProgram",
          title: "Overnight Camp Program",
          rank: 1,
          fieldPath: "summary",
          sourceRevision: "mock_rev_program_overnight_001",
          sourceText: "The answer stays product-shaped and source-backed.",
        },
      ],
      diagnostics: [],
      coverage: {
        status: "source_backed",
        matchedSourceIds: ["program_overnight"],
      },
    },
    answerCompositionValidation: {
      valid: true,
      diagnostics: [],
    },
    answerComposition,
    diagnostics: ["run_diagnostic_note"],
  };
}

test("GuideSite GUI service starts blank and only runs prompt understanding after user input", async () => {
  const seenRuntimeModes: Array<"live" | "fixture"> = [];
  const seenPrompts: string[] = [];
  const seenSessionIds: Array<string | undefined> = [];
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      seenRuntimeModes.push("fixture");
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    async runTurn(options) {
      seenPrompts.push(options.promptText);
      seenSessionIds.push(options.sessionId);
      assert.equal(options.runtimeConfig.runtimeMode, "fixture");
      return createAnsweredRun();
    },
  });

  const startResult = await service.startDemo({ createSessionId: () => "session_gui_reload" });
  assert.deepEqual(seenRuntimeModes, []);
  assert.deepEqual(seenPrompts, []);
  assert.equal(startResult.promptText, "");
  assert.equal(startResult.presentation.answer.status, "not_started");

  seenPrompts.length = 0;
  seenSessionIds.length = 0;
  const submitResult = await service.submitPrompt({
    promptText: "  Need more context please  ",
    sessionId: "session_gui_reload",
  });
  assert.deepEqual(seenPrompts, ["Need more context please"]);
  assert.deepEqual(seenSessionIds, ["session_gui_reload"]);
  assert.equal(submitResult.promptText, "Need more context please");

  seenPrompts.length = 0;
  seenSessionIds.length = 0;
  const blankResult = await service.submitPrompt({
    promptText: "   ",
    sessionId: "session_gui_reload",
  });
  assert.deepEqual(seenPrompts, []);
  assert.deepEqual(seenSessionIds, []);
  assert.equal(blankResult.presentation.answer.status, "technical_failure");
  assert.match(blankResult.presentation.operatorDiagnostics.diagnostics[0] ?? "", /prompt text is required/);

  const technicalFailureService = createGuideSiteGuiService({
    readRuntimeConfig() {
      throw new Error("missing live config");
    },
  });

  const failureResult = await technicalFailureService.submitPrompt({
    promptText: "Can you help me plan camp?",
  });

  assert.equal(failureResult.presentation.answer.status, "technical_failure");
  assert.equal(failureResult.presentation.answer.title, "Technical failure");
  assert.match(failureResult.presentation.answer.message, /failed before a product answer could be rendered/);
  assert.deepEqual(failureResult.presentation.operatorDiagnostics.diagnostics, ["missing live config"]);
});

test("GuideSite GUI service defaults demo retrieval to live Sanity config without fixture fallback", async () => {
  const seenRetrievalModes: string[] = [];
  const service = createGuideSiteGuiService({
    async runTurn(options) {
      assert.equal(options.runtimeConfig.runtimeMode, "live");
      assert.equal(options.runtimeConfig.retrievalMode, "sanity");
      assert.deepEqual(options.runtimeConfig.sanityQueryConfig, {
        projectId: "project-123",
        dataset: "production",
        apiVersion: "2025-02-19",
        readToken: "read-token",
      });
      assert.deepEqual(options.runtimeConfig.promptUnderstandingConfig, {
        apiKey: "openai-key",
        model: "gpt-test",
      });
      seenRetrievalModes.push(options.runtimeConfig.retrievalMode);
      return createAnsweredRun();
    },
  });

  const result = await service.submitPrompt({
    promptText: "Is overnight camp right for my 8-year-old?",
    env: {
      SANITY_PROJECT_ID: "project-123",
      SANITY_DATASET: "production",
      SANITY_API_VERSION: "2025-02-19",
      SANITY_READ_TOKEN: "read-token",
      OPENAI_API_KEY: "openai-key",
      OPENAI_PROMPT_UNDERSTANDING_MODEL: "gpt-test",
    },
    envFilePath: ".guidesite-gui-runtime-test.env",
  });

  assert.deepEqual(seenRetrievalModes, ["sanity"]);
  assert.equal(result.presentation.answer.status, "assembled_answer");
});

async function createHomesicknessPresentationFromSanitySourceText(sourceTextMarker: string): Promise<GuideSitePresentation> {
  const stores = createGuideSiteMemoryStores();
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "live",
        retrievalMode: "sanity",
        sanityQueryConfig: {
          projectId: "project-123",
          dataset: "production",
          apiVersion: "2025-02-19",
          readToken: "read-token",
        },
        promptUnderstandingConfig: {
          apiKey: "openai-key",
          model: "gpt-test",
        },
      };
    },
    async runTurn(options) {
      assert.equal(options.runtimeConfig.retrievalMode, "sanity");
      return runGuideSiteMvpTurn({
        promptText: options.promptText,
        stores,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        createSessionId: () => `session_${sourceTextMarker.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        createRunId: () => `run_${sourceTextMarker.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
        promptUnderstandingProvider: createFakePromptUnderstandingProvider(homesicknessConcernUnderstanding),
        retrievalAdapter: createSanityGuideSiteRetrievalAdapter(() => [
          {
            _id: "concern_homesickness",
            _type: "concern",
            _rev: "mock_rev_concern_homesickness_dynamic",
            sourceKind: "sourceOfTruth",
            title: "Homesickness and Child Readiness",
            summary: `${sourceTextMarker}: editors say staff name homesickness and normalize the feeling.`,
          },
          {
            _id: "policy_homesickness",
            _type: "policy",
            _rev: "mock_rev_policy_homesickness_dynamic",
            sourceKind: "sourceOfTruth",
            title: "Homesickness Support Policy",
            summary: `${sourceTextMarker}: cabin staff use a calm bedtime check-in script before lights-out.`,
          },
          {
            _id: "policy_parent_communication",
            _type: "policy",
            _rev: "mock_rev_policy_parent_communication_dynamic",
            sourceKind: "sourceOfTruth",
            title: "Parent Communication Policy",
            summary: `${sourceTextMarker}: parents hear from camp if adjustment support needs family context.`,
          },
        ]),
      });
    },
  });

  return (await service.submitPrompt({ promptText: "What happens if my child gets homesick?" })).presentation;
}

test("GuideSite GUI service presents retained Sanity source text without leaking source internals", async () => {
  const firstPresentation = await createHomesicknessPresentationFromSanitySourceText("Blue jay source wording");
  const secondPresentation = await createHomesicknessPresentationFromSanitySourceText("Cedar lake source wording");

  assert.equal(firstPresentation.answer.status, "assembled_answer");
  assert.equal(secondPresentation.answer.status, "assembled_answer");
  if (firstPresentation.answer.status !== "assembled_answer" || secondPresentation.answer.status !== "assembled_answer") {
    assert.fail("Expected assembled answers from fake Sanity source material");
  }

  const firstAnswerJson = JSON.stringify(firstPresentation.answer);
  const secondAnswerJson = JSON.stringify(secondPresentation.answer);

  assert.match(firstAnswerJson, /Blue jay source wording: cabin staff use a calm bedtime check-in script/);
  assert.doesNotMatch(firstAnswerJson, /Cedar lake source wording/);
  assert.match(secondAnswerJson, /Cedar lake source wording: cabin staff use a calm bedtime check-in script/);
  assert.doesNotMatch(secondAnswerJson, /Blue jay source wording/);
  assert.deepEqual(firstPresentation.answer.citations, [
    { label: "Homesickness and Child Readiness" },
    { label: "Homesickness Support Policy" },
    { label: "Parent Communication Policy" },
  ]);
  assert.doesNotMatch(firstAnswerJson, /policy_homesickness|mock_rev_|fieldPath|sourceRevision|sourceId|providerRawOutput/);
});

test("GuideSite GUI service reports missing live config loudly and does not run fixture retrieval", async () => {
  let runTurnCalled = false;
  const service = createGuideSiteGuiService({
    async runTurn() {
      runTurnCalled = true;
      return createAnsweredRun();
    },
  });

  const result = await service.submitPrompt({
    promptText: "Is overnight camp right for my 8-year-old?",
    env: {},
    envFilePath: ".guidesite-gui-runtime-test.env",
  });

  assert.equal(runTurnCalled, false);
  assert.equal(result.presentation.answer.status, "technical_failure");
  assert.match(result.presentation.operatorDiagnostics.diagnostics[0] ?? "", /Missing required Sanity config/);
  assert.match(result.presentation.operatorDiagnostics.diagnostics[0] ?? "", /SANITY_PROJECT_ID/);
  assert.doesNotMatch(result.presentation.operatorDiagnostics.diagnostics[0] ?? "", /fixture/i);
});

test("GuideSite GUI fixture mode keeps vague required-context replies in the context-gathering loop", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });

  const started = await submitCanonicalPrompt(service, "session_gui_required_context");
  assert.equal(started.presentation.answer.status, "context_gathering_response");
  assert.deepEqual(started.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
  ]);

  const vagueReply = await service.submitPrompt({
    promptText: "I don't know, maybe sometimes.",
    sessionId: "session_gui_required_context",
  });

  assert.equal(vagueReply.presentation.answer.status, "context_gathering_response");
  assert.match(vagueReply.presentation.answer.conversationalFraming, /more Visitor Context/i);
  assert.equal(vagueReply.presentation.answer.requiredQuestions.length > 0, true);
  assert.notEqual(vagueReply.presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.notEqual(vagueReply.presentation.operatorDiagnostics.runStatus, "technical_failure");
  assert.deepEqual(vagueReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    "I don't know, maybe sometimes.",
  ]);
  assert.ok(vagueReply.presentation.journeyTimeline.visitorContext.some((fact) => fact.key === "child_age"));
});

test("GuideSite GUI fixture mode records controlled replies through the Prompt path", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });

  const started = await submitCanonicalPrompt(service, "session_gui_controlled_context");
  assert.equal(started.presentation.answer.status, "context_gathering_response");
  if (started.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected the canonical prompt to gather required Visitor Context first");
  }

  assert.deepEqual(started.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_prior_sleepaway_experience",
  ]);
  const sleepawayQuestion = started.presentation.answer.requiredQuestions[0];
  assert.ok(sleepawayQuestion);
  assert.deepEqual(sleepawayQuestion.controlledReplies.map((reply) => reply.text), [
    priorSleepawayYesReply,
    priorSleepawayNoReply,
  ]);
  assert.notDeepEqual(sleepawayQuestion.controlledReplies.map((reply) => reply.text), [sleepawayQuestion.text]);

  const sleepawayReply = await service.submitPrompt({
    promptText: priorSleepawayYesReply,
    sessionId: "session_gui_controlled_context",
  });

  assert.equal(sleepawayReply.presentation.answer.status, "context_gathering_response");
  assert.deepEqual(sleepawayReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    priorSleepawayYesReply,
  ]);
  assert.deepEqual(
    sleepawayReply.presentation.journeyTimeline.visitorContext.find(
      (fact) => fact.key === "prior_sleepaway_experience",
    ),
    {
      key: "prior_sleepaway_experience",
      label: "Prior Sleepaway Experience",
      value: "slept_with_grandparents",
      source: "explicit",
    },
  );
  if (sleepawayReply.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected Child Readiness to remain required after the sleepaway reply");
  }
  assert.deepEqual(sleepawayReply.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_child_readiness",
  ]);
  const readinessQuestion = sleepawayReply.presentation.answer.requiredQuestions[0];
  assert.ok(readinessQuestion);
  assert.deepEqual(readinessQuestion.controlledReplies.map((reply) => reply.text), [
    childReadinessPositiveReply,
    childReadinessNeedsSupportReply,
  ]);
  assert.notDeepEqual(readinessQuestion.controlledReplies.map((reply) => reply.text), [readinessQuestion.text]);


  const readinessReply = await service.submitPrompt({
    promptText: childReadinessPositiveReply,
    sessionId: "session_gui_controlled_context",
  });

  assert.equal(readinessReply.presentation.answer.status, "assembled_answer");
  assert.deepEqual(readinessReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    priorSleepawayYesReply,
    childReadinessPositiveReply,
  ]);
  assert.deepEqual(
    readinessReply.presentation.journeyTimeline.visitorContext.find((fact) => fact.key === "child_readiness"),
    {
      key: "child_readiness",
      label: "Child Readiness",
      value: "handles_new_routines_well",
      source: "explicit",
    },
  );
});

test("GuideSite GUI fixture mode records no-prior-sleepaway controlled replies", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });

  const started = await submitCanonicalPrompt(service, "session_gui_no_sleepaway_context");
  assert.equal(started.presentation.answer.status, "context_gathering_response");

  const sleepawayReply = await service.submitPrompt({
    promptText: priorSleepawayNoReply,
    sessionId: "session_gui_no_sleepaway_context",
  });

  assert.equal(sleepawayReply.presentation.answer.status, "context_gathering_response");
  assert.deepEqual(sleepawayReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    priorSleepawayNoReply,
  ]);
  assert.deepEqual(
    sleepawayReply.presentation.journeyTimeline.visitorContext.find(
      (fact) => fact.key === "prior_sleepaway_experience",
    ),
    {
      key: "prior_sleepaway_experience",
      label: "Prior Sleepaway Experience",
      value: "no_prior_sleepaway_experience",
      source: "explicit",
    },
  );
  assert.match(sleepawayReply.presentation.journeyTimeline.sessionSummary ?? "", /has not slept away from home/i);
});

test("GuideSite GUI fixture mode renders withheld or skipped required-context replies as responsible abstention", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });
  const withheldReplies = [
    {
      sessionId: "session_gui_withheld_context",
      promptText: "I'd prefer not to say.",
    },
    {
      sessionId: "session_gui_skipped_context",
      promptText: "skip",
    },
  ];

  for (const withheldContextReply of withheldReplies) {
    const started = await submitCanonicalPrompt(service, withheldContextReply.sessionId);
    assert.equal(started.presentation.answer.status, "context_gathering_response");

    const withheldReply = await service.submitPrompt({
      promptText: withheldContextReply.promptText,
      sessionId: withheldContextReply.sessionId,
    });

    assert.equal(withheldReply.presentation.answer.status, "responsible_abstention");
    assert.match(withheldReply.presentation.answer.conversationalFraming, /cannot responsibly answer/i);
    assert.match(withheldReply.presentation.answer.nextSteps[0] ?? "", /Provide more context/i);
    assert.notEqual(withheldReply.presentation.operatorDiagnostics.runStatus, "validation_failed");
    assert.notEqual(withheldReply.presentation.operatorDiagnostics.runStatus, "technical_failure");
    assert.doesNotMatch(JSON.stringify(withheldReply.presentation.answer), /prompt_understanding_/);
  }
});

test("GuideSite GUI fixture mode assembles the canonical Fit answer after required context", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });

  const started = await submitCanonicalPrompt(service, "session_gui_completed_required_context");
  assert.equal(started.presentation.answer.status, "context_gathering_response");
  if (started.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected the canonical prompt to gather required Visitor Context first");
  }
  assert.deepEqual(started.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_prior_sleepaway_experience",
  ]);

  const sleepawayReply = await service.submitPrompt({
    promptText: "She slept away at her grandparents last summer.",
    sessionId: "session_gui_completed_required_context",
  });

  assert.equal(sleepawayReply.presentation.answer.status, "context_gathering_response");
  if (sleepawayReply.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected one answered required question to leave the remaining question");
  }
  assert.deepEqual(sleepawayReply.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_child_readiness",
  ]);

  const readinessReply = await service.submitPrompt({
    promptText: canonicalChildReadinessFreeformReply,
    sessionId: "session_gui_completed_required_context",
  });

  assert.equal(readinessReply.presentation.answer.status, "assembled_answer");
  if (readinessReply.presentation.answer.status !== "assembled_answer") {
    assert.fail("Expected completed required Visitor Context to produce an assembled Fit answer");
  }
  assert.equal("requiredQuestions" in readinessReply.presentation.answer, false);
  assert.equal(readinessReply.presentation.answer.completeness, "complete");
  const answerJson = JSON.stringify(readinessReply.presentation.answer);
  assert.match(answerJson, /residential camp experience with cabin life/i);
  assert.match(answerJson, /prior sleepaway experience, separation confidence/i);
  assert.match(answerJson, /Cabin staff watch for homesickness/i);
  assert.deepEqual(readinessReply.presentation.answer.citations, [
    { label: "Overnight Camp Program" },
    { label: "Homesickness and Child Readiness" },
    { label: "Homesickness Support Policy" },
    { label: "Parent Communication Policy" },
  ]);
  assert.doesNotMatch(answerJson, /program_overnight|mock_rev_|fieldPath|sourceRevision|sourceId|providerRawOutput/);
  assert.match(JSON.stringify(readinessReply.presentation.operatorInspection), /program_overnight/);
  assert.deepEqual(
    readinessReply.presentation.journeyTimeline.visitorContext.map((fact) => fact.key).sort(),
    ["child_age", "child_readiness", "prior_sleepaway_experience"],
  );
  assert.deepEqual(readinessReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    "She slept away at her grandparents last summer.",
    canonicalChildReadinessFreeformReply,
  ]);
  assert.deepEqual(
    readinessReply.presentation.journeyTimeline.visitorContext.find((fact) => fact.key === "child_readiness"),
    {
      key: "child_readiness",
      label: "Child Readiness",
      value: "handles_new_routines_well",
      source: "explicit",
    },
  );
  assert.deepEqual(readinessReply.presentation.operatorInspection.promptUnderstanding.summary.contextNeeds, []);
});

test("GuideSite GUI fixture mode distinguishes specific Child Readiness replies from vague ones", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });
  const concerningSessionId = "session_gui_concerning_child_readiness";

  await submitCanonicalPrompt(service, concerningSessionId);
  await service.submitPrompt({
    promptText: priorSleepawayYesReply,
    sessionId: concerningSessionId,
  });
  const concerningReply = await service.submitPrompt({
    promptText: concerningChildReadinessFreeformReply,
    sessionId: concerningSessionId,
  });

  assert.equal(concerningReply.presentation.answer.status, "assembled_answer");
  assert.deepEqual(concerningReply.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    priorSleepawayYesReply,
    concerningChildReadinessFreeformReply,
  ]);
  assert.deepEqual(
    concerningReply.presentation.journeyTimeline.visitorContext.find((fact) => fact.key === "child_readiness"),
    {
      key: "child_readiness",
      label: "Child Readiness",
      value: "needs_more_readiness_support",
      source: "explicit",
    },
  );
  assert.deepEqual(concerningReply.presentation.operatorInspection.promptUnderstanding.summary.contextNeeds, []);

  const vagueSessionId = "session_gui_vague_child_readiness";
  await submitCanonicalPrompt(service, vagueSessionId);
  await service.submitPrompt({
    promptText: priorSleepawayYesReply,
    sessionId: vagueSessionId,
  });
  const vagueReply = await service.submitPrompt({
    promptText: vagueChildReadinessFreeformReply,
    sessionId: vagueSessionId,
  });

  assert.equal(vagueReply.presentation.answer.status, "context_gathering_response");
  if (vagueReply.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected vague Child Readiness to keep asking for the remaining required context");
  }
  assert.deepEqual(vagueReply.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_child_readiness",
  ]);
  assert.equal(
    vagueReply.presentation.journeyTimeline.visitorContext.some((fact) => fact.key === "child_readiness"),
    false,
  );
  assert.ok(vagueReply.presentation.operatorInspection.promptUnderstanding.summary.contextNeeds.includes("child_readiness"));

  const unknownSessionId = "session_gui_unknown_child_readiness";
  await submitCanonicalPrompt(service, unknownSessionId);
  await service.submitPrompt({
    promptText: priorSleepawayYesReply,
    sessionId: unknownSessionId,
  });
  const unknownReply = await service.submitPrompt({
    promptText: unknownChildReadinessFreeformReply,
    sessionId: unknownSessionId,
  });

  assert.equal(unknownReply.presentation.answer.status, "context_gathering_response");
  if (unknownReply.presentation.answer.status !== "context_gathering_response") {
    assert.fail("Expected unknown Child Readiness wording to keep asking for the remaining required context");
  }
  assert.deepEqual(unknownReply.presentation.answer.requiredQuestions.map((question) => question.id), [
    "prompt_child_readiness",
  ]);
  assert.equal(
    unknownReply.presentation.journeyTimeline.visitorContext.some((fact) => fact.key === "child_readiness"),
    false,
  );
  assert.notEqual(unknownReply.presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.notEqual(unknownReply.presentation.operatorDiagnostics.runStatus, "technical_failure");
  assert.equal(unknownReply.presentation.operatorInspection.validation.summary.promptUnderstandingValid, false);
  assert.match(
    JSON.stringify(unknownReply.presentation.operatorInspection.validation.details.promptUnderstanding),
    /prompt_understanding_goal_required/,
  );
  assert.ok(unknownReply.presentation.operatorInspection.promptUnderstanding.summary.contextNeeds.includes("child_readiness"));
  assert.doesNotMatch(JSON.stringify(unknownReply.presentation.answer), /prompt_understanding_/);
});

test("GuideSite GUI service restores latest existing demo session without rerunning the canonical Prompt", async () => {
  const stores = createGuideSiteMemoryStores();
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => stores,
  });
  const sessionId = "session_gui_restore_existing";

  const started = await submitCanonicalPrompt(service, sessionId);
  assert.equal(started.presentation.answer.status, "context_gathering_response");

  const sleepawayReply = await service.submitPrompt({
    promptText: priorSleepawayYesReply,
    sessionId,
  });
  assert.equal(sleepawayReply.presentation.answer.status, "context_gathering_response");

  const readinessReply = await service.submitPrompt({
    promptText: childReadinessPositiveReply,
    sessionId,
  });
  assert.equal(readinessReply.presentation.answer.status, "assembled_answer");

  const restored = await service.restoreDemo({ sessionId });

  assert.equal(restored.promptText, childReadinessPositiveReply);
  assert.equal(restored.presentation.answer.status, "assembled_answer");
  assert.equal(restored.presentation.operatorDiagnostics.sessionId, sessionId);
  assert.deepEqual(restored.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), [
    DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    priorSleepawayYesReply,
    childReadinessPositiveReply,
  ]);

  const newDemo = await service.startDemo({
    createSessionId: () => "session_gui_restore_new_demo",
    createRunId: () => "run_gui_restore_new_demo",
  });

  assert.equal(newDemo.promptText, "");
  assert.equal(newDemo.presentation.answer.status, "not_started");
  assert.equal(newDemo.presentation.operatorDiagnostics.sessionId, null);
  assert.deepEqual(newDemo.presentation.journeyTimeline.prompts.map((prompt) => prompt.text), []);
});

test("GuideSite GUI service persists file-backed Run State across fresh service instances", async () => {
  const sessionStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-gui-sessions-"));
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-gui-runs-"));
  const createStores = () =>
    createGuideSiteMemoryStores({
      sessions: createGuideSiteFileSessionStore(sessionStateDirectory),
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
  const readRuntimeConfig = () => ({
    runtimeMode: "fixture" as const,
    retrievalMode: "fixture" as const,
  });
  const sessionId = "session_gui_file_restore";

  try {
    const writer = createGuideSiteGuiService({
      readRuntimeConfig,
      createStores,
    });

    await writer.submitPrompt({
      promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
      createSessionId: () => sessionId,
      createRunId: () => "run_gui_file_start",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await writer.submitPrompt({
      promptText: priorSleepawayYesReply,
      sessionId,
      createRunId: () => "run_gui_file_sleepaway",
      now: () => new Date("2026-01-01T00:01:00.000Z"),
    });
    const readinessResult = await writer.submitPrompt({
      promptText: childReadinessPositiveReply,
      sessionId,
      createRunId: () => "run_gui_file_readiness",
      now: () => new Date("2026-01-01T00:02:00.000Z"),
    });

    assert.equal(readinessResult.presentation.answer.status, "assembled_answer");

    const restoredService = createGuideSiteGuiService({
      readRuntimeConfig,
      createStores,
    });
    const restored = await restoredService.restoreDemo({ sessionId });

    assert.equal(restored.promptText, childReadinessPositiveReply);
    assert.equal(restored.presentation.answer.status, "assembled_answer");
    assert.equal(restored.presentation.operatorDiagnostics.sessionId, sessionId);
    assert.equal(restored.presentation.operatorDiagnostics.runId, "run_gui_file_readiness");
    assert.equal(restored.presentation.operatorDiagnostics.runStatus, "committed");

    const freshStores = createStores();
    const reloadedRun = freshStores.runs.read("run_gui_file_readiness");

    assert.ok(reloadedRun);
    assert.equal(reloadedRun.status, "committed");
    assert.equal(reloadedRun.prompt.text, childReadinessPositiveReply);
    assert.equal(reloadedRun.createdAt, "2026-01-01T00:02:00.000Z");
    assert.equal(reloadedRun.updatedAt, "2026-01-01T00:02:00.000Z");
    assert.equal(reloadedRun.promptUnderstandingProvider?.provider, "fake");
    assert.equal(reloadedRun.promptUnderstandingValidation?.valid, true);
    assert.equal(reloadedRun.retrieval?.coverage.status, "source_backed");
    assert.equal(reloadedRun.answerCompositionValidation?.valid, true);
    assert.equal(reloadedRun.answerComposition?.status, "answered");
    assert.ok(reloadedRun.patch);
    assert.ok(reloadedRun.committedSessionState);
    assert.equal(reloadedRun.committedSessionState.revision, 4);
    assert.deepEqual(reloadedRun.diagnostics, []);

    const savedRun = JSON.parse(
      readFileSync(join(runStateDirectory, "run_gui_file_readiness.json"), "utf8"),
    ) as RunState;
    assert.equal(savedRun.status, "committed");
    assert.equal(savedRun.prompt.text, childReadinessPositiveReply);
    assert.equal(savedRun.retrieval?.coverage.status, "source_backed");
    assert.equal(savedRun.answerComposition?.status, "answered");
  } finally {
    rmSync(sessionStateDirectory, { recursive: true, force: true });
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite GUI service persists non-committed product-safe Run State for inspection", async () => {
  const sessionStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-gui-sessions-"));
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-gui-runs-"));
  const createStores = () =>
    createGuideSiteMemoryStores({
      sessions: createGuideSiteFileSessionStore(sessionStateDirectory),
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
  const readRuntimeConfig = () => ({
    runtimeMode: "fixture" as const,
    retrievalMode: "fixture" as const,
  });
  const sessionId = "session_gui_file_uncertainty";
  const uncertainRunId = "run_gui_file_uncertain_child_readiness";

  try {
    const writer = createGuideSiteGuiService({
      readRuntimeConfig,
      createStores,
    });

    await writer.submitPrompt({
      promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
      createSessionId: () => sessionId,
      createRunId: () => "run_gui_file_uncertainty_start",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    });
    await writer.submitPrompt({
      promptText: priorSleepawayYesReply,
      sessionId,
      createRunId: () => "run_gui_file_uncertainty_sleepaway",
      now: () => new Date("2026-01-01T00:01:00.000Z"),
    });
    const uncertainResult = await writer.submitPrompt({
      promptText: unknownChildReadinessFreeformReply,
      sessionId,
      createRunId: () => uncertainRunId,
      now: () => new Date("2026-01-01T00:02:00.000Z"),
    });

    assert.equal(uncertainResult.presentation.answer.status, "context_gathering_response");

    const freshStores = createStores();
    const reloadedRun = freshStores.runs.read(uncertainRunId);

    assert.ok(reloadedRun);
    assert.equal(reloadedRun.status, "composed");
    assert.equal(reloadedRun.prompt.text, unknownChildReadinessFreeformReply);
    assert.equal(reloadedRun.createdAt, "2026-01-01T00:02:00.000Z");
    assert.equal(reloadedRun.updatedAt, "2026-01-01T00:02:00.000Z");
    assert.equal(reloadedRun.promptUnderstandingProvider?.provider, "fake");
    assert.equal(reloadedRun.promptUnderstandingValidation?.valid, false);
    assert.deepEqual(reloadedRun.retrieval, null);
    assert.equal(reloadedRun.answerCompositionValidation?.valid, true);
    assert.equal(reloadedRun.answerComposition?.status, "needs_context");
    assert.equal(reloadedRun.patch, null);
    assert.equal(reloadedRun.committedSessionState, null);
    assert.match(reloadedRun.diagnostics.join(" "), /prompt_understanding_goal_required/);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, `${uncertainRunId}.json`), "utf8")) as RunState;
    assert.equal(savedRun.status, "composed");
    assert.equal(savedRun.answerComposition?.status, "needs_context");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(sessionStateDirectory, { recursive: true, force: true });
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});


test("GuideSite GUI service abstains when completed canonical Fit context lacks source coverage", async () => {
  const stores = createGuideSiteMemoryStores();
  const promptText = "Both required facts are present for my 8-year-old.";
  const completedContextUnderstanding = {
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
      prior_sleepaway_experience: {
        value: "slept_with_grandparents",
        provenance: {
          source: "explicit",
          promptText,
        },
      },
      child_readiness: {
        value: "handles_new_routines_well",
        provenance: {
          source: "explicit",
          promptText,
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
    contextNeeds: [],
  } satisfies PromptUnderstanding;
  const partialFitRetrievalAdapter = {
    id: "partial-fit",
    label: "Partial Fit Sources",
    retrieve(input) {
      return {
        adapterId: "partial-fit",
        adapterLabel: "Partial Fit Sources",
        needs: [...input.retrievalNeeds],
        concerns: input.concerns.map((concern) => concern.key),
        results: [
          {
            sourceId: "program_overnight",
            sourceType: "campProgram",
            title: "Overnight Camp Program",
            rank: 1,
            fieldPath: "summary",
            sourceRevision: "mock_rev_program_overnight_001",
            sourceText: "The overnight Camp Program gives children a residential camp experience.",
          },
        ],
        diagnostics: ["missing_canonical_fit_sources"],
        coverage: {
          status: "source_backed",
          matchedSourceIds: ["program_overnight"],
        },
      };
    },
  } satisfies GuideSiteRetrievalAdapter;
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    async runTurn(options) {
      const started = startGuideSiteRun({
        promptText: options.promptText,
        stores,
        sessionId: options.sessionId,
        now: () => new Date("2026-01-01T00:00:00.000Z"),
        createSessionId: () => "session_completed_context_partial_sources",
        createRunId: () => "run_completed_context_partial_sources",
      });
      return withProviderBackedUnderstandingAndComposition(
        started.run,
        createFakePromptUnderstandingProvider(completedContextUnderstanding),
        {
          now: () => new Date("2026-01-01T00:00:00.000Z"),
          retrievalAdapter: partialFitRetrievalAdapter,
        },
      );
    },
  });

  const result = await service.submitPrompt({
    promptText,
    sessionId: "session_completed_context_partial_sources",
  });

  assert.equal(result.presentation.answer.status, "responsible_abstention");
  assert.match(result.presentation.answer.conversationalFraming, /cannot responsibly answer/i);
  assert.notEqual(result.presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.notEqual(result.presentation.operatorDiagnostics.runStatus, "technical_failure");
  assert.match(JSON.stringify(result.presentation.operatorInspection), /canonical_fit_answer_missing_source_material/);
});



test("Operator demo actions adapt form submissions into service calls", async () => {
  const seenPromptTexts: string[] = [];
  const seenSessionIds: Array<string | undefined> = [];
  const seenStartSessionIds: Array<string | undefined> = [];
  const actions = createGuideSiteOperatorDemoActions({
    service: {
      startDemo: async (options?: unknown) => {
        const startOptions = options && typeof options === "object" ? (options as { sessionId?: string }) : undefined;
        seenStartSessionIds.push(startOptions?.sessionId);
        return {
          promptText: "",
          presentation: createGuideSiteStartPresentation(),
        };
      },
      submitPrompt: async ({ promptText, sessionId }: { promptText: string; sessionId?: string }) => {
        seenPromptTexts.push(promptText);
        seenSessionIds.push(sessionId);
        return {
          promptText,
          presentation: createGuideSiteLoadingPresentation(),
        };
      },
    },
  });

  const startFormData = new FormData();
  startFormData.append("sessionId", "session_operator_gui_existing");
  const started = await actions.startGuideSiteOperatorDemoAction(startFormData);
  const submittedFormData = new FormData();
  submittedFormData.append("promptText", "  Is overnight camp right for my 8-year-old?  ");
  submittedFormData.append("sessionId", "session_operator_gui_boundary");
  const submitted = await actions.submitGuideSiteOperatorPromptAction(submittedFormData);

  assert.equal(started.promptText, "");
  assert.deepEqual(seenStartSessionIds, [undefined]);
  assert.deepEqual(seenPromptTexts, ["  Is overnight camp right for my 8-year-old?  "]);
  assert.deepEqual(seenSessionIds, ["session_operator_gui_boundary"]);
  assert.equal(submitted.promptText, "  Is overnight camp right for my 8-year-old?  ");
});

test("operator demo client renders assembled answers as text-first sections with inline citations", () => {
  const result: GuideSiteGuiActionResult = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation: {
      camp: {
        campId: "ultimate-camp-website",
        campName: "Ultimate Camp Website",
        answerAccent: "amber",
        surfaceTone: "warm-sand",
        operatorChrome: "slate",
      },
      answer: {
        status: "assembled_answer",
        completeness: "complete",
        conversationalFraming: "The approved source material explains how overnight camp supports the Child.",
        sections: [
          {
            title: "Summary",
            body: "The camp offers overnight programming for age-appropriate campers.",
            citations: [
              {
                label: "Overnight Camp Program",
              },
            ],
          },
          {
            title: "Concerns",
            body: "The homesickness policy outlines the support path.",
            citations: [
              {
                label: "Homesickness Support Policy",
              },
            ],
          },
        ],
        citations: [
          {
            label: "Overnight Camp Program",
          },
          {
            label: "Homesickness Support Policy",
          },
        ],
      },
      operatorDiagnostics: {
        runId: "run_operator_gui_boundary",
        sessionId: "session_operator_gui_boundary",
        runStatus: "composed",
        provider: "openai",
        model: "gpt-test",
        diagnostics: [],
      },
      journeyTimeline: createGuideSiteLoadingPresentation().journeyTimeline,
      operatorInspection: createGuideSiteLoadingPresentation().operatorInspection,
    },
  };

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );

  assert.match(markup, /Answer ready/);
  assert.match(markup, /Review the recommendation\./);
  assert.ok(markup.indexOf("Summary") < markup.indexOf("Overnight Camp Program"));
  assert.ok(markup.indexOf("Overnight Camp Program") < markup.indexOf("The camp offers overnight programming for age-appropriate campers."));
  assert.doesNotMatch(markup, /campProgram/);
  assert.doesNotMatch(markup, /summary · mock_rev_program_overnight_001/);
  assert.ok(markup.indexOf("Concerns") < markup.indexOf("Homesickness Support Policy"));
  assert.ok(markup.indexOf("Homesickness Support Policy") < markup.indexOf("The homesickness policy outlines the support path."));
  assert.doesNotMatch(markup, /Contact Path/);
});

test("operator demo client renders progress as secondary non-replay context", () => {
  const presentation = mapGuideSiteRunStateToPresentation(createAnsweredRun());
  const result: GuideSiteGuiActionResult = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation,
  };

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );

  const answerIndex = markup.indexOf("Parent question");
  const progressIndex = markup.indexOf("What we know");
  const debugIndex = markup.indexOf("Run details");

  assert.ok(answerIndex >= 0);
  assert.ok(progressIndex > answerIndex);
  assert.ok(debugIndex > progressIndex);
  assert.match(markup, /Progress/);
  assert.match(markup, /Show history/);
  assert.match(markup, /Prompts/);
  assert.match(markup, /Child Age/);
  assert.match(markup, /Known details/);
  assert.doesNotMatch(markup, /replay prior turn|answer history|chat transcript/i);
});

test("operator inspection drawer renders summaries first with raw structured output one level deeper", () => {
  const presentation = mapGuideSiteRunStateToPresentation(createAnsweredRun());
  const result: GuideSiteGuiActionResult = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation,
  };

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );

  assert.match(markup, /<details class="group">/);
  assert.match(markup, /Run details/);
  assert.match(markup, /Prompt understanding/);
  assert.match(markup, /Retrieval\/source coverage/);
  assert.match(markup, /Validation\/product-state reasoning/);
  assert.match(markup, /Diagnostics/);
  assert.match(markup, /Raw structured output/);
  assert.ok(markup.indexOf("Prompt understanding") < markup.indexOf("Raw structured output"));
  assert.ok(markup.indexOf("Retrieval/source coverage") < markup.indexOf("Raw structured output"));
  assert.ok(markup.indexOf("Validation/product-state reasoning") < markup.indexOf("Raw structured output"));
  assert.match(markup, /&quot;providerRawOutput&quot;: &quot;{\\&quot;goal\\&quot;:\\&quot;assess_fit\\&quot;}&quot;/);
  assert.match(markup, /hasProviderRawOutput/);
});

test("operator source inspection links to separate Sanity admin without entering the answer surface", () => {
  const presentation = mapGuideSiteRunStateToPresentation(createAnsweredRun());
  const result: GuideSiteGuiActionResult = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation,
  };

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );
  const answerSurfaceIndex = markup.indexOf("Parent question");
  const inspectionIndex = markup.indexOf("Run details");

  assert.match(markup, /Admin/);
  assert.match(markup, /href="\/admin"/);
  assert.match(markup, /Inspect source in Sanity admin/);
  assert.match(markup, /href="\/admin\/intent\/edit\?id=program_overnight&amp;type=campProgram&amp;path=summary"/);
  assert.ok(answerSurfaceIndex >= 0);
  assert.ok(inspectionIndex > answerSurfaceIndex);
  assert.doesNotMatch(markup.slice(answerSurfaceIndex, inspectionIndex), /Inspect source in Sanity admin|\/admin\/intent\/edit/);
  assert.doesNotMatch(markup, /<iframe/i);
  assert.doesNotMatch(markup, /NextStudio/);
});

test("operator client keeps provider metadata out of the answer surface", () => {
  const presentation = mapGuideSiteRunStateToPresentation(createAnsweredRun());
  const result: GuideSiteGuiActionResult = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation,
  };

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );

  const answerSurfaceIndex = markup.indexOf("Parent question");
  const inspectionIndex = markup.indexOf("Run details");
  const providerIndex = markup.indexOf("gpt-test");

  assert.ok(answerSurfaceIndex >= 0);
  assert.ok(inspectionIndex > answerSurfaceIndex);
  assert.ok(providerIndex > inspectionIndex);
  assert.doesNotMatch(markup.slice(answerSurfaceIndex, inspectionIndex), /gpt-test|openai|providerRawOutput/);
});

test("operator demo client renders every allowed presentation state distinctly", () => {
  const basePresentation: Pick<GuideSitePresentation, "camp" | "operatorDiagnostics" | "operatorInspection" | "journeyTimeline"> = {
    camp: {
      campId: "ultimate-camp-website",
      campName: "Ultimate Camp Website",
      answerAccent: "amber",
      surfaceTone: "warm-sand",
      operatorChrome: "slate",
    },
    operatorDiagnostics: {
      runId: "run_operator_gui_boundary",
      sessionId: "session_operator_gui_boundary",
      runStatus: "composed",
      provider: null,
      model: null,
      diagnostics: [],
    },
    operatorInspection: createGuideSiteLoadingPresentation().operatorInspection,
    journeyTimeline: createGuideSiteLoadingPresentation().journeyTimeline,
  };

  const cases: Array<{
    label: string;
    result: GuideSiteGuiActionResult;
    expectations: RegExp[];
  }> = [
    {
      label: "not started",
      result: {
        promptText: "",
        presentation: createGuideSiteStartPresentation(),
      },
      expectations: [/Ask a parent question\./, /First parent question/, /Understand prompt/],
    },
    {
      label: "loading",
      result: {
        promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
        presentation: {
          ...basePresentation,
          answer: {
            status: "loading",
            headline: "Ultimate Camp Website answer presentation",
            message: "Loading the operator demo surface.",
          },
        },
      },
      expectations: [/Loading/, /Loading the operator demo surface/],
    },
    {
      label: "context gathering response",
      result: {
        promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
        presentation: {
          ...basePresentation,
          answer: {
            status: "context_gathering_response",
            conversationalFraming: "The GuideSite needs more Visitor Context before it can honestly answer.",
            requiredQuestions: [
              {
                id: "prompt_prior_sleepaway_experience",
                text: "Has your child slept away from home before?",
                rationale: "The next turn should gather the minimum required context before the answer can continue.",
                controlledReplies: [
                  {
                    id: "prompt_prior_sleepaway_experience_yes_grandparents",
                    text: priorSleepawayYesReply,
                    purpose: "gather_fit_context",
                  },
                  {
                    id: "prompt_prior_sleepaway_experience_no_not_yet",
                    text: priorSleepawayNoReply,
                    purpose: "gather_fit_context",
                  },
                ],
              },
            ],
            suggestedPrompts: [
              {
                id: "prompt_child_readiness",
                text: "How does your child handle new routines away from home?",
                purpose: "gather_fit_context",
              },
            ],
          },
        },
      },
      expectations: [/Question to ask/, /Has your child slept away from home before\?/, /Type a custom reply/, /Other possible follow-ups/],
    },
    {
      label: "responsible abstention",
      result: {
        promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
        presentation: {
          ...basePresentation,
          answer: {
            status: "responsible_abstention",
            conversationalFraming: "The GuideSite cannot responsibly answer this prompt yet.",
            nextSteps: ["Provide more context in a follow-up turn."],
          },
        },
      },
      expectations: [/Can’t answer yet/, /Provide more context in a follow-up turn\./],
    },
    {
      label: "technical failure",
      result: {
        promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
        presentation: {
          ...basePresentation,
          answer: {
            status: "technical_failure",
            title: "Technical failure",
            message: "The GuideSite turn failed before a product answer could be rendered.",
          },
        },
      },
      expectations: [/Technical failure/, /The GuideSite turn failed before a product answer could be rendered\./],
    },
  ];

  for (const { label, result, expectations } of cases) {
    const markup = renderToStaticMarkup(
      React.createElement(OperatorDemoClient, {
        result,
        startDemoAction: async () => result,
        submitPromptAction: async () => result,
      }),
    );

    for (const expectation of expectations) {
      assert.match(markup, expectation, label);
    }

    if (result.presentation.answer.status !== "not_started") {
      assert.match(markup, /Run details/, label);
      assert.match(markup, /Answer disposition/, label);
      assert.match(markup, /Raw structured output/, label);
    }
  }
});

test("operator demo client hides unsupported answer statuses behind technical failure", () => {
  const result = {
    promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
    presentation: {
      camp: {
        campId: "ultimate-camp-website",
        campName: "Ultimate Camp Website",
        answerAccent: "amber",
        surfaceTone: "warm-sand",
        operatorChrome: "slate",
      },
      answer: {
        status: "partial",
        completeness: "partial",
        conversationalFraming: "A hedged partial answer should never be shown as a product answer.",
        sections: [],
        citations: [],
      },
      operatorDiagnostics: {
        runId: "run_operator_gui_boundary",
        sessionId: "session_operator_gui_boundary",
        runStatus: "composed",
        provider: "openai",
        model: "gpt-test",
        diagnostics: [],
      },
      operatorInspection: createGuideSiteLoadingPresentation().operatorInspection,
    },
  } as unknown as GuideSiteGuiActionResult;

  const markup = renderToStaticMarkup(
    React.createElement(OperatorDemoClient, {
      result,
      startDemoAction: async () => result,
      submitPromptAction: async () => result,
    }),
  );

  assert.match(markup, /Technical failure/);
  assert.match(markup, /The GuideSite turn failed before a product answer could be rendered\./);
  assert.doesNotMatch(markup, /A hedged partial answer should never be shown as a product answer\./);
  assert.doesNotMatch(markup, /partial answer should never be shown/i);
});

test("operator demo client keeps the answer presentation usable at mobile preview widths", () => {
  const clientSource = readFileSync(join(process.cwd(), "app/operator/operator-demo-client.tsx"), "utf8");

  assert.match(clientSource, /min-w-0 rounded-2xl/);
  assert.match(clientSource, /bg-\[color:var\(--ucw-answer-surface\)\] p-5 shadow-sm sm:p-6/);
  assert.match(clientSource, /flex flex-col gap-4 sm:flex-row/);
  assert.match(clientSource, /min-w-0 break-words/);
  assert.doesNotMatch(clientSource, /requiredMedia|mandatoryMedia|heroImage|videoUrl/);
});

test("operator demo client exposes native controls without custom keyboard shortcuts", () => {
  const clientSource = readFileSync(join(process.cwd(), "app/operator/operator-demo-client.tsx"), "utf8");

  assert.match(clientSource, /<details className="group">/);
  assert.match(clientSource, /<summary className="flex cursor-pointer list-none/);
  assert.match(clientSource, /focus-visible:outline-none focus-visible:ring-2/);
  assert.match(clientSource, /type="submit"/);
  assert.doesNotMatch(clientSource, /onKeyDown|onKeyUp|onKeyPress|addEventListener\(["']keydown/);
  assert.doesNotMatch(clientSource, /accessKey=/);
});

test("operator demo client stays free of server-only GuideSite imports", () => {
  const clientSource = readFileSync(join(process.cwd(), "app/operator/operator-demo-client.tsx"), "utf8");

  assert.match(clientSource, /"use client"/);
  for (const forbiddenImport of [
    "../guide-site-gui-service",
    "../../src/guidesite-mvp/run-lifecycle",
    "../../src/guidesite-mvp/openai-prompt-understanding",
    "../../src/guidesite-mvp/sanity-retrieval",
  ]) {
    assert.doesNotMatch(clientSource, new RegExp(forbiddenImport.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
