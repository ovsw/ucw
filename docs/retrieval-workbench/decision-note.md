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

The integrated comparison summary was:

```text
Deterministic: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 25/27, top 10 required content hits: 26/27, weak required content hits: 1/27, average required rank: 2.78
Sanity Keyword: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 17/27, top 10 required content hits: 20/27, weak required content hits: 7/27, average required rank: 5.56, improvements: 3, regressions: 16, ties: 8
Sanity Hybrid: missing expected concerns: 0, missing required content: 0, top 5 required content hits: 16/27, top 10 required content hits: 19/27, weak required content hits: 8/27, average required rank: 5.74, improvements: 4, regressions: 17, ties: 6
```

## Baseline

The deterministic baseline uses `src/retrieval-workbench/deterministic-retrieval.ts`. It builds separate MiniSearch indexes for Concern documents and Content Entities, then merges direct Content Entity matches with Concern-expansion matches through `relatedConcerns`.

The terminal report is rendered from the shared retrieval result shape. It shows expected concerns/content, matched concerns, direct Content Entity matches, merged Content Entity ranking, field-level match reasons, missing required items, and obvious distractors.

## Observed Results

Deterministic remains the strongest baseline. It found every required Content Entity somewhere in the report, placed 25 of 27 required hits in the Top 5 usable band, and placed 26 of 27 in the Top 10 diagnostic band. Its main weaknesses are still implied or multi-intent prompts: `prompt-bullying-and-homesickness` leaves `procedure-homesickness-support` diagnostic, and `prompt-day-camp-alternative` leaves `policy-registration-cancellation` weak.

`sanityKeyword` now behaves like a real two-stage retrieval strategy: it first matches Concerns, then uses those Concerns as a bridge to related Content Entities. The bridge removes all 9 previously missing required Content Entities, but 7 required hits are still weak. Its best cases are literal or highly aligned prompts such as medication, transportation, sibling/cabin evidence, and day camp. It still regresses on allergy support, first-time homesickness support, packing, price/session examples, swimming, and bullying policy rank.

`sanityHybrid` also recovers all 8 previously missing required Content Entities, but its ranking quality is not better than `sanityKeyword` after bridge expansion. It has 16 of 27 required hits in Top 5, 19 of 27 in Top 10, and 8 weak required hits. It helps phone-contact homesickness by moving `procedure-homesickness-support` to the diagnostic band, but does not reliably improve the source-of-truth policy rank.

## Failure Classification

`prompt-bullying-and-homesickness` is still the primary semantic retrieval failure. Bridge expansion recovers every required item somewhere in both Sanity reports, but `policy-bullying-response` remains weak at #12. `sanityHybrid` keeps `procedure-homesickness-support` usable at #4 and the shy-camper testimonial usable at #3, but it does not lift the bullying policy into the diagnostic band.

`prompt-swim-weak-swimmer` is no longer a clear semantic win for Sanity Hybrid after bridge expansion. Both Sanity strategies recover `program-swim` and `protocol-waterfront-safety`, but only in the diagnostic band. Deterministic still ranks the same two required items usable.

`prompt-day-camp-alternative` is still an Implied Need case. The prompt asks for a gentler alternative to overnight camp, not cancellation, refunds, registration, or plan changes. Both Sanity strategies surface `policy-registration-cancellation` as usable adjacent-policy behavior, but it should not be counted as proof that semantic retrieval solved a direct source-of-truth need.

## Decision

Keep the MiniSearch deterministic baseline as the retrieval workbench baseline for now. It is deterministic, fixture-backed, and exposes ranking reasons clearly enough to compare future retrieval changes without adding AI Retrieval Planner, Conversational Framing, browser UI, production Sanity schemas, or answer composition.

Use the fixed integrated command as the comparison harness for the next slice. The next useful work is no longer bridge recall; it is Sanity ranking quality. Focus on Concern ranking precision, bridge weighting, field projection, query text shaping, keyword scoring, semantic weighting, and how source-of-truth policies are represented in `contentMap`. The current evidence does not justify replacing deterministic retrieval with Sanity Hybrid yet.
