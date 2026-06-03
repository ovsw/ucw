# Ultimate Camp Website

This context defines the language for a new kind of camp website: one that guides parents through a high-consideration decision instead of making them browse a static brochure.

## Language

### GuideSite

**GuideSite**:
A website that guides a visitor through a high-consideration decision by adapting the experience to their prompt, constraints, and concerns.
_Avoid_: AI chatbot, help widget, brochure site, page maze, generic AI website

**Visitor**:
The person using a **GuideSite** to reach confidence about a high-consideration decision.
_Avoid_: User, customer, prospect

**Demo Operator**:
The person running an operator-led demo by impersonating a **Visitor** and entering or selecting **Prompts** as that **Visitor** would.
_Avoid_: Visitor, Parent, user, customer

**Decision Confidence**:
The **Visitor**'s readiness to make or reject a high-consideration choice because their major concerns, constraints, and fit questions have been addressed.
_Avoid_: Conversion, lead readiness, purchase intent

**Prompt**:
The **Visitor**'s stated question, request, or selected starting point in a **GuideSite**, whether typed or chosen.
_Avoid_: Intent, search query

**Factual Prompt**:
A **Prompt** asking for source-backed facts, features, policies, dates, prices, logistics, or other concrete information.
_Avoid_: Data retrieval question, FAQ query

**Fit Prompt**:
A **Prompt** asking whether the offer is suitable for the **Visitor**'s situation, needs, values, **Constraints**, or **Concerns**.
_Avoid_: Qualification question, recommendation request

**Prompt Part**:
A distinct question or request inside a **Prompt** that may need different handling by the **Answer Assembly Process**.
_Avoid_: Sub-query, intent

**Suggested Prompt**:
A suggested **Prompt** the **Visitor** can choose to begin, continue, or refine a **GuideSite** exchange.
_Avoid_: Chip, quick reply, CTA, button

**Suggested Prompt Purpose**:
The reason a **Suggested Prompt** is offered in a **GuideSite Session**.
_Avoid_: CTA type, button category

**GuideSite Session**:
The ongoing guided interaction where a **Visitor** uses **Prompts**, receives **Assembled Answers**, and follows **Suggested Prompts** toward **Decision Confidence**.
_Avoid_: Chat, conversation, funnel, session

**Session State**:
The cross-turn memory of a **GuideSite Session** owned by the GuideSite application.
_Avoid_: Chat history, model memory, prompt context

**Run State**:
The per-**Prompt** working state used by the **Answer Assembly Process** before validated updates are committed to **Session State**.
_Avoid_: Temporary chat, scratchpad, chain of thought

**Visitor Context**:
Information the **Visitor** has provided during a **GuideSite Session** that can help assess **Fit**.
_Avoid_: Customer profile, CRM record, lead data

**Constraint**:
A practical limit that can make an otherwise good option unworkable for the **Visitor**.
_Avoid_: Preference, filter

**Concern**:
A worry, expressed or implied by a **Prompt**, that can block **Decision Confidence** until it is answered honestly.
_Avoid_: Objection, FAQ

**Concern Surfacing**:
The act of identifying existing **Concerns** and possible missing **Concerns** suggested by the meaning of a **Prompt**.
_Avoid_: Intent detection, query expansion, content selection

**Prompt Understanding**:
The AI-assisted part of the **Answer Assembly Process** that decomposes a **Prompt**, identifies factual and **Fit** questions, determines required **Visitor Context**, and performs **Concern Surfacing**.
_Avoid_: Intent detection, prompt rewrite, chatbot planning

**Implied Need**:
An unstated issue that matters to a **Visitor**'s situation because of what their **Prompt** logically suggests.
_Avoid_: Hidden intent, inferred keyword, semantic match

**Fit**:
How well an option matches the **Visitor**'s needs, values, **Constraints**, and **Concerns**.
_Avoid_: Match, recommendation, best option

**Answer Composition**:
The structured plan that represents an **Assembled Answer**, including selected source-backed material, citations, **Conversational Framing**, semantic answer sections, and optional **Answer Components**.
_Avoid_: Evidence, RAG response, generated answer, rendered UI

**Assembled Answer**:
The **GuideSite**'s constructed answer to a **Prompt**, represented by an **Answer Composition** and rendered as an **Answer Presentation**.
_Avoid_: Ungrounded generated answer, generic chatbot answer, freeform response

**Answer Assembly Process**:
The process that turns a **Prompt** into an **Answer Composition** using approved **Sources of Truth** and **Composition Rules**.
_Avoid_: Answer Assembly, RAG pipeline, chatbot flow, generation process

**Answer Material Collection**:
The selected source-backed material gathered during the **Answer Assembly Process** before **Conversational Framing** completes an **Answer Composition**.
_Avoid_: Framing-ready Answer Composition, draft Answer Composition, retrieved answer

**Material Assessment**:
The decision about whether an **Answer Material Collection** is sufficient for normal answer framing or requires **Abstention Framing**.
_Avoid_: Quality score, hallucination check, answer validation

**Retrieval Strategy**:
A method used by the **Answer Assembly Process** to find potentially relevant **Concerns** and **Content Entities** for a **Prompt**.
_Avoid_: Search engine, vector database, Sanity retrieval, RAG retriever

**Retrieval Planner**:
An AI-assisted part of the **Answer Assembly Process** that turns a **Prompt** into a **Retrieval Plan** by naming stated needs, **Implied Needs**, and the questions retrieval should answer.
_Avoid_: Query expansion, intent classifier, prompt rewrite

**Retrieval Plan**:
A structured interpretation of a **Prompt** that guides one or more **Retrieval Strategies** before an **Answer Composition** is created.
_Avoid_: Search terms, generated answer, chain of thought

**Conversational Framing**:
AI-authored connective prose in an **Assembled Answer** that interprets the **Prompt**, explains how selected **Sources of Truth** apply, handles uncertainty, and makes the answer feel like a guided exchange rather than a mute **Answer Component** layout.
_Avoid_: Source material, model knowledge, decorative copy, generic chatbot text

**Abstention Framing**:
A constrained kind of **Conversational Framing** used when an **Answer Material Collection** is not sufficient to answer the **Prompt** safely.
_Avoid_: Failed answer, fallback answer, generic apology

**Content Entity**:
A semantically meaningful source object, including its fields and relevance metadata, that can contribute to an **Assembled Answer**.
_Avoid_: Content atom, data atom, media atom, trust/proof category

**Entity Field**:
A named value on a **Content Entity** that can be used in an **Answer Composition**.
_Avoid_: Atom, chunk

**Computable Field**:
An **Entity Field** that can support deterministic logic.
_Avoid_: Data atom

**Narrative Content**:
Explanatory content that helps address a **Concern** or build **Decision Confidence**.
_Avoid_: Content atom, marketing copy

**Addressable Block**:
A stable subsection of **Narrative Content** that can be cited or used independently in an **Answer Composition**.
_Avoid_: Portable Text block, text chunk, RAG chunk

**Content Map**:
A short, formulaic description of what a **Content Entity** contains and how it may be relevant in an **Answer Composition**.
_Avoid_: Summary, alt text, transcript, embedding metadata

**Claim**:
A **Content Entity** for a sensitive, strategic, reusable, or trust-relevant assertion.
_Avoid_: Simple fact, marketing line

**Source of Truth**:
An approved place where a **GuideSite** may derive factual or explanatory answer material.
_Avoid_: LLM memory, generated content, model knowledge

**Citation**:
A reference from an **Answer Composition** to a **Source of Truth** used for a factual or explanatory part of an **Assembled Answer**.
_Avoid_: RAG citation, footnote, source link

**Composition Rule**:
A constraint, usually evaluated in code or orchestration, that limits how an **Answer Composition** may be created.
_Avoid_: Rule atom, content atom, editor-authored rule

**Answer Component**:
A reusable visible unit that an **Answer Presentation** can render from an **Answer Composition** when the answer needs more than semantic sections and prose.
_Avoid_: Presentation component, React component, generic UI component, template

**Answer Presentation**:
The rendered interface a **Visitor** sees from an **Answer Composition**.
_Avoid_: Answer Composition, generated text, chat message

**Contact Path**:
A suggested way for the **Visitor** to contact the relevant representative when an **Assembled Answer** cannot or should not fully resolve their need.
_Avoid_: Human escalation, support handoff, sales handoff, CTA

### Ultimate Camp Website

**Ultimate Camp Website**:
The first **GuideSite** focused on helping parents decide whether a specific summer camp is right for their child and family.
_Avoid_: Camp brochure, camp chatbot

**Parent**:
The **Visitor** in **Ultimate Camp Website**, evaluating whether a camp is trustworthy, suitable, and practical for their child and family.
_Avoid_: Customer, prospect

**Child**:
The person whose camp experience the **Parent** is evaluating.
_Avoid_: Camper, kid, student

**Child Readiness**:
How prepared a child appears to be for a camp format's separation, independence, and social or emotional demands.
_Avoid_: Maturity, eligibility

**Camp Program**:
A camp offering type that can have one or more **Camp Sessions**.
_Avoid_: Program, activity, track

**Camp Session**:
A scheduled offering of a camp program with specific dates, capacity, availability, and pricing.
_Avoid_: Session, GuideSite Session

## Relationships

- **Ultimate Camp Website** is a camp-specific instance of a **GuideSite**.
- A **GuideSite** serves a visitor who needs confidence before making a high-consideration decision.
- A **Demo Operator** may impersonate a **Visitor** during an operator-led demo.
- A **Demo Operator** is not the **Visitor** whose decision context is being modeled.
- In an operator-led demo, **Prompts**, **Visitor Context**, and **Session State** represent the impersonated **Visitor**, not the **Demo Operator** personally.
- A **Parent** is the camp-specific form of a **Visitor**.
- A **Parent** evaluates **Fit** for a **Child**.
- A **GuideSite** helps a **Visitor** reach **Decision Confidence** whether the final decision is yes or no.
- A **GuideSite** adapts to the **Visitor**'s **Prompt**, **Constraints**, and **Concerns**.
- **Decision Confidence** requires the **Visitor**'s major **Constraints** and **Concerns** to be addressed.
- **Prompt Understanding** interprets a **Prompt** before the system finds related **Content Entities**.
- Every real **Answer Assembly Process** includes **Prompt Understanding** before retrieval or answer assembly.
- **Concern Surfacing** is a responsibility within **Prompt Understanding**.
- The real answer flow should model **Prompt Understanding** as the stage; **Concern Surfacing** can remain visible as a sub-output for evaluation and reporting.
- **Prompt Understanding** may identify retrieval needs, but **Retrieval Strategies** own query construction and source retrieval.
- A **Prompt** can suggest an **Implied Need** even when the **Visitor** does not name it directly.
- A **Prompt** can contain multiple **Prompt Parts**, including both **Factual Prompts** and **Fit Prompts**.
- **Prompt Understanding** may receive a mixed **Prompt**, but its output should separate factual questions from **Fit** questions rather than label a **Prompt Part** as mixed.
- The **Answer Assembly Process** should determine the makeup of a **Prompt** before deciding how each **Prompt Part** should be answered.
- A **Factual Prompt** should be answered from available **Sources of Truth** when sufficient source material exists.
- If sufficient source material for a **Factual Prompt** does not exist, the **Assembled Answer** should say so rather than substitute a **Fit** question.
- A **Fit Prompt** requires relevant **Visitor Context** before a **GuideSite** can assess **Fit** honestly.
- If relevant **Visitor Context** is missing for a **Fit Prompt**, the **GuideSite** should gather that context rather than invent a **Fit** assessment.
- When Visitor Context is missing for a **Fit Prompt**, the **Assembled Answer** may explain which context is needed and offer a **Suggested Prompt** to gather it.
- An **Implied Need** can reveal additional **Concerns** or **Sources of Truth** needed for an **Assembled Answer**.
- A **Suggested Prompt** becomes a **Prompt** when the **Visitor** chooses it.
- A **GuideSite** can offer **Suggested Prompts** before or after an **Assembled Answer**.
- A **GuideSite Session** contains **Prompts**, **Assembled Answers**, and **Suggested Prompts**.
- **Session State** stores cross-turn **Visitor Context**, conversation focus, concern state, current **Suggested Prompts**, answer history, source snapshots, and diagnostics.
- **Run State** stores the current **Prompt**, **Prompt Understanding** output, retrieval results, **Answer Material Collection**, **Material Assessment**, **Conversational Framing**, and final **Answer Composition** for one answer turn.
- **Run State** is storage read and written by **Answer Assembly Process** steps; it does not contain or execute those steps.
- The **Answer Assembly Process** hydrates **Run State** from **Session State** at the start of a turn, writes to **Run State** during the turn, and commits validated updates to **Session State** after an **Answer Composition** is finalized.
- Individual **Answer Assembly Process** steps should read and write **Run State** rather than directly mutating **Session State**.
- A **GuideSite Session** can carry **Visitor Context** forward so later **Assembled Answers** can reason across what the **Visitor** has already shared.
- A **Suggested Prompt Purpose** can include gathering **Fit** context, clarifying **Constraints**, addressing **Concerns**, testing **Fit**, comparing options, offering a **Contact Path**, or handling insufficient answer material.
- Gathering **Fit** context is a primary **Suggested Prompt Purpose** because a **GuideSite** needs to understand the **Visitor**'s situation, prior experience, expectations, **Constraints**, and **Concerns** before it can guide honestly.
- A **GuideSite** may offer **Suggested Prompts** to gather **Fit** context before attempting an **Assembled Answer** or after an answer attempt reveals ambiguity or missing context.
- **Fit** is the judgment a **Visitor** forms before reaching **Decision Confidence**.
- In **Ultimate Camp Website**, **Fit** includes **Child** age, **Child Readiness**, interests, safety expectations, schedule, budget, location, and family values.
- A **Camp Program** can have one or more **Camp Sessions**.
- A **Camp Session** is a scheduled offering that can affect **Fit** through dates, availability, and pricing.
- A **GuideSite** presents an **Answer Presentation** rather than a chat message or static page.
- The **Answer Assembly Process** turns a **Prompt** into an **Answer Material Collection** and then an **Answer Composition**.
- The **Answer Assembly Process** uses one or more **Retrieval Strategies** to find relevant **Concerns** and **Content Entities**.
- The **Answer Assembly Process** can use a **Retrieval Planner** to create a **Retrieval Plan** before running **Retrieval Strategies**.
- A **Retrieval Plan** can include **Implied Needs** that are not directly named in the **Prompt**.
- An **Answer Material Collection** gathers selected **Sources of Truth**, candidate **Answer Components** when useful, **Citations**, diagnostics, caveats, source gaps, and follow-up obligations.
- **Material Assessment** determines whether **Conversational Framing** should answer normally or use **Abstention Framing**.
- **Material Assessment** is determined by **Composition Rules** and source coverage, not by the framing agent.
- An **Assembled Answer** is grounded in **Content Entities**.
- An **Answer Composition** records selected **Content Entities**, **Entity Fields**, **Citations**, **Conversational Framing**, semantic answer sections, and any optional **Answer Components**.
- A **Content Entity** can include relevance metadata such as related **Concerns** and a **Content Map**.
- A **Computable Field** can support deterministic logic.
- **Narrative Content** can address a **Concern** or build **Decision Confidence**.
- An **Addressable Block** allows part of **Narrative Content** to be used or cited without turning it into an atom.
- A **Content Map** helps a **GuideSite** decide when and how a **Content Entity** is relevant to an **Answer Composition**.
- A **Content Map** can support early relevance screening in the **Answer Assembly Process**.
- A **Content Map** is required only when a **Content Entity**'s relevance cannot be reliably inferred from its structured fields, text, or relationships.
- A **Claim** is used for sensitive, reusable, trust-relevant assertions.
- A **Claim** should be backed by **Sources of Truth**.
- A **Concern** may be represented as a **Content Entity** to connect **Prompts** to related **Content Entities**.
- A **Concern** is a primary relevance signal in the **Answer Assembly Process**.
- A missing **Concern** suggested by a **Prompt** should be treated as an editorial gap, not as a reason to bypass **Concern** relationships when finding **Content Entities**.
- A sensitive **Concern** should be addressed with concrete **Sources of Truth** such as policies, protocols, checklists, standards, and procedures rather than unsupported reassurance.
- **Ultimate Camp Website** uses camp-specific **Content Entities**; terms named here are examples, not an exhaustive schema catalog.
- **Content Entities**, **Entity Fields**, **Narrative Content**, **Addressable Blocks**, and **Claims** can be **Sources of Truth**.
- **Composition Rules** constrain use of **Sources of Truth** but are not source material by default.
- Evaluation annotations used to test retrieval quality are not **Sources of Truth** and must not become retrievable content for an **Answer Composition**.
- LLM memory and model knowledge are not **Sources of Truth**.
- Relevant retrieved context is the critical input to an **Answer Composition**.
- **Conversational Framing** is generated by AI, but it is not a **Source of Truth**.
- **Conversational Framing** must be grounded in selected **Sources of Truth**, **Composition Rules**, and the **Prompt**.
- **Conversational Framing** provides the AI-authored text of an **Assembled Answer**, but it is not an **Answer Component**.
- **Conversational Framing** is authored from an **Answer Composition**, not by independently selecting raw retrieval results.
- A complete **Assembled Answer** to a freeform or selected **Prompt** includes **Conversational Framing** unless answer assembly abstains.
- **Conversational Framing** may interpret, sequence, soften, and explain an **Answer Composition**, but it must not introduce factual claims outside that **Answer Composition**.
- **Conversational Framing** uses the **Prompt** to shape relevance, emphasis, and tone, but not as factual evidence.
- **Conversational Framing** relies on **Citations** in the **Answer Composition**; the **Answer Presentation** decides how those citations are shown.
- **Conversational Framing** can be represented as structured passages so an **Answer Presentation** can place prose around semantic answer sections or selected **Answer Components**.
- Normal answer framing is skipped when answer assembly abstains; **Abstention Framing** may explain the diagnostic, follow-up options, or a **Contact Path**.
- **Conversational Framing** may emphasize parts of an **Answer Composition**, but it must not hide required semantic answer sections, selected **Answer Components**, diagnostics, caveats, or source gaps.
- **Suggested Prompts** may be curated, derived from **Concerns**, or AI-authored by the **Answer Assembly Process**, but they remain structured outputs rather than prose hidden inside **Conversational Framing**.
- **Suggested Prompts** can introduce new conversation directions when those directions are labelled by **Suggested Prompt Purpose** and do not present unapproved **Concerns** or unsupported facts as approved source material.
- **Conversational Framing** may introduce or phrase **Suggested Prompts**, but the **Suggested Prompts** themselves remain trackable parts of the **Answer Composition** or **GuideSite Session**.
- **Conversational Framing** is created after answer material has been selected; it is not the same provider-backed step as source selection.
- Prototype workbench runs may evaluate retrieval or composition without **Conversational Framing**, but a real **Assembled Answer** requires **Conversational Framing**.
- A mode that can produce a real **Assembled Answer** must validate required **Conversational Framing** capability before serving answers.
- **Abstention Framing** must not answer the original factual question; it may only explain why the available **Answer Material Collection** is insufficient and what the **Visitor** can do next.
- An abstaining **Assembled Answer** is still represented by an **Answer Composition**.
- An **Answer Composition** explicitly records whether the **Assembled Answer** answers normally or abstains.
- A **GuideSite** should be more than a chatbot and more than a mute **Answer Component** renderer: it uses AI to reason about the **Prompt** and to articulate a grounded, conversational response.
- Asking for a **Prompt** creates a conversational expectation; an **Answer Presentation** that only points at **Answer Components**, CMS content, or policy excerpts fails that expectation.
- **Conversational Framing** is part of the visitor experience, not decorative copy: it is the UX layer that explains why the selected answer material, **Answer Components** when present, and **Sources of Truth** matter for the visitor's situation.
- Any **Source of Truth** used in an **Answer Composition** requires a **Citation**.
- A **Citation** links part of an **Answer Composition** to the **Source of Truth** it uses.
- An **Assembled Answer** is represented by an **Answer Composition**.
- An **Assembled Answer** is shown to the **Visitor** as an **Answer Presentation**.
- An **Answer Presentation** is rendered from an **Answer Composition**.
- A **Composition Rule** constrains creation of an **Answer Composition** but is not itself answer material.
- An **Answer Component** can be selected by an **Answer Composition** and rendered in an **Answer Presentation**.
- A **Contact Path** can appear when an **Assembled Answer** cannot or should not fully resolve the **Visitor**'s need.

## Example dialogue

> **Dev:** "Is the **Ultimate Camp Website** just a better homepage with an AI chat box?"
> **Domain expert:** "No. It is a **GuideSite**: the whole experience guides the parent toward **Decision Confidence**, even when the right decision is not to choose the camp."
>
> **Dev:** "The parent asks, 'Can I trust this camp?' Is that a search query?"
> **Domain expert:** "No. That is a **Prompt**. The GuideSite should respond by addressing the **Concerns** and **Constraints** behind it."
>
> **Dev:** "Should we show a paragraph with sources underneath?"
> **Domain expert:** "No. The system creates an **Assembled Answer**, represents it as an **Answer Composition**, then renders it as an **Answer Presentation**."
>
> **Dev:** "Can the answer just be a set of cards and policy snippets selected from the CMS?"
> **Domain expert:** "No. The **Answer Presentation** needs **Conversational Framing** so the visitor feels answered, not merely redirected to content."

## Flagged ambiguities

- "AI-first website" was used as an early framing, but it centers the technology instead of the visitor's decision. Resolved: use **GuideSite** for the category and **Ultimate Camp Website** for the first camp-specific instance.
- "Visitor" and "Parent" were both used for the person being served. Resolved: use **Visitor** for the broader **GuideSite** role and **Parent** for the **Ultimate Camp Website** role.
- "Conversion" was implied by the website and sales framing, but the domain goal is broader. Resolved: use **Decision Confidence** as the primary goal; conversion is secondary.
- "Readiness" was too broad on its own. Resolved: use **Child Readiness** for a child's preparedness for the camp format's separation, independence, and social or emotional demands.
- "Evidence" suggested material that supports an answer from the outside. Resolved: use **Answer Composition** for the structured answer plan assembled from approved source material and optional **Answer Components**.
- "Rule atom" suggested rules are answer material. Resolved: use **Composition Rule** for logic that governs assembly.
- "Presentation component" was too broad because ordinary applications have many components. Resolved: use **Answer Component** for reusable visible units inside an **Answer Composition**.
- "Intent" sounded too vague and too internal to the visitor. Resolved: use **Prompt** for the visitor's typed or chosen question, request, or starting point.
- "Prompt Starter" was serviceable but awkward. Resolved: use **Suggested Prompt** for a suggested **Prompt** the **Visitor** can choose to begin, continue, or refine the exchange.
- "Generated Answer" suggested freeform AI prose. Resolved: use **Assembled Answer** for the constructed answer represented by an **Answer Composition** and rendered as an **Answer Presentation**.
- "Content atom", "data atom", and "media atom" suggested artificial atomic source material. Resolved: use **Content Entity**, **Entity Field**, **Computable Field**, **Narrative Content**, and **Claim**.
- "Session" is ambiguous because camps also have sessions. Resolved: use **GuideSite Session** for the guided interaction.
- "Human escalation" implied a live support handoff. Resolved: use **Contact Path** for a suggested way to contact a relevant representative.
