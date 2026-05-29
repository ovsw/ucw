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

After the deterministic scoring tune, the main source-of-truth examples now rank in the inspection range:

- `prompt-allergy-epipen` ranks the allergy response protocol at #1, health form requirement at #2, and medical-care policy at #4.
- `prompt-airport-pickup` ranks the airport pickup route at #1.
- `prompt-swim-weak-swimmer` ranks the swimming program at #1 and waterfront safety protocol at #2.
- `prompt-bullying-and-homesickness` ranks the bullying response policy at #1.

No required source-of-truth item is missing in the report output. This is a useful baseline for proving the workbench wiring and fixture contract, but it should not be read as production retrieval quality.

## Remaining Weaknesses

The first tuning pass reduced broad lexical noise from common terms and highly connected Concern expansion by filtering stop words, adding small query aliases, lowering Concern expansion weight, and expanding only from stronger Concern matches.

The remaining weakness is that some required supporting documents are still only weakly implied by the prompt:

- `prompt-day-camp-alternative` ranks `program-day-camp` at #1 and the readiness guide at #2, but `policy-registration-cancellation` remains at #14 because the prompt does not mention registration, cancellation, refunds, or plan changes.
- `prompt-bullying-and-homesickness` ranks the bullying policy at #1, but `procedure-homesickness-support` remains below several related social/readiness documents.
- `prompt-what-to-pack` still gives `session-two-week-classic` the top rank because the prompt explicitly says "two-week session"; the required packing checklist and electronics rule are present at #4 and #2.

The field-level reasons remain useful for diagnosing these cases: they show whether a result came from direct title/content evidence, related Concern titles, or Concern expansion.

## Decision

Keep this MiniSearch baseline as the deterministic retrieval workbench baseline for now. It is deterministic, fixture-backed, and exposes enough ranking detail to compare future retrieval changes without adding embeddings, LLM classification, browser UI, production Sanity schemas, or answer composition.

The next useful improvement is still not a new retrieval stack. The baseline now has complete recall and better top-rank behavior for the observed source-of-truth failures. Further work should focus on explicit query-intent fixtures and ranking expectations for weakly implied supporting documents before adding embeddings.
