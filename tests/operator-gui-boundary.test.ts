import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createGuideSiteMemoryStores, startGuideSiteRun } from "../src/guidesite-mvp/run-lifecycle.js";
import type { AnswerComposition, RunState } from "../src/guidesite-mvp/types.js";
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
        sourceRefs: [],
      },
    ],
    suggestedPrompts: [],
    citations: [],
    diagnostics: [],
  };

  return {
    ...started,
    status: "composed",
    answerComposition,
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

  const vagueReply = await service.submitPrompt({
    promptText: "I don't know, maybe sometimes.",
    sessionId: "session_gui_required_context",
  });

  assert.equal(vagueReply.presentation.answer.status, "context_gathering_response");
  assert.match(vagueReply.presentation.answer.conversationalFraming, /more Visitor Context/i);
  assert.equal(vagueReply.presentation.answer.requiredQuestions.length > 0, true);
  assert.notEqual(vagueReply.presentation.operatorDiagnostics.runStatus, "validation_failed");
  assert.notEqual(vagueReply.presentation.operatorDiagnostics.runStatus, "technical_failure");
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
        presentation: {
          camp: {
            campId: "ultimate-camp-website",
            campName: "Ultimate Camp Website",
            answerAccent: "amber",
            surfaceTone: "warm-sand",
            operatorChrome: "slate",
          },
          answer: {
            status: "loading",
            headline: "Ultimate Camp Website answer presentation",
            message: "Loading the operator demo surface.",
          },
          operatorDiagnostics: {
            runId: null,
            sessionId: null,
            runStatus: "loading",
            provider: null,
            model: null,
            diagnostics: [],
          },
        },
      }),
      submitPrompt: async ({ promptText, sessionId }: { promptText: string; sessionId?: string }) => {
        seenPromptTexts.push(promptText);
        seenSessionIds.push(sessionId);
        return {
          promptText,
          presentation: {
            camp: {
              campId: "ultimate-camp-website",
              campName: "Ultimate Camp Website",
              answerAccent: "amber",
              surfaceTone: "warm-sand",
              operatorChrome: "slate",
            },
            answer: {
              status: "loading",
              headline: "Ultimate Camp Website answer presentation",
              message: "Loading the operator demo surface.",
            },
            operatorDiagnostics: {
              runId: null,
              sessionId: null,
              runStatus: "loading",
              provider: null,
              model: null,
              diagnostics: [],
            },
          },
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
                sourceId: "program_overnight",
                label: "Overnight Camp Program",
              },
            ],
          },
          {
            title: "Concerns",
            body: "The homesickness policy outlines the support path.",
            citations: [
              {
                sourceId: "policy_homesickness",
                label: "Homesickness Support Policy",
              },
            ],
          },
        ],
        citations: [
          {
            sourceId: "program_overnight",
            label: "Overnight Camp Program",
          },
          {
            sourceId: "policy_homesickness",
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
  assert.ok(markup.indexOf("Concerns") < markup.indexOf("Homesickness Support Policy"));
  assert.ok(markup.indexOf("Homesickness Support Policy") < markup.indexOf("The homesickness policy outlines the support path."));
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
