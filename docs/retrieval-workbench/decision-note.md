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

On May 31, 2026, the generated fixture corpus was seeded into the configured Sanity dataset from `.sandcastle/.env`. The seed operation upserted all 33 fixture documents from `fixtures/retrieval-workbench/generated.json`, including denormalized `relatedConcernTitles` on Content Entity documents.

The integrated comparison command now completes through the normal report path. The parity check compares fixture-owned documents while ignoring Sanity-managed system documents such as `_.groups.*` and `_.retention._maximum_project`.

The Sanity retrieval queries use score expressions accepted by the configured Content Lake API and avoid dereferenced scoring fields. Content Entity scoring uses the denormalized Concern-title projection so Sanity direct search sees the same Concern vocabulary that the deterministic entity index sees:

```groq
score(
  relatedConcernTitles match text::query($searchQuery),
  title match text::query($searchQuery),
  contentMap match text::query($searchQuery)
)
```

for `sanityKeyword`, and:

```groq
score(
  relatedConcernTitles match text::query($searchQuery),
  title match text::query($searchQuery),
  contentMap match text::query($searchQuery),
  text::semanticSimilarity($searchQuery)
)
```

for `sanityHybrid`.

The Sanity strategies now also run a second Content Entity bridge query after matching Concerns. That query finds Content Entities whose `relatedConcerns[]._ref` intersects the top matched Concern IDs, then merges those bridge hits with direct prompt-to-document hits in TypeScript. Direct Sanity `_score` and matched Concern expansion scores are both preserved as retrieval sources in the shared report shape.

The Sanity query plans also shape parent prompt text before passing it to `text::query($searchQuery)`. The shaping removes deterministic stop words, expands deterministic aliases, adds Sanity-specific vocabulary for direct query fields, and treats "too much" readiness phrasing differently from "how much" price phrasing. Retrieval queries exclude Sanity-managed `_.*` system documents so zero-score system records cannot occupy Content Entity result slots.

The integrated comparison summary was:

```text
Deterministic: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 25/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.78
Sanity Keyword: missing expected concerns: 0, missing required content: 1, top 5 required content hits: 26/27, top 10 required content hits: 26/27, weak required content hits: 0/27, average required rank: 2.15, improvements: 5, regressions: 6, ties: 16
Sanity Hybrid: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 26/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.59, improvements: 5, regressions: 4, ties: 18
```

On June 1, 2026, the comparison added a prototype Retrieval Planner strategy. The planner creates a structured Retrieval Plan with the stated prompt and any known Implied Need searches, then runs Sanity Hybrid retrieval for each planned query and merges rankings with reciprocal-rank fusion. The first planner slice adds the adjacent registration, cancellation, refund, and plan-change policy need for gentler day-camp alternative prompts.

The integrated comparison summary with the planner strategy was:

```text
Deterministic: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 25/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.78
Sanity Keyword: missing expected concerns: 0, missing required content: 1, top 5 required content hits: 26/27, top 10 required content hits: 26/27, weak required content hits: 0/27, average required rank: 2.15, improvements: 5, regressions: 6, ties: 16
Sanity Hybrid: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 26/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.59, improvements: 5, regressions: 4, ties: 18
Sanity Hybrid + Planner: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 27/27, top 10 required content hits: 27/27, weak required content hits: 0/27, average required rank: 2.41, improvements: 5, regressions: 7, ties: 15
```

## Baseline

The deterministic baseline uses `src/retrieval-workbench/deterministic-retrieval.ts`. It builds separate MiniSearch indexes for Concern documents and Content Entities, then merges direct Content Entity matches with Concern-expansion matches through `relatedConcerns`.

The terminal report is rendered from the shared retrieval result shape. It shows expected concerns/content, matched concerns, direct Content Entity matches, merged Content Entity ranking, field-level match reasons, missing required items, and obvious distractors.

## Observed Results

Deterministic remains the local baseline for comparison. It found every required Content Entity somewhere in the report, placed 25 of 27 required hits in the Top 5 usable band, and placed 26 of 27 in the Top 10 diagnostic band. Its main weaknesses are still implied or multi-intent prompts: `prompt-bullying-and-homesickness` leaves `procedure-homesickness-support` diagnostic, and `prompt-day-camp-alternative` leaves `policy-registration-cancellation` weak.

`sanityKeyword` now behaves like a real two-stage retrieval strategy with shaped prompt text and denormalized Concern-title scoring: it first matches Concerns, then uses those Concerns as a bridge to related Content Entities. Query shaping and Concern-title projection lift Top 5 required content hits from 17/27 to 26/27. Its remaining missing required item is `policy-registration-cancellation` for `prompt-day-camp-alternative`.

`sanityHybrid` now recovers all required Content Entities and places 26 of 27 required hits in the Top 5 usable band. The Concern-title projection closes the true Sanity ranking misses: `policy-medical-care` is usable for allergy, and `procedure-homesickness-support` is usable for first-time homesickness. Its only remaining Top 5 miss is `policy-registration-cancellation` at #14 for day-camp alternative.

## Failure Classification

`prompt-bullying-and-homesickness` is no longer the primary Sanity ranking failure after query shaping. Both Sanity strategies now place all required items in the usable band for that prompt, including `policy-bullying-response`.

`prompt-swim-weak-swimmer` is also no longer a Sanity weak spot. Sanity-specific shaping expands swimmer/lake language toward swimming, waterfront, water, and safety vocabulary, and both Sanity strategies place `program-swim` and `protocol-waterfront-safety` in the usable band.

`prompt-first-time-homesick` is no longer a Sanity ranking gap. Context-aware "too much" shaping prevents the prompt from expanding toward pricing vocabulary, and `relatedConcernTitles` gives direct Sanity scoring the "Homesickness and child readiness" vocabulary needed to place `procedure-homesickness-support` in the usable band.

`prompt-day-camp-alternative` remains an Implied Need case for raw retrieval. The prompt asks for a gentler alternative to overnight camp, not cancellation, refunds, registration, or plan changes. `sanityKeyword` does not recover `policy-registration-cancellation`, and `sanityHybrid` surfaces it at #14. The prototype planner adds the adjacent policy need explicitly and lifts `policy-registration-cancellation` to #3 in the `sanityHybridPlanned` result.

## Decision

Keep the MiniSearch deterministic baseline as the retrieval workbench baseline for now. Sanity Hybrid still has the better raw Top 5 count and average required rank on the generated corpus, but deterministic remains the stable local comparator with field-level reasons and no external service dependency.

Use the fixed integrated command as the comparison harness for the next slice. Raw Sanity Hybrid retrieval closes the true semantic Top 5 ranking gaps, and Sanity Hybrid + Planner closes the known Implied Need gap without adding Conversational Framing, browser UI, production Sanity schemas, or answer composition.
