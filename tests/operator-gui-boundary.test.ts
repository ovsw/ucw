import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createGuideSiteMemoryStores, startGuideSiteRun } from "../src/guidesite-mvp/run-lifecycle.js";
import type { AnswerComposition, RunState } from "../src/guidesite-mvp/types.js";
import { createGuideSiteLoadingPresentation, mapGuideSiteRunStateToPresentation, type GuideSitePresentation } from "../src/guidesite-mvp/presentation-dto.js";
import {
  DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
  createGuideSiteGuiService,
  type GuideSiteGuiActionResult,
} from "../app/operator/guide-site-gui-service.js";
import {
  createGuideSiteOperatorDemoActions,
} from "../app/operator/actions.js";
import OperatorDemoClient from "../app/operator/operator-demo-client.js";

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

test("GuideSite GUI service starts from the canonical prompt and maps technical failures", async () => {
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

  const startResult = await service.startDemo({ sessionId: "session_gui_reload" });
  assert.deepEqual(seenRuntimeModes, ["fixture"]);
  assert.deepEqual(seenPrompts, [DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT]);
  assert.deepEqual(seenSessionIds, ["session_gui_reload"]);
  assert.equal(startResult.promptText, DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT);
  assert.equal(startResult.presentation.answer.status, "assembled_answer");

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

  const result = await service.startDemo({
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

test("GuideSite GUI service reports missing live config loudly and does not run fixture retrieval", async () => {
  let runTurnCalled = false;
  const service = createGuideSiteGuiService({
    async runTurn() {
      runTurnCalled = true;
      return createAnsweredRun();
    },
  });

  const result = await service.startDemo({
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

  const started = await service.startDemo({ sessionId: "session_gui_required_context" });
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

test("GuideSite GUI fixture mode renders withheld required-context replies as responsible abstention", async () => {
  const service = createGuideSiteGuiService({
    readRuntimeConfig() {
      return {
        runtimeMode: "fixture",
        retrievalMode: "fixture",
      };
    },
    createStores: () => createGuideSiteMemoryStores(),
  });

  const started = await service.startDemo({ sessionId: "session_gui_withheld_context" });
  assert.equal(started.presentation.answer.status, "context_gathering_response");

  const withheldReply = await service.submitPrompt({
    promptText: "I'd prefer not to say.",
    sessionId: "session_gui_withheld_context",
  });

  assert.equal(withheldReply.presentation.answer.status, "responsible_abstention");
  assert.match(withheldReply.presentation.answer.conversationalFraming, /cannot responsibly answer/i);
  assert.match(withheldReply.presentation.answer.nextSteps[0] ?? "", /Provide more context/i);
  assert.notEqual(withheldReply.presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.notEqual(withheldReply.presentation.operatorDiagnostics.runStatus, "technical_failure");
});

test("Operator demo actions adapt form submissions into service calls", async () => {
  const seenPromptTexts: string[] = [];
  const seenSessionIds: Array<string | undefined> = [];
  const actions = createGuideSiteOperatorDemoActions({
    service: {
      startDemo: async () => ({
        promptText: DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT,
        presentation: createGuideSiteLoadingPresentation(),
      }),
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

  const started = await actions.startGuideSiteOperatorDemoAction(new FormData());
  const submittedFormData = new FormData();
  submittedFormData.append("promptText", "  Is overnight camp right for my 8-year-old?  ");
  submittedFormData.append("sessionId", "session_operator_gui_boundary");
  const submitted = await actions.submitGuideSiteOperatorPromptAction(submittedFormData);

  assert.equal(started.promptText, DEFAULT_GUIDESITE_GUI_CANONICAL_PROMPT);
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

  assert.match(markup, /Assembled answer/);
  assert.match(markup, /The approved source material explains how overnight camp supports the Child\./);
  assert.ok(markup.indexOf("Summary") < markup.indexOf("Overnight Camp Program"));
  assert.ok(markup.indexOf("Overnight Camp Program") < markup.indexOf("The camp offers overnight programming for age-appropriate campers."));
  assert.doesNotMatch(markup, /campProgram/);
  assert.doesNotMatch(markup, /summary · mock_rev_program_overnight_001/);
  assert.ok(markup.indexOf("Concerns") < markup.indexOf("Homesickness Support Policy"));
  assert.ok(markup.indexOf("Homesickness Support Policy") < markup.indexOf("The homesickness policy outlines the support path."));
  assert.doesNotMatch(markup, /Contact Path/);
});

test("operator demo client renders Journey Timeline as secondary non-replay context", () => {
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

  const answerIndex = markup.indexOf("Answer Presentation");
  const timelineIndex = markup.indexOf("Journey Timeline");
  const inspectionIndex = markup.indexOf("Inspection drawer");

  assert.ok(answerIndex >= 0);
  assert.ok(timelineIndex > answerIndex);
  assert.ok(inspectionIndex > timelineIndex);
  assert.match(markup, /Secondary operator context/);
  assert.match(markup, /Prior prompts/);
  assert.match(markup, /Is overnight camp right for my 8-year-old\?/);
  assert.match(markup, /Visitor Context/);
  assert.match(markup, /Child Age/);
  assert.match(markup, /Homesickness: open/);
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
  assert.match(markup, /Inspection drawer/);
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
  const answerSurfaceIndex = markup.indexOf("Parent-shaped output");
  const inspectionIndex = markup.indexOf("Inspection drawer");

  assert.match(markup, /Open Sanity admin/);
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

  const answerSurfaceIndex = markup.indexOf("Parent-shaped output");
  const inspectionIndex = markup.indexOf("Inspection drawer");
  const providerIndex = markup.indexOf("gpt-test");

  assert.ok(answerSurfaceIndex >= 0);
  assert.ok(inspectionIndex > answerSurfaceIndex);
  assert.ok(providerIndex > inspectionIndex);
  assert.doesNotMatch(markup.slice(answerSurfaceIndex, inspectionIndex), /gpt-test|openai|providerRawOutput/);
});

test("operator demo client renders every allowed presentation state distinctly", () => {
  const basePresentation: Pick<GuideSitePresentation, "camp" | "operatorDiagnostics" | "operatorInspection"> = {
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
  };

  const cases: Array<{
    label: string;
    result: GuideSiteGuiActionResult;
    expectations: RegExp[];
  }> = [
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
                    id: "prompt_prior_sleepaway_experience",
                    text: "Has your child slept away from home before?",
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
      expectations: [/Context Gathering Response/, /Required context/, /Controlled replies/, /Freeform reply/, /Suggested prompts/],
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
      expectations: [/Responsible abstention/, /Provide more context in a follow-up turn\./],
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

    assert.match(markup, /Inspection drawer/, label);
    assert.match(markup, /Answer disposition/, label);
    assert.match(markup, /Raw structured output/, label);
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

  assert.match(clientSource, /min-w-0 rounded-\[1\.75rem\]/);
  assert.match(clientSource, /bg-\[color:var\(--ucw-answer-surface\)\] p-4 shadow-\[0_24px_70px_rgba\(48,28,8,0\.1\)\] sm:rounded-\[2rem\] sm:p-8/);
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
