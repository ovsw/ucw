# OpenAI Concern Surfacing Plan

## Goal

Add an opt-in OpenAI-backed **Concern Surfacing** path for the retrieval workbench.

The OpenAI call evaluates a **Prompt** against the approved **Concern** catalog and returns:

- existing **Concern** IDs that are semantically suggested by the **Prompt**
- missing **Concern** candidates when the catalog lacks the right concern

It does not select, score, search, or route directly to **Content Entities**.

## Agreed Boundaries

- Keep **Prompt** as the canonical term.
- Keep the existing prototype **Retrieval Planner** as a comparison baseline only.
- Do not use the prototype planner as the implementation pattern for OpenAI.
- Add the OpenAI path behind an explicit `--concern-surfacer=openai` option.
- Load root `.env` in the CLI using Node's native env-file support with a local type guard.
- Require `OPENAI_API_KEY` only when OpenAI concern surfacing is selected.
- Allow optional `OPENAI_RETRIEVAL_PLANNER_MODEL`; if absent, use a real code default, not a placeholder.
- Use the OpenAI Responses API through `fetch`, not the OpenAI SDK.
- Use Structured Outputs plus local Zod validation.
- Give the model only the **Prompt** and compact approved **Concern** catalog.
- Do not give the model the Content Entity inventory.
- Treat missing **Concern** candidates as report-only diagnostics.
- Treat surfaced existing **Concerns** as normal matched Concerns for expansion through `relatedConcerns`.

## Structured Output

The provider result should be a separate `ConcernSurfacingResult`, not a `RetrievalPlan`.

```ts
type ConcernSurfacingResult = {
  surfacedConcerns: Array<{
    concernId: string;
    rationale: string;
  }>;
  missingConcernCandidates: Array<{
    description: string;
    rationale: string;
  }>;
};
```

The result must be validated against the approved Concern catalog:

- `surfacedConcerns[].concernId` must exist in the catalog.
- `missingConcernCandidates` is required, even when empty.
- Invalid provider responses fail loudly when OpenAI surfacing is selected.
- There is no fallback to the prototype planner.

## Retrieval Integration

The normal **Prompt** still runs through the existing retrieval strategies.

OpenAI-surfaced approved **Concerns** are merged into matched Concerns as AI-surfaced Concern matches, then the existing Concern expansion path bridges to related **Content Entities**.

Provider-generated text must not direct-search Content Entities.

Missing Concern candidates must not influence retrieval or ranking.

## Implementation Sequence

1. Add `ConcernSurfacingResult` types and Zod schemas.
2. Add a compact Concern catalog helper derived from fixture/Sanity Concern documents.
3. Add OpenAI concern surfacer config validation for `OPENAI_API_KEY` and optional model override.
4. Add a fetch-based Responses API adapter with Structured Outputs.
5. Add `--concern-surfacer=openai` CLI parsing and root `.env` loading.
6. Add a concern-first Sanity integration path that can merge AI-surfaced Concern IDs into matched Concerns.
7. Update report rendering to show surfaced Concerns and missing Concern candidates.
8. Add tests for config validation, provider response validation, no Content Entity direct-search from AI output, and report diagnostics.

## Documentation Updates Already Made

- `CONTEXT.md` now defines **Concern Surfacing**.
- ADR 0003 records that provider-backed **Concern Surfacing** is opt-in and must not bypass **Concern** relationships.
