# PRD: OpenAI Concern Surfacing

## Problem Statement

The retrieval workbench currently has the shape of an AI-assisted retrieval layer, but the only implemented intelligence is a technical stub: a prototype planner hardcodes one known Implied Need for the gentler day-camp alternative case. That stub can improve the comparison report, but it does so by adding model-like retrieval queries that can direct-search Content Entities, which does not preserve the intended Concern-first architecture.

The desired next step is narrower and more disciplined. The system needs a provider-backed reasoning step that can read a Prompt, compare it against the approved Concern catalog, and surface Concerns that are semantically implied even when they are not lexically obvious. If the Prompt suggests a Concern that is missing from the catalog, the system should report that as an editorial gap rather than bypassing Concern relationships.

## Solution

Add an opt-in OpenAI-backed Concern Surfacer to the retrieval workbench. The Concern Surfacer receives the Prompt and a compact approved Concern catalog, then returns approved Concern IDs plus missing Concern candidates. Surfaced approved Concerns are treated as normal matched Concerns for the existing Concern expansion path. Missing Concern candidates appear in the workbench report only and do not affect retrieval or ranking.

The existing deterministic retrieval, Sanity Keyword retrieval, Sanity Hybrid retrieval, and prototype planned strategy remain available as comparison baselines. The OpenAI-backed path is selected explicitly with a Concern Surfacing option, validates required provider configuration at startup, and fails loudly when provider configuration or provider output is invalid.

## User Stories

1. As a GuideSite developer, I want the AI-backed step to surface Concerns from a Prompt, so that the system can recover concerns that are implied by meaning rather than exact words.
2. As a GuideSite developer, I want the AI-backed step to use the approved Concern catalog, so that it classifies against editorially controlled concepts instead of inventing its own taxonomy.
3. As a GuideSite developer, I want the AI-backed step to return approved Concern IDs, so that existing Concern relationships can drive Content Entity retrieval.
4. As a GuideSite developer, I want missing Concern candidates reported separately, so that catalog gaps become visible without silently changing retrieval behavior.
5. As a GuideSite developer, I want missing Concern candidates to be report-only, so that unapproved concepts do not influence ranking or answer assembly.
6. As a GuideSite developer, I want AI-surfaced approved Concerns to behave like normal matched Concerns, so that the rest of the retrieval system does not need a separate content-routing path.
7. As a GuideSite developer, I want provider-generated output to avoid direct Content Entity search, so that the system does not bypass Concern relationships.
8. As a GuideSite developer, I want the original Prompt to continue running through normal retrieval, so that direct lexical and semantic Sanity retrieval remains comparable.
9. As a GuideSite developer, I want the prototype Retrieval Planner to remain as a comparison baseline, so that current evaluation evidence is not erased.
10. As a GuideSite developer, I want the OpenAI-backed path to be opt-in, so that default workbench runs stay deterministic enough for regular regression checks.
11. As a GuideSite developer, I want OpenAI usage to be explicit in the CLI, so that model calls and provider cost never happen accidentally.
12. As a GuideSite developer, I want missing OpenAI configuration to fail at startup when OpenAI surfacing is selected, so that a misconfigured run does not quietly become a non-AI run.
13. As a GuideSite developer, I want no fallback from OpenAI surfacing to the prototype planner, so that required AI behavior does not degrade into a hardcoded stub.
14. As a GuideSite developer, I want the root `.env` file loaded by the workbench CLI, so that locally configured provider keys are available without shell-specific setup.
15. As a GuideSite developer, I want programmatic workbench APIs to keep accepting explicit environment objects, so that tests can control configuration precisely.
16. As a GuideSite developer, I want model selection to have a real code default with an optional environment override, so that local runs are usable without placeholder config.
17. As a GuideSite developer, I want the OpenAI integration to use fetch, so that the feature does not add SDK dependency churn before the contract proves itself.
18. As a GuideSite developer, I want provider responses validated with Structured Outputs and local schema checks, so that invalid AI output cannot enter retrieval.
19. As a GuideSite developer, I want provider output validated against the approved Concern catalog, so that the model cannot refer to unknown Concern IDs as if they were approved.
20. As a GuideSite developer, I want report output to show surfaced Concerns and missing Concern candidates, so that I can understand what the AI changed and what editorial gaps it found.
21. As a content editor, I want missing Concern candidates to be visible as editorial diagnostics, so that I can decide whether the Concern catalog needs a new Concern.
22. As a content editor, I want the system to avoid automatic Concern creation, so that editorial control stays explicit.
23. As a content editor, I want Content Entity retrieval to continue using related Concerns, so that policies, procedures, and other Sources of Truth remain connected through intentional relationships.
24. As a reviewer, I want the workbench report to distinguish normal retrieval, prototype planning, and OpenAI Concern Surfacing, so that I can compare behavior without confusing the strategies.
25. As a reviewer, I want AI-surfaced Concerns to include rationale, so that I can judge whether the model inferred a Concern for a defensible reason.
26. As a reviewer, I want missing Concern candidates to include rationale, so that I can tell whether a catalog gap is real or just model overreach.
27. As a future implementer, I want Concern Surfacing represented by its own result type, so that it is not mistaken for Retrieval Planning or query generation.
28. As a future implementer, I want small, isolated modules for provider validation, provider calls, result validation, and retrieval merging, so that each part can be tested without invoking the full workbench.
29. As a future implementer, I want the Sanity integration to support explicit AI-surfaced Concern matches, so that the bridge to related Content Entities remains Concern-first.
30. As a future implementer, I want the workbench to fail loudly on invalid provider output, so that regressions surface during evaluation instead of becoming misleading reports.

## Implementation Decisions

- Keep **Prompt** as the canonical term. Do not introduce “Parent Prompt” as a separate domain term.
- Introduce **Concern Surfacing** as the provider-backed AI responsibility. It identifies existing Concerns and possible missing Concerns suggested by the meaning of a Prompt.
- Keep **Retrieval Planner** language for the existing prototype comparison path only. The OpenAI-backed feature is not a Retrieval Planner.
- Leave the current prototype planner in place as a technical baseline, even though it uses hardcoded query generation.
- Add an explicit CLI option named around Concern Surfacing, such as `concern-surfacer=openai`, rather than a planner option.
- Default workbench behavior must not call OpenAI.
- When OpenAI Concern Surfacing is selected, `OPENAI_API_KEY` is required and must be validated before retrieval runs.
- Add an optional model environment variable for the OpenAI Concern Surfacer. If absent, use a real code default rather than a placeholder.
- Load root `.env` in the CLI with Node's native env-file support and a local type guard. Do not add a dotenv dependency for this slice.
- Keep programmatic workbench entrypoints testable with explicit environment objects.
- Use the OpenAI Responses API through the existing fetch-injection style. Do not add the OpenAI SDK for this slice.
- Use provider Structured Outputs and local Zod validation.
- Give the model only the Prompt and a compact approved Concern catalog.
- The compact Concern catalog should contain only Concern-level context needed for classification, such as ID, title, and content map.
- Do not give the model the Content Entity inventory.
- Do not allow provider output to select Content Entities.
- Do not allow provider-generated search text to direct-search Content Entities.
- Use a separate Concern Surfacing result shape rather than a Retrieval Plan.
- The Concern Surfacing result contains surfaced approved Concerns and missing Concern candidates.
- Surfaced approved Concerns include Concern ID and rationale.
- Missing Concern candidates include description and rationale.
- Missing Concern candidates are required in the result shape, even when empty.
- Provider output must be validated so surfaced Concern IDs exist in the approved Concern catalog.
- Invalid provider output fails loudly when OpenAI Concern Surfacing is selected.
- There is no fallback from OpenAI Concern Surfacing to the prototype planner.
- AI-surfaced approved Concerns are merged as normal matched Concerns for the existing Concern expansion path.
- AI-surfaced approved Concerns may carry source metadata so the report can explain that they came from Concern Surfacing.
- Missing Concern candidates do not affect retrieval, ranking, or rank fusion.
- The normal Prompt continues to run through existing retrieval strategies.
- The report should show surfaced Concerns, rationales, and missing Concern candidates separately from normal lexical/semantic retrieval matches.
- The implementation should favor deep, testable modules:
  - Concern catalog extraction from the current corpus.
  - Concern Surfacing result validation.
  - OpenAI Responses API adapter.
  - OpenAI config validation.
  - Concern-first merge of AI-surfaced Concerns into retrieval results.
  - Report rendering for Concern Surfacing diagnostics.

## Testing Decisions

- Tests should cover externally observable behavior rather than implementation details.
- Existing tests for fixture validation, Sanity config validation, Sanity client behavior, retrieval planner behavior, workbench behavior, and report rendering provide the main prior art.
- Add schema tests for Concern Surfacing output validation.
- Add config tests showing `OPENAI_API_KEY` is required only when OpenAI Concern Surfacing is selected.
- Add config tests showing the optional model override is trimmed and the default model is used when omitted.
- Add provider adapter tests using injected fetch to verify request shape and response parsing without hitting OpenAI.
- Add validation tests showing unknown Concern IDs from the provider are rejected.
- Add validation tests showing missing Concern candidates are required but may be empty.
- Add workbench tests showing default runs do not call the OpenAI adapter.
- Add CLI or option parsing tests showing OpenAI Concern Surfacing is selected only by the explicit option.
- Add retrieval integration tests showing surfaced approved Concerns bridge through related Concerns to Content Entities.
- Add retrieval integration tests showing missing Concern candidates do not alter retrieval or ranking.
- Add retrieval integration tests showing provider-generated data does not cause direct Content Entity search.
- Add report tests showing surfaced Concerns and missing Concern candidates appear in the report with rationales.
- Keep tests isolated from real provider calls by injecting fetch or a Concern Surfacer interface.

## Out of Scope

- Building full Answer Composition.
- Adding Conversational Framing.
- Replacing the retrieval system with an LLM planner.
- Letting the model select Content Entities.
- Letting the model generate direct Content Entity queries.
- Automatically creating new Concerns from missing Concern candidates.
- Editing Sanity schemas beyond what is required to read the approved Concern catalog.
- Removing the existing prototype Retrieval Planner comparison path.
- Adding the OpenAI SDK.
- Adding model benchmarking, pricing analysis, or model-routing infrastructure.
- Changing default workbench behavior to call OpenAI.
- Publishing generated answers to Visitors.

## Further Notes

- ADR 0003 records that provider-backed Concern Surfacing is opt-in and must not bypass Concern relationships.
- The domain glossary defines **Concern Surfacing** and states that a missing Concern suggested by a Prompt is an editorial gap, not a reason to bypass Concern relationships.
- The existing root `.env` contains an OpenAI API key for local use. If that key has been shared outside the local machine, it should be rotated before implementation.
