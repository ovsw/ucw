# Generated Retrieval Fixtures

The seed fixture at `fixtures/retrieval-workbench/seed.json` stays hand-written and small. The larger corpus is generated from it so the deterministic workbench can be exercised against more distractors without changing the evaluator contract.

## Source inputs

The generator adds a second, larger slice of Canadian Adventure Camp-derived material distilled from the archived design notes:

- `archive/initial-conversation.md`
- `archive/answer-generation.md`

Those notes contribute additional source-like Content Entities for:

- bullying and social safety
- parent communication and escalation
- day camp as a gentler alternative
- counselor supervision
- registration and cancellation policy
- a first-time camper testimonial

## Output

By default the generator writes `fixtures/retrieval-workbench/generated.json` and keeps the same fixture shape as the seed corpus:

- 8 Concern documents
- 25 non-Concern Content Entities
- 12 gold-set Parent Prompts

## Commands

Generate the larger corpus:

```sh
pnpm workbench:generate
```

Write to a different path:

```sh
pnpm workbench:generate -- --output /tmp/generated.json
```

Use a different seed fixture:

```sh
pnpm workbench:generate -- --seed fixtures/retrieval-workbench/seed.json --output fixtures/retrieval-workbench/generated.json
```

## Tuning

To adjust the corpus mix, edit `src/retrieval-workbench/generated-fixture-source.ts`.

To change the contract bounds, edit `src/retrieval-workbench/fixture-schema.ts` and update the corresponding tests together with the generator output.
