# Retrieval Workbench Decision Note

## Corpus

This note is based on the integrated comparison workbench run against:

```text
fixtures/retrieval-workbench/generated.json
```

Run command:

```sh
npm run workbench -- fixtures/retrieval-workbench/generated.json
```

The generated corpus contains 8 Concern documents, 25 non-Concern Content Entities, and 12 gold-set Parent Prompts.

## Live Sanity Comparison Run

On May 31, 2026, the generated fixture corpus was seeded into the configured Sanity dataset from `.sandcastle/.env`. The seed operation upserted all 33 fixture documents from `fixtures/retrieval-workbench/generated.json`.

The integrated comparison command now completes through the normal report path. The parity check compares fixture-owned documents while ignoring Sanity-managed system documents such as `_.groups.*` and `_.retention._maximum_project`.

The Sanity retrieval queries use score expressions accepted by the configured Content Lake API and avoid dereferenced scoring fields:

```groq
score(
  title match text::query($searchQuery),
  contentMap match text::query($searchQuery)
)
```

for `sanityKeyword`, and:

```groq
score(
  title match text::query($searchQuery),
  contentMap match text::query($searchQuery),
  text::semanticSimilarity($searchQuery)
)
```

for `sanityHybrid`.

The Sanity strategies now also run a second Content Entity bridge query after matching Concerns. That query finds Content Entities whose `relatedConcerns[]._ref` intersects the top matched Concern IDs, then merges those bridge hits with direct prompt-to-document hits in TypeScript. Direct Sanity `_score` and matched Concern expansion scores are both preserved as retrieval sources in the shared report shape.

The Sanity query plans also shape parent prompt text before passing it to `text::query($searchQuery)`. The shaping removes deterministic stop words, expands deterministic aliases, and adds Sanity-specific vocabulary for cases where the live query only scores `title` and `contentMap` fields. Retrieval queries exclude Sanity-managed `_.*` system documents so zero-score system records cannot occupy Content Entity result slots.

The integrated comparison summary was:

```text
Deterministic: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 25/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.78
Sanity Keyword: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 24/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.89, improvements: 5, regressions: 8, ties: 14
Sanity Hybrid: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 24/27, top 10 required content hits: 27/27, weak required content hits: 0/27, average required rank: 2.81, improvements: 5, regressions: 7, ties: 15
```

## Baseline

The deterministic baseline uses `src/retrieval-workbench/deterministic-retrieval.ts`. It builds separate MiniSearch indexes for Concern documents and Content Entities, then merges direct Content Entity matches with Concern-expansion matches through `relatedConcerns`.

The terminal report is rendered from the shared retrieval result shape. It shows expected concerns/content, matched concerns, direct Content Entity matches, merged Content Entity ranking, field-level match reasons, missing required items, and obvious distractors.

## Observed Results

Deterministic remains the strongest baseline. It found every required Content Entity somewhere in the report, placed 25 of 27 required hits in the Top 5 usable band, and placed 26 of 27 in the Top 10 diagnostic band. Its main weaknesses are still implied or multi-intent prompts: `prompt-bullying-and-homesickness` leaves `procedure-homesickness-support` diagnostic, and `prompt-day-camp-alternative` leaves `policy-registration-cancellation` weak.

`sanityKeyword` now behaves like a real two-stage retrieval strategy with shaped prompt text: it first matches Concerns, then uses those Concerns as a bridge to related Content Entities. Query shaping lifts Top 5 required content hits from 17/27 to 24/27 while preserving zero missing required Content Entities. Its remaining weak required hit is `procedure-homesickness-support` at #11 for `prompt-first-time-homesick`; allergy medical policy and registration/cancellation are now diagnostic rather than weak.

`sanityHybrid` is now slightly better than `sanityKeyword` on the generated corpus after query shaping. It recovers all required Content Entities, places every required item in the Top 10 diagnostic band, and has no weak required hits. Its remaining Top 5 misses are `policy-medical-care` at #6 for allergy, `procedure-homesickness-support` at #9 for first-time homesickness, and `policy-registration-cancellation` at #6 for day-camp alternative.

## Failure Classification

`prompt-bullying-and-homesickness` is no longer the primary Sanity ranking failure after query shaping. Both Sanity strategies now place all required items in the usable band for that prompt, including `policy-bullying-response`.

`prompt-swim-weak-swimmer` is also no longer a Sanity weak spot. Sanity-specific shaping expands swimmer/lake language toward swimming, waterfront, water, and safety vocabulary, and both Sanity strategies place `program-swim` and `protocol-waterfront-safety` in the usable band.

`prompt-first-time-homesick` is now the clearest remaining Sanity ranking gap. `sanityKeyword` keeps `procedure-homesickness-support` weak at #11, while `sanityHybrid` moves it into the diagnostic band at #9.

`prompt-day-camp-alternative` remains an Implied Need case. The prompt asks for a gentler alternative to overnight camp, not cancellation, refunds, registration, or plan changes. Both Sanity strategies surface `policy-registration-cancellation` at #6, which is diagnostic adjacent-policy behavior rather than proof that semantic retrieval solved a direct source-of-truth need.

## Decision

Keep the MiniSearch deterministic baseline as the retrieval workbench baseline for now. Sanity Hybrid is now close on aggregate ranking quality, but deterministic still has the best Top 5 count and exposes field-level reasons clearly enough to compare future retrieval changes without adding AI Retrieval Planner, Conversational Framing, browser UI, production Sanity schemas, or answer composition.

Use the fixed integrated command as the comparison harness for the next slice. Bridge recall and raw-query noise are no longer the leading issues. The next useful work is Sanity ranking precision for the remaining diagnostic/weak cases, especially first-time homesickness support and adjacent policy ordering. Focus on field projection, source-of-truth policy representation in `contentMap`, and whether Sanity can expose better match reasons before considering bridge-weight tuning.
