# PRD: Sanity Hybrid Retrieval Workbench

## Problem Statement

The current retrieval workbench proves that a deterministic **Retrieval Strategy** can find the expected **Concerns** and required **Content Entities** for the fixture corpus, but it does not show whether a production-like Sanity retrieval path can rank relevant material better.

The next prototype stage needs to compare the tuned deterministic baseline against Sanity keyword and Sanity hybrid semantic retrieval using the same fictitious fixture corpus. The goal is to learn whether Sanity dataset embeddings and GROQ semantic scoring improve ranking for explicit and semantic-match cases before adding an AI Retrieval Planner or **Conversational Framing**.

The prototype must also keep evaluation metadata separate from retrievable content. Benchmark notes can explain known failure categories, but they must not become searchable source material or contaminate Sanity embeddings.

## Solution

Extend the existing retrieval workbench so it can seed the `generated.json` fixture documents into a real Sanity dataset with embeddings enabled, verify dataset parity, and run a default comparison across three **Retrieval Strategies**:

- deterministic
- sanityKeyword
- sanityHybrid

The main workbench command should become a comparison workflow. If Sanity config is missing or the dataset does not match the local fixture corpus, the workbench should fail loudly. Deterministic-only mode should remain available as an explicit escape hatch.

The comparison report should focus on rank and top-k usefulness, not raw search scores. Top 5 is the main success threshold; top 10 is diagnostic. The report should show where Sanity improves, ties, or regresses against deterministic retrieval, and it should use optional local `evaluationNotes` to classify known failures such as **Implied Need** cases.

## User Stories

1. As a developer, I want to run the workbench against multiple Retrieval Strategies, so that I can compare retrieval quality instead of inspecting one baseline at a time.
2. As a developer, I want the main workbench command to run the full comparison by default, so that the next prototype tests its actual Sanity hypothesis.
3. As a developer, I want deterministic-only mode to be explicit, so that local-only runs do not hide missing Sanity functionality.
4. As a developer, I want missing Sanity config to fail loudly, so that the comparison prototype cannot silently degrade into a deterministic-only test.
5. As a developer, I want required Sanity config to have no dummy fallbacks, so that retrieval results are never produced against an unknown or incorrect dataset.
6. As a developer, I want to seed the generated fixture documents into Sanity, so that Sanity retrieval runs against the same corpus as deterministic retrieval.
7. As a developer, I want Sanity seeding to use `generated.json` as the canonical corpus, so that the broader fixture set drives the comparison.
8. As a developer, I want seeding to upsert fixture documents by ID, so that the Sanity dataset mirrors fixture changes.
9. As a developer, I want seeding to exclude prompt expectations, so that benchmark prompts are not treated as source content.
10. As a developer, I want seeding to exclude evaluation notes, so that failure-analysis metadata does not influence retrieval.
11. As a developer, I want the seed command to verify document ID parity, so that I can detect missing, extra, or stale Sanity documents.
12. As a developer, I want comparison runs to verify document parity before retrieval, so that stale Sanity data cannot produce misleading rankings.
13. As a developer, I want comparison runs to stop when parity fails, so that I know to reseed before trusting the report.
14. As a developer, I want seeding to avoid deleting extra documents by default, so that cleanup is never an accidental side effect.
15. As a developer, I want any destructive cleanup to require an explicit flag, so that prototype data operations remain controlled.
16. As a developer, I want Sanity keyword retrieval as a separate strategy, so that I can distinguish Sanity integration behavior from semantic scoring behavior.
17. As a developer, I want Sanity hybrid retrieval as a separate strategy, so that I can test GROQ keyword scoring plus semantic similarity.
18. As a developer, I want deterministic retrieval to remain in the comparison, so that Sanity results are measured against the tuned baseline.
19. As a developer, I want each strategy to return comparable result IDs and ranks, so that the report can evaluate behavior consistently.
20. As a developer, I want the report to compare rank positions rather than raw scores, so that MiniSearch and Sanity scoring differences do not create false comparisons.
21. As a developer, I want required Content Entities in the top 5 to count as the main success threshold, so that the metric reflects usable answer context.
22. As a developer, I want required Content Entities in the top 10 to count as diagnostic, so that near misses are visible without being treated as full success.
23. As a developer, I want results below top 10 to be treated as weak retrieval, so that technically found but practically unusable results are not overvalued.
24. As a developer, I want missing expected Concerns reported per strategy, so that Concern retrieval failures remain visible.
25. As a developer, I want missing required Content Entities reported per strategy, so that source-of-truth failures remain visible.
26. As a developer, I want top-k counts per strategy, so that improvements and regressions are easy to compare.
27. As a developer, I want average required Content Entity rank per strategy, so that broad ranking shifts are visible.
28. As a developer, I want the report to call out regressions, so that Sanity semantic retrieval does not hide worse behavior behind a few improvements.
29. As a developer, I want the report to call out improvements, so that successful semantic cases are easy to identify.
30. As a developer, I want optional evaluation notes in prompt expectations, so that known edge cases can be classified without changing retrieval content.
31. As a developer, I want evaluation notes to remain local benchmark metadata, so that they never become **Sources of Truth**.
32. As a developer, I want evaluation notes to be excluded from Sanity indexing and embeddings, so that the benchmark cannot train the retriever with its own answer key.
33. As a developer, I want evaluation notes to support `semanticFailure`, so that semantic retrieval misses can be separated from other failures.
34. As a developer, I want evaluation notes to support `impliedNeedFailure`, so that reasoning-dependent gaps are not misclassified as semantic retrieval problems.
35. As a developer, I want evaluation notes to support `fixtureGap`, so that suspected benchmark problems can be documented without changing source content.
36. As a developer, I want the cancellation/change policy case labeled as an Implied Need case, so that Sanity is allowed to surprise us but is not required to solve a reasoning problem.
37. As a developer, I want semantic cases such as bullied, overwhelmed, homesick, and weak swimmer to remain visible, so that Sanity hybrid can be evaluated on the job it is meant to do.
38. As a developer, I want the Sanity dataset to preserve fixture IDs, types, fields, and relationships, so that the comparison remains maximally compatible with previous tests.
39. As a developer, I want the Sanity dataset to be treated as a hosted copy of the fixture corpus, so that this prototype does not become premature production CMS modeling.
40. As a developer, I want setup notes to mention the Sanity `LWJ` coupon, so that the embeddings-enabled trial setup is documented.
41. As a developer, I want the setup notes to include `pnpm create sanity@latest -- --coupon=lwj`, so that project setup is reproducible.
42. As a developer, I want the prototype to avoid adding Sanity Studio unless necessary, so that the next step stays lightweight.
43. As a developer, I want Sanity Studio, if added, to be clearly marked as prototype-only, so that nobody mistakes it for production CMS architecture.
44. As a developer, I want the workbench to keep using the local fixture as the evaluation contract, so that correctness is not defined by whatever happens to be in Sanity.
45. As a developer, I want Sanity retrieval to query only Sanity documents, so that the integration test is real.
46. As a developer, I want the report to compare Sanity result IDs to local fixture expectations, so that retrieval and evaluation stay cleanly separated.
47. As a developer, I want existing deterministic tests to keep passing, so that the previous prototype baseline is not broken.
48. As a developer, I want Sanity integration tests to avoid implementation details, so that tests verify external workbench behavior.
49. As a developer, I want no AI implementation in this stage, so that the prototype stays small and focused.
50. As a product decision maker, I want the report to show what Sanity semantic retrieval improves and does not improve, so that the next prototype step can be chosen based on evidence.
51. As a product decision maker, I want Implied Need failures to be identified, so that future AI Retrieval Planner work is motivated by concrete cases.
52. As a product decision maker, I want the prototype to make failures visible, so that we do not overstate Sanity or deterministic retrieval quality.

## Implementation Decisions

- Continue prototyping inside this repo.
- Keep the Sanity work lightweight and scoped to the existing retrieval workbench.
- Do not start the production GuideSite application in this stage.
- Do not redesign the content model for this stage.
- Treat the Sanity dataset as a hosted copy of the existing fixture corpus.
- Use `generated.json` as the canonical Sanity seed corpus.
- Keep `seed.json` available only as a smaller local fixture.
- Preserve fixture document IDs, `_type` values, fields, and relationships as much as Sanity allows.
- Do not seed `promptExpectations` into Sanity.
- Do not seed `evaluationNotes` into Sanity.
- Keep the local fixture file as the evaluation contract for prompts, expected Concerns, required Content Entities, supporting Content Entities, and evaluation notes.
- Add optional `evaluationNotes` to prompt expectations.
- Keep `evaluationNotes` lightweight and optional.
- Treat `evaluationNotes` as benchmark metadata only, never as searchable content, source material, citation material, Answer Composition context, or Conversational Framing context.
- Initial `evaluationNotes` categories are `semanticFailure`, `impliedNeedFailure`, and `fixtureGap`.
- The Sanity seed workflow upserts fixture documents by ID.
- The Sanity seed workflow verifies document ID parity after upsert.
- The Sanity seed workflow warns about extra prototype-type documents.
- The Sanity seed workflow does not delete extra documents unless a separate explicit cleanup flag is provided.
- The comparison workflow verifies Sanity document ID parity before retrieval.
- The comparison workflow fails before running if Sanity and the local fixture are out of sync.
- The main workbench command defaults to comparing deterministic, Sanity keyword, and Sanity hybrid retrieval once this stage is implemented.
- Deterministic-only mode remains available only as an explicit escape hatch.
- Missing required Sanity config fails loudly when comparison or seeding is requested.
- Required query config includes Sanity project ID, dataset, and API version.
- Required seed config additionally includes a Sanity write token.
- A Sanity read token is optional and needed only when the dataset requires authenticated reads.
- Do not add dummy or placeholder config fallbacks.
- Add a shared Retrieval Strategy interface so deterministic, Sanity keyword, and Sanity hybrid strategies can be evaluated consistently.
- Keep deterministic retrieval as the baseline implementation.
- Add Sanity keyword retrieval as a Sanity-only non-semantic baseline.
- Add Sanity hybrid retrieval using keyword scoring plus `text::semanticSimilarity()` in GROQ.
- Compare rank and top-k behavior, not raw scores.
- Top 5 is the main success threshold.
- Top 10 is the diagnostic threshold.
- Scores from MiniSearch and Sanity are not directly comparable and should not be presented as if they are.
- Cancellation/change policy retrieval for the day camp switch prompt is an Implied Need case.
- Sanity hybrid retrieval may improve Implied Need cases, but it is not required to solve them.
- AI Retrieval Planner implementation is deferred to the next stage.
- Conversational Framing implementation is deferred to a later stage.
- Sanity setup notes should mention using coupon `LWJ` for the extended trial required for embeddings.
- The setup note should include `pnpm create sanity@latest -- --coupon=lwj`.
- Sanity MCP is not currently installed and is not required by the prototype runtime.
- If Sanity MCP is available in an agent environment, agents may use it for Sanity documentation and investigation, but prototype code should use the normal Sanity CLI/client/GROQ APIs.
- Prefer scripts and workbench integration over scaffolding a Sanity Studio.
- Add a Sanity Studio only if it is necessary for enabling, managing, or inspecting the prototype dataset.
- If Sanity Studio is added, clearly mark it as prototype infrastructure.

## Testing Decisions

- Tests should verify external workbench behavior rather than implementation details.
- Keep the existing deterministic retrieval tests as prior art for ranking expectations and required Content Entity coverage.
- Keep fixture contract tests as prior art for schema validation and cross-reference validation.
- Add tests for the shared Retrieval Strategy interface so strategies can be compared through one evaluation path.
- Add tests that deterministic-only mode remains explicit and still works without Sanity config.
- Add tests that comparison mode fails loudly when required Sanity config is missing.
- Add tests that seeding excludes prompt expectations and evaluation notes from the Sanity payload.
- Add tests that parity verification detects missing Sanity IDs.
- Add tests that parity verification detects extra Sanity IDs.
- Add tests that parity verification detects type mismatches where practical.
- Add tests that report metrics are based on rank/top-k behavior rather than raw score comparison.
- Add tests for top 5 and top 10 threshold classification.
- Add tests that evaluation notes are read only during evaluation/reporting and are not passed to retrieval strategies.
- Add tests that known Implied Need notes appear in the report when relevant items rank poorly or are missing.
- Add tests that missing Sanity config does not silently fall back to deterministic mode in the default comparison command.
- Add tests around generated corpus expectations, especially allergy, airport pickup, weak swimmer, bullying/homesickness, packing, and day camp alternative prompts.
- Use integration-style tests for the CLI/report path where possible, because the report is the developer-facing product of this prototype.
- Use unit tests for config validation, fixture-to-Sanity document mapping, parity checking, and evaluation note parsing.
- Do not require live Sanity network calls in the normal unit test suite.
- If live Sanity tests are added, gate them behind explicit environment variables so routine tests remain reliable.

## Out of Scope

- Building the production GuideSite application.
- Building the final Next.js or frontend experience.
- Building the full Sanity production CMS schema.
- Treating the prototype Sanity dataset as editorial architecture.
- Importing prompt expectations into Sanity.
- Importing evaluation notes into Sanity.
- Using evaluation notes as retrieval content, embeddings input, source material, citations, or answer context.
- Implementing an AI Retrieval Planner.
- Implementing Conversational Framing.
- Implementing final Answer Composition or Answer Presentation.
- Solving Implied Need retrieval as a requirement for Sanity semantic search.
- Adding a separate vector database.
- Adding LLM classification.
- Automatically deleting Sanity documents during ordinary seeding.
- Comparing raw MiniSearch and Sanity scores as equivalent values.

## Further Notes

This PRD follows the deterministic-first prototype ADR: the workbench should support multiple Retrieval Strategies behind the same evaluation interface so embeddings or hybrid retrieval can be compared against the deterministic baseline.

This PRD also preserves the controlled answer assembly direction: LLM memory and model knowledge are not Sources of Truth. Sanity retrieval can help find relevant approved source material, but answer generation and AI planning remain separate later stages.

Sanity MCP is helpful for coding agents when researching Sanity documentation or debugging Sanity-specific behavior, but it is not installed at the moment and must not become a dependency of the workbench. The prototype should be runnable through ordinary Sanity tooling and APIs.

The practical question this prototype should answer is: does Sanity hybrid semantic retrieval improve the ranking of relevant Concerns and Content Entities enough to become the likely production retrieval backend, while leaving reasoning-dependent Implied Needs for a later AI Retrieval Planner?

## Sanity Setup Notes

- Use the Sanity `LWJ` coupon for the prototype trial setup.
- Create the initial Sanity project with `pnpm create sanity@latest -- --coupon=lwj`.
- Query workflows require `SANITY_PROJECT_ID`, `SANITY_DATASET`, and `SANITY_API_VERSION`.
- Seed workflows additionally require `SANITY_WRITE_TOKEN`.
- `SANITY_READ_TOKEN` is optional and should only be used when the dataset requires authenticated reads.
- Do not add dummy or placeholder fallbacks for any required Sanity value.
- Sanity MCP is not currently installed in this repo and is optional agent tooling only.
- Prototype runtime code must use the normal Sanity CLI, client, and GROQ APIs rather than MCP.
