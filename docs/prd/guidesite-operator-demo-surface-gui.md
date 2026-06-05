# PRD: GuideSite Operator Demo Surface GUI

## Problem Statement

The current GuideSite MVP proves the guided answer loop through a TypeScript CLI and a plain operator/debug renderer. That is useful for implementation, but it is not enough to demonstrate the product experience. The MVP needs an **Operator Demo Surface** that lets a **Demo Operator** run the canonical **Parent** journey while showing an **Answer Presentation** shaped like the eventual **Parent** experience.

The GUI must not turn the MVP into a self-serve **Parent** product. It must also avoid the default LLM pattern of presenting hedged or uncertain prose. The purpose of the system is to create source-backed **Assembled Answers** that account for the **Visitor**'s real context, and to ask controlled follow-up questions when required **Visitor Context** is missing.

## Solution

Build a Next.js 16, Tailwind 4, and Sanity Studio 5 based **Operator Demo Surface** for one configured **Ultimate Camp Website** instance. The main canvas should foreground a Parent-shaped **Answer Presentation** for the canonical journey. Operator inspection should be available through expandable panels or drawers without competing with the answer.

The first GUI should open directly into the canonical **Parent** journey. It should make controlled **Suggested Prompts** the primary path, allow typed **Prompts** for secondary exploration, persist the current **GuideSite Session** across reloads until a new demo starts, and show a compact **Journey Timeline** as secondary context.

When required **Visitor Context** is missing, the GUI should show a **Context Gathering Response**: a question-led response that asks the smallest complete set of required follow-up questions. It must not present an uncertain **Assembled Answer**. A source-backed **Assembled Answer** should appear only after validation confirms that relevant **Sources of Truth** and required **Visitor Context** are available. Responsible abstention should appear as a helpful next-step state, not as a technical error.

## User Stories

1. As a **Demo Operator**, I want the GUI to open directly into the canonical **Parent** journey, so that I can start a demo without setup friction.
2. As a **Demo Operator**, I want the main canvas to look like the eventual **Parent** experience, so that the demo sells the GuideSite product rather than the debug pipeline.
3. As a **Demo Operator**, I want the surrounding operator shell to stay neutral, so that camp identity belongs to the **Answer Presentation** rather than the tool chrome.
4. As a **Demo Operator**, I want to run one configured **Ultimate Camp Website** instance, so that the MVP avoids tenant and site-switching complexity.
5. As a **Demo Operator**, I want the canonical journey to start from "Is overnight camp right for my 8-year-old?", so that the first demo aligns with the existing MVP contract.
6. As a **Demo Operator**, I want the polished path to use controlled **Suggested Prompts**, so that the demo shows guided decision support rather than generic chat.
7. As a **Demo Operator**, I want to type a freeform **Prompt** when needed, so that I can explore secondary behavior without direct state editing.
8. As a **Demo Operator**, I want controlled reply choices for required questions, so that the canonical demo remains reliable.
9. As a **Demo Operator**, I want freeform replies to required questions to remain possible, so that the system can demonstrate realistic Parent-style input.
10. As a **Demo Operator**, I want selected and freeform replies to become **Prompts**, so that all session changes flow through the GuideSite loop.
11. As a **Demo Operator**, I want no direct **Session State** editing during the demo, so that the system's memory remains credible.
12. As a **Demo Operator**, I want a clear "new demo" action, so that I can reset and demonstrate another **Parent** path.
13. As a **Demo Operator**, I want one **GuideSite Session** to represent one **Parent** path, so that alternate branches do not create hidden state correction complexity.
14. As a **Demo Operator**, I want the current session to persist across browser reloads, so that a demo is not lost accidentally.
15. As a **Demo Operator**, I want a compact **Journey Timeline**, so that I can show prior **Prompts**, learned **Visitor Context**, and open or addressed **Concerns** without showing a chat transcript.
16. As a **Demo Operator**, I want the latest product output to remain the main canvas, so that prior turns provide context without creating replay complexity.
17. As a **Demo Operator**, I want prior turns summarized rather than replayable, so that the MVP avoids frozen source snapshot and historical rendering requirements.
18. As a **Demo Operator**, I want readable inspection summaries, so that I can explain what the system understood without starting from raw JSON.
19. As a **Demo Operator**, I want raw structured output available one level deeper, so that I can debug the run when needed.
20. As a **Demo Operator**, I want prompt understanding summarized in inspection, so that I can explain why follow-up questions were asked.
21. As a **Demo Operator**, I want retrieval and source coverage summarized in inspection, so that I can explain how answer material was selected.
22. As a **Demo Operator**, I want validation results visible in inspection, so that I can explain why an answer appeared, asked for context, or abstained.
23. As a **Demo Operator**, I want run diagnostics in expandable inspection areas, so that technical details do not compete with the Parent-shaped answer.
24. As a **Demo Operator**, I want source titles and lightweight citations in the answer, so that source grounding is visible without exposing internal metadata.
25. As a **Demo Operator**, I want source IDs, field paths, revisions, and retrieval diagnostics in inspection, so that I can audit the source-backed behavior.
26. As a **Demo Operator**, I want editorial gaps surfaced in inspection when missing **Sources of Truth** affect assembly, so that content work becomes visible.
27. As a **Demo Operator**, I do not want an editorial backlog workflow in the first GUI, so that the MVP does not become a content operations tool.
28. As a **Demo Operator**, I want Sanity Studio available separately for content management, so that editing is possible without embedding Studio in the main demo.
29. As a **Demo Operator**, I want links or references from source inspection to the relevant content system where practical, so that source material can be inspected outside the main flow.
30. As a **Demo Operator**, I want live Sanity content to be the default source for the GUI demo, so that the system demonstrates editable **Sources of Truth**.
31. As a **Demo Operator**, I want missing Sanity config to fail loudly in the GUI environment, so that the demo never silently falls back to fixtures.
32. As a developer, I want fixtures reserved for tests and local development, so that production-like demo behavior remains Sanity-backed.
33. As a developer, I want runtime **Session State** storage separate from Sanity content, so that editorial content and visitor-session memory do not blur.
34. As a developer, I want local filesystem persistence acceptable for the first local MVP, so that implementation can start before deployment storage is chosen.
35. As a developer, I want the deployed demo planned around durable KV or a small app database, so that session persistence is not tied to local files.
36. As a developer, I want a thin application service wrapper around the existing GuideSite pipeline, so that Next routes do not depend directly on CLI/store details.
37. As a developer, I want the application service to own session persistence and retrieval defaults, so that UI routes stay shallow.
38. As a developer, I want the application service to shape presentation DTOs, so that the UI renders product output rather than internal run objects.
39. As a developer, I want direct rendering from semantic **Answer Composition** sections, so that the MVP avoids a premature **Answer Component** registry.
40. As a developer, I want citations and selected **Content Entities** rendered text-first, so that the first iteration focuses on **Conversational Framing**.
41. As a developer, I want text placeholders for future card-like UI, so that richer **Answer Components** can be introduced later without blocking the first iteration.
42. As a **Parent** in the represented experience, I want the GuideSite to ask for required context before answering, so that I do not receive a fake or generic Fit assessment.
43. As a **Parent** in the represented experience, I want missing-context questions to feel guided rather than like an intake form, so that I understand why the system is asking.
44. As a **Parent** in the represented experience, I want each required question to include a short rationale when useful, so that I understand its decision relevance.
45. As a **Parent** in the represented experience, I want the GuideSite to ask the smallest complete set of required questions, so that I am not overloaded.
46. As a **Parent** in the represented experience, I want the system to ask both prior sleepaway experience and child readiness when both are required, so that it can later produce an honest Fit answer.
47. As a **Parent** in the represented experience, I want required context questions separated from optional exploration prompts, so that I know what must be answered before the GuideSite can respond.
48. As a **Parent** in the represented experience, I want vague context to trigger a clarifying question when precision matters, so that the system does not hedge around missing facts.
49. As a **Parent** in the represented experience, I want the system to abstain or continue asking context questions if I skip required context, so that it does not invent an answer.
50. As a **Parent** in the represented experience, I want broad **Fit Prompts** to surface relevant implied **Concerns**, so that important decision blockers are not missed.
51. As a **Parent** in the represented experience, I want implied **Concerns** framed as checks worth considering, so that the system does not make assumptions about me.
52. As a **Parent** in the represented experience, I want factual material shown only when relevant or requested, so that I am not forced through a brochure dump.
53. As a **Parent** in the represented experience, I want pricing, dates, and availability omitted from the canonical Fit flow unless relevant, so that logistics do not dilute the readiness question.
54. As a **Parent** in the represented experience, I want source-backed answers only after required context is known, so that answer confidence comes from evidence and context rather than LLM hedging.
55. As a **Parent** in the represented experience, I want no uncertain answer presented as an answer, so that the GuideSite does not become a hallucination machine.
56. As a **Parent** in the represented experience, I want source-backed caveats when rules or source material require them, so that the answer is careful without generic disclaimers.
57. As a **Parent** in the represented experience, I do not want a generic legal, medical, or safety disclaimer by default, so that the answer remains focused and trustworthy.
58. As a **Parent** in the represented experience, I want lightweight citations for factual sections, so that I can see where claims come from.
59. As a **Parent** in the represented experience, I want the first answer surface to prioritize **Conversational Framing**, so that the answer feels guided rather than like a pile of source snippets.
60. As a **Parent** in the represented experience, I want camp-specific identity in the **Answer Presentation**, so that the experience feels like the camp rather than a generic tool.
61. As a **Parent** in the represented experience, I want approved camp media used only when helpful, so that visuals support the answer without becoming a dependency.
62. As a **Parent** in the represented experience, I want **Contact Path** offered only when the system cannot or should not resolve the need, so that contact prompts do not replace decision support.
63. As a reviewer, I want technical provider metadata hidden from the Parent-shaped answer, so that the product claim is controlled answer assembly rather than "powered by model X."
64. As a reviewer, I want provider/model details visible in diagnostics, so that technical behavior remains inspectable.
65. As a reviewer, I want technical failures rendered as product-level states on the main surface and technical details in diagnostics, so that the demo stays coherent.
66. As a reviewer, I want no streaming of partial generation into the answer surface, so that unfinished or ungrounded prose is never shown as product output.
67. As a reviewer, I want a simple loading state until validation completes, so that only validated product output appears.
68. As a reviewer, I want responsible abstention presented as a helpful next-step state, so that it does not look like a pipeline crash.
69. As a reviewer, I want actual pipeline failures presented distinctly from product abstention, so that operational errors are not confused with careful answer behavior.
70. As a reviewer, I want no shareable **Parent** view in the MVP, so that privacy and unauthenticated access expectations do not expand scope.
71. As a reviewer, I want deployment-level access control for the operator-only GUI, so that the MVP avoids a custom auth system.
72. As a reviewer, I want no app-level accounts in the MVP, so that user management does not distract from proving the guided answer loop.
73. As a reviewer, I want the **Operator Demo Surface** desktop-first, so that demo and inspection workflows work well on a laptop.
74. As a reviewer, I want the **Answer Presentation** responsive enough for mobile preview, so that eventual Parent-facing behavior is not ignored.
75. As a reviewer, I want no custom keyboard shortcuts in MVP, so that the demo remains discoverable through visible controls.
76. As a reviewer, I want no product analytics in MVP, so that behavior tracking does not precede a clear measurement plan.
77. As a reviewer, I want run and session data persisted for inspection, so that debugging remains possible without analytics.
78. As a reviewer, I want a minimal theme stub only, so that future brand configuration is not blocked but theming does not become MVP scope.
79. As a future implementer, I want the first GUI to avoid a formal component registry, so that later **Answer Components** are driven by proven needs.
80. As a future implementer, I want the UI modules to be simple but separable, so that presentation mapping, session persistence, and operator inspection can be tested independently.

## Implementation Decisions

- Build the first GUI as an **Operator Demo Surface**, not a self-serve **Parent** product.
- Use Next.js 16, Tailwind 4, and Sanity Studio 5 as the chosen stack.
- Keep the MVP focused on one configured **Ultimate Camp Website** instance.
- Open the GUI directly into the canonical **Parent** journey rather than a generic empty state.
- Make the main canvas a Parent-shaped **Answer Presentation**.
- Keep the surrounding operator shell neutral and quiet.
- Make controlled **Suggested Prompts** the primary demo path.
- Allow typed **Prompts** as secondary exploration.
- Treat selected controlled replies and freeform replies as **Prompts** that run through the same pipeline.
- Persist the current **GuideSite Session** across browser reloads until the **Demo Operator** starts a new demo.
- Treat one **GuideSite Session** as one **Parent** path.
- Require a new demo to show a different answer branch.
- Do not allow direct **Session State** editing during a demo.
- Show a compact **Journey Timeline** as secondary context, not a chat transcript.
- Do not replay prior answers in MVP.
- Show the latest validated product output as the main canvas.
- Introduce a product-level distinction between **Context Gathering Response**, source-backed **Assembled Answer**, responsible abstention, and technical failure.
- Do not present an uncertain answer state.
- Present a **Context Gathering Response** when required **Visitor Context** is missing.
- Keep **Context Gathering Responses** question-led.
- Let **Context Gathering Responses** include short rationales for required questions.
- Do not include source-backed background material in **Context Gathering Responses**.
- Ask the smallest complete set of follow-up questions required before an honest **Assembled Answer** can be created.
- Ask clarifying **Suggested Prompts** when vague **Visitor Context** is not precise enough.
- If required **Visitor Context** is skipped or withheld, continue with context gathering or abstain rather than answering.
- Separate required context questions from optional exploration prompts.
- Present source-backed **Assembled Answers** only when relevant **Sources of Truth** and required **Visitor Context** are available.
- Keep factual material out of an **Answer Composition** unless it is relevant to the **Prompt**, **Visitor Context**, **Constraints**, **Concerns**, or the stated path toward **Decision Confidence**.
- Proactively surface implied **Concerns** for broad **Fit Prompts** when relevant.
- Frame implied **Concerns** as checks worth considering, not assumptions about the **Visitor**.
- Make lightweight citations visible inline for source-backed sections.
- Keep source IDs, revisions, field paths, retrieval results, provider traces, and raw JSON in operator inspection.
- Show readable inspection summaries before raw structured output.
- Use expandable inspection areas rather than separate demo and developer modes.
- Keep technical failure details in diagnostics while the **Answer Presentation** shows the product-level state.
- Show product output only after validation yields a **Context Gathering Response**, source-backed **Assembled Answer**, or responsible abstention.
- Use a simple loading state rather than streaming partial generation.
- Keep provider/model identity out of the Parent-shaped answer.
- Keep provider/model identity available in operator diagnostics.
- Keep generic disclaimers out of the first Parent-shaped answer.
- Use source-backed caveats and composition rules for safety-critical boundaries.
- Reserve **Contact Path** for cases where the GuideSite cannot or should not responsibly resolve the **Visitor**'s need.
- Do not make **Contact Path** a default conversion action in the canonical Fit journey.
- Use live Sanity content as the GUI demo default.
- Fail loudly when required Sanity configuration is missing in the GUI demo.
- Keep fixtures for tests and local development support, not as silent GUI fallback.
- Keep Sanity Studio available as a separate admin route or surface.
- Do not embed Sanity Studio in the main demo flow.
- Do not include content editing in the main demo flow.
- Expose editorial gaps to the **Demo Operator** when missing **Sources of Truth** affect answer assembly.
- Do not build an editorial backlog or workflow in the first GUI.
- Keep runtime **Session State** and **Run State** storage separate from Sanity editorial content.
- Use filesystem persistence only as a first local MVP option.
- Plan deployed runtime storage around durable KV or a small application database.
- Add a thin application service wrapper around the existing GuideSite pipeline.
- Let the application service own session persistence, retrieval defaults, and presentation DTO shaping.
- Keep Next routes shallow and avoid coupling UI handlers to CLI/store internals.
- Render directly from semantic **Answer Composition** sections for the first iteration.
- Do not introduce a formal **Answer Component** registry in the first GUI.
- Render citations and selected **Content Entities** text-first.
- Use text placeholders or stubs for future card-like UI.
- Prioritize **Conversational Framing** in the first **Answer Presentation**.
- Include a minimal theme/config stub for camp identity only.
- Do not build a theme editor or multi-brand system.
- Make the **Operator Demo Surface** desktop-first.
- Keep the **Answer Presentation** responsive enough for mobile preview.
- Do not build a shareable **Parent** view in MVP.
- Rely on deployment-level access control for the operator-only GUI.
- Do not build custom app-level authentication in MVP.
- Do not add product analytics in MVP.
- Persist run/session data for inspection and debugging.
- Do not add custom keyboard shortcuts in MVP.

Major modules to build or modify:

- **Operator Demo Surface shell**: desktop-first page structure, neutral operator chrome, new demo control, loading and product-level states.
- **Answer Presentation renderer**: text-first rendering for **Conversational Framing**, context gathering, citations, selected **Content Entities**, abstention, and source-backed sections.
- **Context Gathering Response mapper**: converts missing-context and validation results into required questions, rationales, and primary/optional prompt groups.
- **GuideSite GUI application service**: thin wrapper over the existing pipeline that manages session IDs, persistence, Sanity-backed retrieval default, and presentation DTOs.
- **Runtime session store abstraction**: local filesystem implementation for first local MVP, with an interface suitable for durable KV or small database adapters.
- **Operator inspection model**: readable summaries for prompt understanding, retrieval, validation, sources, diagnostics, and raw structured output.
- **Journey Timeline model**: compact non-chat summary of prior **Prompts**, learned **Visitor Context**, and **Concerns**.
- **Sanity integration surface**: live-source default, fail-fast config validation, separate Studio/admin access, and optional source inspection links.
- **Minimal theme stub**: one configured camp identity placeholder with no editor or multi-tenant behavior.

## Testing Decisions

- Tests should verify external behavior and product contracts rather than implementation details.
- Existing GuideSite MVP tests for canonical journey behavior, prompt understanding, answer composition contract, patch engine, run store, turn execution, CLI rendering, and Sanity retrieval provide the main prior art.
- Add application service tests with fake stores and fake pipeline adapters.
- Add tests showing GUI service defaults to Sanity-backed retrieval in demo mode and fails loudly when required Sanity config is missing.
- Add tests showing fixtures are available only through explicit local/test configuration, not silent GUI fallback.
- Add session persistence tests showing reload preserves the current **GuideSite Session** and new demo starts a distinct session.
- Add tests showing one session represents one **Parent** path and branch changes require a new demo.
- Add tests showing direct **Session State** editing is not exposed by the application service.
- Add presentation mapping tests for **Context Gathering Response**.
- Add tests showing missing required **Visitor Context** produces required questions rather than an **Assembled Answer**.
- Add tests showing a **Context Gathering Response** can ask multiple required questions when one question would still leave the system unable to answer.
- Add tests showing **Context Gathering Responses** include short rationales when supplied.
- Add tests showing **Context Gathering Responses** do not include source-backed background material.
- Add tests showing vague **Visitor Context** produces a clarifying prompt when precision is required.
- Add tests showing skipped required context produces continued context gathering or abstention, not an answer.
- Add tests showing required questions and optional exploration prompts are visibly distinguished in the presentation DTO.
- Add presentation mapping tests for source-backed **Assembled Answers**.
- Add tests showing an **Assembled Answer** is presented only when required context and relevant sources are available.
- Add tests showing unrelated factual material is omitted even when available from **Sources of Truth**.
- Add tests showing implied **Concerns** are framed as relevant checks rather than assumptions.
- Add tests showing lightweight citations appear inline for source-backed sections.
- Add tests showing source metadata remains in operator inspection rather than the Parent-shaped answer.
- Add tests showing provider/model metadata remains in diagnostics.
- Add tests showing product output is not streamed before validation.
- Add tests showing responsible abstention renders as a next-step state.
- Add tests showing technical failures render distinctly from product abstention.
- Add tests for the readable operator inspection summaries.
- Add tests showing raw JSON remains available one level deeper.
- Add tests for the **Journey Timeline** summary so it does not become a chat transcript.
- Add UI tests for the primary canonical flow: open demo, show required questions, answer controlled prompts, render source-backed answer, inspect sources.
- Add accessibility-oriented tests or checks for controls, dialogs/drawers, focus management, and readable loading/error states.
- Keep tests deterministic by injecting fake pipeline outputs instead of calling OpenAI or live Sanity in ordinary unit tests.
- Gate live Sanity smoke tests behind explicit environment variables if added.

## Out of Scope

- Self-serve **Parent** product behavior.
- A separate shareable **Parent** view.
- Custom app-level authentication.
- User accounts or per-operator audit trails.
- Multi-camp or multi-tenant switching.
- A theme editor or full branding system.
- A production **Answer Component** registry.
- Rich card, table, comparison, or media-heavy UI components.
- Making media required for the first demo slice.
- Embedding Sanity Studio in the main demo flow.
- Content editing in the main demo flow.
- Editorial backlog, export, assignment, or workflow management.
- Product analytics or behavioral event tracking.
- Streaming partial answer generation into the UI.
- Custom keyboard shortcuts.
- Mobile-first full Parent product polish.
- Direct **Session State** editing.
- In-session branch comparison for different Parent replies.
- Historical answer replay.
- Generic legal, medical, or safety disclaimers by default.
- Default conversion CTAs or generic contact prompts.
- Presenting uncertain, hedged, or unsupported answers.
- Silent fallback from live Sanity content to fixtures in the GUI demo.
- Storing runtime **Session State** in Sanity editorial content.

## Further Notes

- This PRD depends on the current glossary terms in `CONTEXT.md`, especially **Operator Demo Surface**, **Context Gathering Response**, **Answer Presentation**, **Assembled Answer**, **Suggested Prompt**, **Journey Timeline**, **Source of Truth**, and **Contact Path**.
- ADR 0004 records that the first **Operator Demo Surface** relies on deployment-level access control rather than custom app-level auth.
- ADR 0005 records that runtime **Session State** is not editorial content and should not be stored in Sanity.
- The existing CLI pipeline and tests remain valuable implementation prior art, but the GUI should present product-level states rather than raw operator/debug output.
- The highest-risk product rule is: no answer should be shown unless it is backed by relevant **Sources of Truth** and required **Visitor Context**. If that condition is not met, the product should ask required questions or abstain.
