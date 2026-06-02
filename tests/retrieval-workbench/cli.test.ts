import assert from "node:assert/strict";
import test from "node:test";
import {
  parseRetrievalWorkbenchCliArgs,
  readAnswerComposerOption,
  readAnswerComposerTopKOption,
} from "../../src/retrieval-workbench/cli.js";

test("CLI parsing accepts Answer Composer options and defaults top-k to the benchmark threshold", () => {
  assert.deepEqual(
    parseRetrievalWorkbenchCliArgs([
      "fixtures/retrieval-workbench/generated.json",
      "--concern-surfacer=openai",
      "--answer-composer=openai",
      "--answer-composer-top-k=8",
    ]),
    {
      fixturePath: "fixtures/retrieval-workbench/generated.json",
      deterministicOnly: false,
      concernSurfacer: "openai",
      answerComposer: "openai",
      answerComposerTopK: 8,
    },
  );

  assert.equal(readAnswerComposerOption([]), "none");
  assert.equal(readAnswerComposerTopKOption([]), 5);
  assert.deepEqual(
    parseRetrievalWorkbenchCliArgs(["--answer-composer-top-k=8", "--answer-composer=openai"]),
    {
      fixturePath: undefined,
      deterministicOnly: false,
      concernSurfacer: "none",
      answerComposer: "openai",
      answerComposerTopK: 8,
    },
  );
});

test("CLI parsing rejects unknown Answer Composer values and invalid top-k values", () => {
  assert.throws(
    () => readAnswerComposerOption(["--answer-composer=fake"]),
    /Unknown Answer Composer: fake/,
  );
  assert.throws(
    () => readAnswerComposerOption(["--answer-composer"]),
    /Use --answer-composer=openai or --answer-composer=none/,
  );
  assert.throws(
    () => readAnswerComposerTopKOption(["--answer-composer-top-k=0"]),
    /positive integer/,
  );
  assert.throws(
    () => readAnswerComposerTopKOption(["--answer-composer-top-k=1.5"]),
    /positive integer/,
  );
  assert.throws(
    () => readAnswerComposerTopKOption(["--answer-composer-top-k"]),
    /Use --answer-composer-top-k=<positive integer>/,
  );
});
