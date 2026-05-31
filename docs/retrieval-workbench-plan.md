# Retrieval Workbench Plan

Build a developer-facing prototype that tests whether a **Prompt** can retrieve the right **Concerns** and **Content Entities** before building the full **Answer Assembly Process**.

## Goal

Answer one question first: how can the GuideSite get the right context for a specific **Parent** prompt?

The prototype should evaluate retrieval quality, not final answer quality. It should make failures visible enough to decide whether deterministic retrieval is sufficient or whether embeddings or LLM-based classification are needed.

Build the first workbench as a standalone TypeScript CLI tool. Keep retrieval logic, fixtures, and evaluation independent of the future Next.js and Sanity Studio application scaffold.

## Inputs

- Extracted Canadian Adventure Camp material from the separate extractor app.
- Sanity-shaped fixture documents generated from that extracted material.
- A curated gold set of realistic **Parent Prompts**.

## Fixture Shape

Fixtures should mirror Sanity documents rather than use a parallel generic model.

Common fields for GuideSite **Content Entities**:

- `_id`
- `_type`
- `title`
- `contentMap`
- `relatedConcerns`

Rules:

- `contentMap` is required on every Content Entity.
- `relatedConcerns` is required on every non-Concern Content Entity.
- `relatedConcerns` is optional on Concern entities and means adjacent or overlapping Concerns.
- Type-specific fields stay directly on the document, matching the intended Sanity schema shape.

## Gold Set

Each gold-set prompt should include:

- prompt text
- expected Concern ids
- required Content Entity ids
- optional supporting Content Entity ids
- required Sources of Truth where relevant

Do not include must-not-use Content Entities in the first version.

## Retrieval Strategies

The workbench should support multiple strategies behind one evaluation interface.

Initial strategy:

- `deterministic`

Later comparison strategies:

- `embeddings`
- `llmConcernClassifier`
- `hybrid`

## Deterministic Baseline

The first strategy should use MiniSearch as the baseline full-text retrieval library. Fuse.js can be considered later only for narrow fuzzy lookup needs such as typo-tolerant short-label matching.

The first strategy should:

1. Search Concern documents using prompt text.
2. Expand from matched Concerns to Content Entities through `relatedConcerns`.
3. Search all Content Entities directly using weighted fields.
4. Merge and rank candidate Content Entities.

Initial weighted fields:

- related Concern titles: highest weight
- `contentMap`: high weight
- `title`: medium weight
- `_type`: low weight
- selected type-specific fields: optional lower weight

## Workbench Output

For each prompt, show:

- matched Concerns
- candidate Content Entities
- expected vs actual gold-set results
- field-level match reasons
- which retrieval path found each result
- recall for required Content Entities
- recall for expected Concerns
- missing expected Concerns
- missing required Content Entities
- extra top-ranked distractors
- rank position of required Content Entities

Field-level match reasons should identify the matched field, matched term, and contribution to score.

The first evaluator should print diagnostics rather than fail tests. Add pass/fail thresholds only after the baseline behavior is understood.

## First Slice

1. Define fixture JSON format.
2. Add a small hand-written seed fixture set before building the fixture generator.
3. Use the seed fixtures to lock the fixture shape, evaluator behavior, and report format.
4. Include enough seed content to run the deterministic evaluator immediately: 6 to 8 Concern documents, 15 to 25 non-Concern Content Entities, and 8 to 12 gold-set Parent Prompts.
5. Cover deep allergy/medical-safety and homesickness/readiness areas, plus adjacent distractor areas such as transportation, packing, electronics, sibling attendance, pricing, swimming, and cabin assignments.
6. Implement the deterministic strategy.
7. Render a simple terminal-based workbench report.
8. Build the fixture generator against the proven fixture shape.
9. Generate a larger mixed fixture corpus from extracted Canadian Adventure Camp material.
10. Review failures and decide whether to add embeddings as the next strategy.

Defer a browser-based workbench UI until the terminal report becomes too hard to scan.

## Next Agent Starting Point

Implement the first slice only. Do not scaffold the final Next.js, Tailwind, or Sanity Studio application yet.

Start by creating the minimal TypeScript CLI/tooling needed to run the retrieval workbench. Keep the implementation focused on:

- Sanity-shaped seed fixture JSON.
- gold-set Parent Prompts.
- MiniSearch deterministic retrieval.
- separate matched Concern and matched Content Entity outputs.
- field-level match reasons.
- diagnostic terminal reporting without pass/fail thresholds.

Do not add embeddings, LLM classification, browser UI, production Sanity schemas, or answer composition in the first slice. Those are later comparison or integration layers after the deterministic retrieval baseline is inspectable.
