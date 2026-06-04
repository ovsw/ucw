import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createGuideSiteMemoryStores, renderGuideSiteRunOperatorOutput } from "../../src/guidesite-mvp/run-lifecycle.js";
import { createGuideSiteFileRunStore } from "../../src/guidesite-mvp/run-store.js";
import { runGuideSiteMvpTurn } from "../../src/guidesite-mvp/turn.js";
import { createSanityGuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/sanity-retrieval.js";
import type { GuideSiteRetrievalAdapter } from "../../src/guidesite-mvp/fixture-retrieval.js";
import {
  canonicalGuideSitePrompt,
  canonicalGuideSiteUnderstanding,
  createFakePromptUnderstandingProvider,
  homesicknessConcernUnderstanding,
} from "./test-helpers.js";

test("GuideSite turn commits the canonical Prompt into inspectable Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_canonical",
      createRunId: () => "run_turn_canonical",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
    });

    assert.equal(run.status, "committed");
    assert.equal(run.runId, "run_turn_canonical");
    assert.equal(run.promptUnderstandingProvider?.provider, "fake");
    assert.equal(run.promptUnderstandingValidation?.valid, true);
    assert.equal(run.retrieval?.coverage.status, "source_backed");
    assert.equal(run.answerComposition?.status, "needs_context");
    assert.deepEqual(run.answerCompositionValidation, {
      valid: true,
      diagnostics: [],
    });
    assert.equal(
      run.answerComposition?.conversationalFraming,
      "Age 8 is relevant, but the GuideSite needs more Visitor Context before it can honestly assess Fit.",
    );
    assert.deepEqual(run.answerComposition?.citations, [
      "program_overnight",
      "policy_homesickness",
      "policy_parent_communication",
      "concern_homesickness",
    ]);
    assert.ok(run.patch);
    assert.ok(run.committedSessionState);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_canonical.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "committed");
    assert.equal(savedRun.committedSessionState?.revision, 2);
    assert.equal(savedRun.patch?.baseRevision, 1);
    assert.deepEqual(stores.runs.read("run_turn_canonical")?.answerCompositionValidation, {
      valid: true,
      diagnostics: [],
    });
    assert.deepEqual(savedRun.diagnostics, []);

    const output = renderGuideSiteRunOperatorOutput(run);
    assert.match(output, /Committed Session Summary:/);
    assert.match(output, /Homesickness and Child Readiness remain open concerns/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn commits the canonical Prompt through a Sanity-backed retrieval adapter", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const retrievalAdapter = createSanityGuideSiteRetrievalAdapter((query) => {
      assert.match(query.searchText, /overnight/i);
      assert.match(query.searchText, /homesickness/i);
      assert.equal(query.sessionContext?.session.revision, 1);
      assert.equal(query.sessionContext?.session.summary, "");

      return [
        {
          _id: "concern_homesickness",
          _type: "concern",
          _rev: "mock_rev_concern_homesickness_001",
          sourceKind: "sourceOfTruth",
          title: "Homesickness and Child Readiness",
          summary: "Parents often need to assess Child Readiness by looking at prior sleepaway experience.",
        },
        {
          _id: "program_overnight",
          _type: "campProgram",
          _rev: "mock_rev_program_overnight_001",
          sourceKind: "sourceOfTruth",
          title: "Overnight Camp Program",
          summary: "The overnight Camp Program gives children a residential camp experience with cabin life.",
        },
        {
          _id: "policy_homesickness",
          _type: "policy",
          _rev: "mock_rev_policy_homesickness_001",
          sourceKind: "sourceOfTruth",
          title: "Homesickness Support Policy",
          summary: "Cabin staff watch for homesickness and help children settle into routines.",
        },
        {
          _id: "policy_parent_communication",
          _type: "policy",
          _rev: "mock_rev_policy_parent_communication_001",
          sourceKind: "sourceOfTruth",
          title: "Parent Communication Policy",
          summary: "Camp contacts parents when staff need family context or when adjustment concerns persist.",
        },
        {
          _id: "prompt_template_sleepaway_experience",
          _type: "promptTemplate",
          _rev: "mock_rev_prompt_template_sleepaway_experience_001",
          sourceKind: "sourceOfTruth",
          title: "Prior Sleepaway Experience Prompt Template",
          text: "Has your child slept away from home before?",
        },
      ];
    });

    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_sanity_canonical",
      createRunId: () => "run_turn_sanity_canonical",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
      retrievalAdapter,
    });

    assert.equal(run.status, "committed");
    assert.equal(run.retrieval?.adapterId, "sanityHybrid");
    assert.equal(run.retrieval?.coverage.status, "source_backed");
    assert.equal(run.answerComposition?.status, "needs_context");
    assert.deepEqual(run.answerCompositionValidation, {
      valid: true,
      diagnostics: [],
    });
    assert.equal(run.committedSessionState?.summary, "Parent is assessing overnight camp Fit for an 8-year-old Child. Homesickness and Child Readiness remain open concerns; Remaining need: Prior Sleepaway Experience and Child Readiness.");
    assert.equal(run.answerComposition?.citations.includes("prompt_template_sleepaway_experience"), true);

    const output = renderGuideSiteRunOperatorOutput(run);
    assert.match(output, /Retrieval Adapter: Sanity Hybrid \[sanityHybrid\]/);
    assert.match(output, /"sourceId": "prompt_template_sleepaway_experience"/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves provider failures as inspectable Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "Can you plan my whole summer?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_failure",
      createRunId: () => "run_turn_failure",
      promptUnderstandingProvider: {
        async understandPrompt(_promptText: string) {
          throw new Error("provider unavailable");
        },
      },
    });

    assert.equal(run.status, "prompt_understanding_failed");
    assert.equal(run.answerComposition, null);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["prompt_understanding_provider_failed: Prompt Understanding provider failed: provider unavailable"]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_failure.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "prompt_understanding_failed");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves invalid Prompt Understanding diagnostics without composition or commit", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_invalid",
      createRunId: () => "run_turn_invalid",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider({
        goal: "unknown",
        promptType: "unknown",
        fitQuestion: null,
        facts: {},
        concerns: [],
        retrievalNeeds: [],
        contextNeeds: [],
      }),
    });

    assert.equal(run.status, "validation_failed");
    assert.equal(run.understanding, null);
    assert.equal(run.answerComposition, null);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, [
      "prompt_understanding_goal_required",
      "prompt_understanding_prompt_type_required",
    ]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_invalid.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "validation_failed");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn falls back safely when Answer Composition validation fails", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_invalid_answer_composition",
      createRunId: () => "run_turn_invalid_answer_composition",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
      retrievalAdapter: {
        id: "invalid-answer-composition",
        label: "Invalid Answer Composition Retrieval",
        retrieve(input) {
          return {
            needs: [...input.retrievalNeeds],
            concerns: input.concerns.map((concern) => concern.key),
            results: [
              {
                sourceId: "program_overnight",
                sourceType: "campProgram",
                title: "Unsafe Secret Draft",
                rank: 1,
                fieldPath: "",
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
              {
                sourceId: "policy_parent_communication",
                sourceType: "policy",
                title: "Parent Communication Policy",
                rank: 3,
                fieldPath: "summary",
                sourceRevision: "mock_rev_policy_parent_communication_001",
              },
              {
                sourceId: "concern_homesickness",
                sourceType: "concern",
                title: "Homesickness and Child Readiness",
                rank: 4,
                fieldPath: "summary",
                sourceRevision: "mock_rev_concern_homesickness_001",
              },
            ],
            diagnostics: ["fake_invalid_answer_composition_retrieval"],
            coverage: {
              status: "source_backed",
              matchedSourceIds: ["program_overnight", "policy_homesickness", "policy_parent_communication", "concern_homesickness"],
            },
          };
        },
      },
    });

    assert.equal(run.status, "validation_failed");
    assert.equal(run.answerComposition, null);
    assert.equal(run.rejectedAnswerComposition?.sections[0]?.sourceRefs?.[0]?.title, "Unsafe Secret Draft");
    assert.equal(run.answerCompositionValidation?.valid, false);
    assert.match(run.answerCompositionValidation?.diagnostics.join(" ") ?? "", /field_path_required/);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(stores.sessions.read("session_turn_invalid_answer_composition"), run.snapshot);
    assert.deepEqual(run.diagnostics, [
      "fake_invalid_answer_composition_retrieval",
      "answer_composition_section_0_source_ref_0_field_path_required",
      "answer_composition_section_5_source_ref_0_field_path_required",
      "answer_composition_citation_program_overnight_unsupported_source_ref",
    ]);

    const output = renderGuideSiteRunOperatorOutput(run);
    assert.match(output, /Answer Composition Validation:/);
    assert.match(output, /"valid": false/);
    assert.match(output, /I don't have enough verified information to answer that confidently\./);
    assert.match(output, /Answer Composition Status: validation_failed/);
    assert.doesNotMatch(output, /Answer Composition Status: needs_context/);

    const savedRun = JSON.parse(
      readFileSync(join(runStateDirectory, "run_turn_invalid_answer_composition.json"), "utf8"),
    ) as typeof run;
    assert.equal(savedRun.status, "validation_failed");
    assert.equal(savedRun.answerComposition, null);
    assert.equal(savedRun.answerCompositionValidation?.valid, false);
    assert.equal(savedRun.rejectedAnswerComposition?.sections[0]?.sourceRefs?.[0]?.title, "Unsafe Secret Draft");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn preserves insufficient source material as fallback Run State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "Do you offer camp bus pickup?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_empty_retrieval",
      createRunId: () => "run_turn_empty_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider({
        goal: "answer_factual",
        promptType: "factual",
        fitQuestion: null,
        facts: {},
        concerns: [
          {
            key: "transportation",
            label: "Transportation",
            status: "open",
            provenance: "explicit",
          },
        ],
        retrievalNeeds: ["bus_schedule"],
        contextNeeds: [],
      }),
    });

    assert.equal(run.status, "fallback");
    assert.equal(run.answerComposition?.status, "fallback");
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, [
      "insufficient_fixture_sources: no approved fixture sources matched retrieval needs bus_schedule or concerns transportation",
    ]);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_empty_retrieval.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "fallback");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn commits a source-backed homesickness Concern answer into Session State", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "What happens if my child gets homesick?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_homesickness",
      createRunId: () => "run_turn_homesickness",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(homesicknessConcernUnderstanding),
    });

    assert.equal(run.status, "committed");
    assert.equal(run.answerComposition?.status, "answered");
    assert.match(run.answerComposition?.conversationalFraming ?? "", /homesickness/i);
    assert.deepEqual(run.answerComposition?.citations, [
      "concern_homesickness",
      "policy_homesickness",
      "policy_parent_communication",
    ]);
    assert.deepEqual(run.answerComposition?.sections.map((section) => section.kind), [
      "summary",
      "concerns",
      "sources",
      "diagnostics",
    ]);
    assert.equal(run.patch?.operations[0]?.type, "upsertConcern");
    const firstPatchOperation = run.patch?.operations[0];
    assert.equal(firstPatchOperation?.type, "upsertConcern");
    assert.equal(firstPatchOperation?.concern.status, "addressed");
    assert.equal(run.committedSessionState?.concerns.homesickness.status, "addressed");
    assert.equal(run.committedSessionState?.concerns.child_readiness, undefined);
    assert.deepEqual(run.diagnostics, []);

    const savedRun = JSON.parse(readFileSync(join(runStateDirectory, "run_turn_homesickness.json"), "utf8")) as typeof run;
    assert.equal(savedRun.status, "committed");
    assert.equal(savedRun.committedSessionState?.concerns.homesickness.status, "addressed");
    assert.match(savedRun.answerComposition?.sections[0]?.body ?? "", /homesickness/i);
    const output = renderGuideSiteRunOperatorOutput(run);
    assert.match(output, /Committed Session Summary:/);
    assert.match(output, /Homesickness has been addressed/);
    assert.match(output, /"sourceId": "concern_homesickness"/);
    assert.match(output, /"sourceId": "policy_homesickness"/);
    assert.match(output, /"sourceId": "policy_parent_communication"/);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn composes a partial homesickness Concern answer when source material is missing", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "What happens if my child gets homesick?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_homesickness_partial",
      createRunId: () => "run_turn_homesickness_partial",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(homesicknessConcernUnderstanding),
      retrievalAdapter: {
        id: "partial-homesickness",
        label: "Partial Homesickness Retrieval",
        retrieve(input) {
          return {
            needs: [...input.retrievalNeeds],
            concerns: input.concerns.map((concern) => concern.key),
            results: [
              {
                sourceId: "policy_homesickness",
                sourceType: "policy",
                title: "Homesickness Support Policy",
                rank: 1,
                fieldPath: "summary",
                sourceRevision: "mock_rev_policy_homesickness_001",
              },
            ],
            diagnostics: ["fake_partial_homesickness_retrieval"],
            coverage: {
              status: "source_backed",
              matchedSourceIds: ["policy_homesickness"],
            },
          };
        },
      },
    });

    assert.equal(run.status, "composed");
    assert.equal(run.answerComposition?.status, "partial");
    assert.match(run.answerComposition?.diagnostics.join(" ") ?? "", /missing.*concern_homesickness/i);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["fake_partial_homesickness_retrieval"]);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn composes a partial homesickness Concern answer with Sanity source wording", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const run = await runGuideSiteMvpTurn({
      promptText: "What happens if my child gets homesick?",
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_homesickness_partial_sanity",
      createRunId: () => "run_turn_homesickness_partial_sanity",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(homesicknessConcernUnderstanding),
      retrievalAdapter: {
        id: "sanityHybrid",
        label: "Sanity Hybrid",
        retrieve(input) {
          return {
            needs: [...input.retrievalNeeds],
            concerns: input.concerns.map((concern) => concern.key),
            results: [
              {
                sourceId: "policy_homesickness",
                sourceType: "policy",
                title: "Homesickness Support Policy",
                rank: 1,
                fieldPath: "summary",
                sourceRevision: "mock_rev_policy_homesickness_001",
              },
            ],
            diagnostics: ["fake_partial_sanity_homesickness_retrieval"],
            coverage: {
              status: "source_backed",
              matchedSourceIds: ["policy_homesickness"],
            },
          };
        },
      },
    });

    assert.equal(run.status, "composed");
    assert.equal(run.answerComposition?.status, "partial");
    assert.match(
      run.answerComposition?.conversationalFraming ?? "",
      /The approved source material from Sanity Hybrid \[sanityHybrid\] supports a partial homesickness answer/,
    );
    assert.match(
      run.answerComposition?.sections.find((section) => section.kind === "sources")?.body ?? "",
      /Approved source material from Sanity Hybrid \[sanityHybrid\] was retrieved for the homesickness concern\./,
    );
    const output = renderGuideSiteRunOperatorOutput(run);
    assert.match(output, /Retrieval Adapter: Sanity Hybrid \[sanityHybrid\]/);
    assert.doesNotMatch(output, /fixture source material/i);
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["fake_partial_sanity_homesickness_retrieval"]);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});

test("GuideSite turn uses the supplied Retrieval Strategy adapter", async () => {
  const runStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-turn-"));
  try {
    const stores = createGuideSiteMemoryStores({
      runs: createGuideSiteFileRunStore(runStateDirectory),
    });
    const retrievalAdapter: GuideSiteRetrievalAdapter = {
      id: "fake-empty",
      label: "Fake Empty Retrieval",
      retrieve(input) {
        return {
          needs: [...input.retrievalNeeds],
          concerns: input.concerns.map((concern) => concern.key),
          results: [],
          diagnostics: ["fake_retrieval_adapter_empty"],
          coverage: {
            status: "empty_retrieval",
            matchedSourceIds: [],
          },
        };
      },
    };

    const run = await runGuideSiteMvpTurn({
      promptText: canonicalGuideSitePrompt,
      stores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_turn_adapter_empty_retrieval",
      createRunId: () => "run_turn_adapter_empty_retrieval",
      promptUnderstandingProvider: createFakePromptUnderstandingProvider(),
      retrievalAdapter,
    });

    assert.equal(run.status, "fallback");
    assert.equal(run.retrieval?.coverage.status, "empty_retrieval");
    assert.equal(run.answerComposition?.status, "fallback");
    assert.equal(run.patch, null);
    assert.equal(run.committedSessionState, null);
    assert.deepEqual(run.diagnostics, ["fake_retrieval_adapter_empty"]);

    const savedRun = JSON.parse(
      readFileSync(join(runStateDirectory, "run_turn_adapter_empty_retrieval.json"), "utf8"),
    ) as typeof run;
    assert.equal(savedRun.status, "fallback");
    assert.equal(savedRun.committedSessionState, null);
  } finally {
    rmSync(runStateDirectory, { recursive: true, force: true });
  }
});
