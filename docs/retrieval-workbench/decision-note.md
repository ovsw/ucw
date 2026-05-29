# Retrieval Workbench Decision Note

## Corpus

This note is based on running the integrated deterministic workbench against:

```text
fixtures/retrieval-workbench/generated.json
```

Run command:

```sh
npm run workbench -- fixtures/retrieval-workbench/generated.json
```

The generated corpus contains 8 Concern documents, 25 non-Concern Content Entities, and 12 gold-set Parent Prompts.

## Baseline

The current baseline uses `src/retrieval-workbench/deterministic-retrieval.ts` as the single deterministic retrieval implementation. It builds separate MiniSearch indexes for Concern documents and Content Entities, then merges direct Content Entity matches with Concern-expansion matches through `relatedConcerns`.

The terminal report is rendered from that canonical result shape. It shows expected concerns/content, matched concerns, direct Content Entity matches, merged Content Entity ranking, field-level match reasons, missing required items, and obvious distractors.

## Observed Results

The generated-corpus run found all expected Concern ids and all required Content Entity ids:

```text
Summary: 0 missing expected concerns, 0 missing required content entities, 27/27 required content hits
```

No required source-of-truth item was missing in the report output. This is a useful baseline for proving the workbench wiring and fixture contract, but it should not be read as production retrieval quality.

## Noisy Matches

The main weakness is broad lexical noise from common terms and highly connected Concern expansion:

- `prompt-allergy-epipen` ranks `policy-parent-communication` above the required allergy protocol and medical-care policy because it shares child/allergy/safety terms and receives Concern-expansion score from both medical safety and homesickness.
- `prompt-bullying-and-homesickness` ranks `policy-parent-communication` and `testimonial-parent-readiness` ahead of the generated bullying policy. The required bullying policy is present, but lower in the merged ranking.
- Several prompts surface `camper-rule-electronics` as a high-ranked distractor because common terms such as child/and/camp plus homesickness or packing Concern expansion make it broadly eligible.
- `prompt-day-camp-alternative` correctly ranks `program-day-camp` first, but still gives high merged scores to parent communication, junior overnight, and pricing documents because they share overnight/camp/affordability vocabulary.

The field-level reasons make these failures inspectable: common terms such as `and`, `a`, `the`, `child`, and `camp` appear frequently in match reasons and can dominate when combined with broad Concern expansion.

## Decision

Keep this MiniSearch baseline as the deterministic retrieval workbench baseline for now. It is deterministic, fixture-backed, and exposes enough ranking detail to compare future retrieval changes without adding embeddings, LLM classification, browser UI, production Sanity schemas, or answer composition.

The next useful improvement is not a new retrieval stack. It is better scoring hygiene inside the baseline: stop-word handling, more selective Concern-expansion weighting, and tests that assert noisy distractors stay below required source-of-truth content for representative prompts.
