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

**Decision Confidence**:
The **Visitor**'s readiness to make or reject a high-consideration choice because their major concerns, constraints, and fit questions have been addressed.
_Avoid_: Conversion, lead readiness, purchase intent

**Prompt**:
The **Visitor**'s stated question, request, or selected starting point in a **GuideSite**, whether typed or chosen.
_Avoid_: Intent, search query

**Suggested Prompt**:
A suggested **Prompt** the **Visitor** can choose to begin, continue, or refine a **GuideSite** exchange.
_Avoid_: Chip, quick reply, CTA, button

**GuideSite Session**:
The ongoing guided interaction where a **Visitor** uses **Prompts**, receives **Assembled Answers**, and follows **Suggested Prompts** toward **Decision Confidence**.
_Avoid_: Chat, conversation, funnel, session

**Constraint**:
A practical limit that can make an otherwise good option unworkable for the **Visitor**.
_Avoid_: Preference, filter

**Concern**:
A worry, expressed or implied by a **Prompt**, that can block **Decision Confidence** until it is answered honestly.
_Avoid_: Objection, FAQ

**Implied Need**:
An unstated issue that matters to a **Visitor**'s situation because of what their **Prompt** logically suggests.
_Avoid_: Hidden intent, inferred keyword, semantic match

**Fit**:
How well an option matches the **Visitor**'s needs, values, **Constraints**, and **Concerns**.
_Avoid_: Match, recommendation, best option

**Answer Composition**:
The structured plan that represents an **Assembled Answer**.
_Avoid_: Evidence, RAG response, generated answer, rendered UI

**Assembled Answer**:
The **GuideSite**'s constructed answer to a **Prompt**, represented by an **Answer Composition** and rendered as an **Answer Presentation**.
_Avoid_: Ungrounded generated answer, generic chatbot answer, freeform response

**Answer Assembly Process**:
The process that turns a **Prompt** into an **Answer Composition** using approved **Sources of Truth** and **Composition Rules**.
_Avoid_: Answer Assembly, RAG pipeline, chatbot flow, generation process

**Retrieval Strategy**:
A method used by the **Answer Assembly Process** to find potentially relevant **Concerns** and **Content Entities** for a **Prompt**.
_Avoid_: Search engine, vector database, Sanity retrieval, RAG retriever

**Conversational Framing**:
AI-authored connective prose in an **Assembled Answer** that interprets the **Prompt**, explains how selected **Sources of Truth** apply, handles uncertainty, and makes the answer feel like a guided exchange rather than a mute component layout.
_Avoid_: Source material, model knowledge, decorative copy, generic chatbot text

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
A reusable visible unit selected by an **Answer Composition** and rendered in an **Answer Presentation**.
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
- A **Parent** is the camp-specific form of a **Visitor**.
- A **Parent** evaluates **Fit** for a **Child**.
- A **GuideSite** helps a **Visitor** reach **Decision Confidence** whether the final decision is yes or no.
- A **GuideSite** adapts to the **Visitor**'s **Prompt**, **Constraints**, and **Concerns**.
- **Decision Confidence** requires the **Visitor**'s major **Constraints** and **Concerns** to be addressed.
- A **Prompt** can suggest an **Implied Need** even when the **Visitor** does not name it directly.
- An **Implied Need** can reveal additional **Concerns** or **Sources of Truth** needed for an **Assembled Answer**.
- A **Suggested Prompt** becomes a **Prompt** when the **Visitor** chooses it.
- A **GuideSite** can offer **Suggested Prompts** before or after an **Assembled Answer**.
- A **GuideSite Session** contains **Prompts**, **Assembled Answers**, and **Suggested Prompts**.
- **Fit** is the judgment a **Visitor** forms before reaching **Decision Confidence**.
- In **Ultimate Camp Website**, **Fit** includes **Child** age, **Child Readiness**, interests, safety expectations, schedule, budget, location, and family values.
- A **Camp Program** can have one or more **Camp Sessions**.
- A **Camp Session** is a scheduled offering that can affect **Fit** through dates, availability, and pricing.
- A **GuideSite** presents an **Answer Presentation** rather than a chat message or static page.
- The **Answer Assembly Process** turns a **Prompt** into an **Answer Composition**.
- The **Answer Assembly Process** uses one or more **Retrieval Strategies** to find relevant **Concerns** and **Content Entities**.
- An **Assembled Answer** is grounded in **Content Entities**.
- An **Answer Composition** selects **Content Entities**, **Entity Fields**, **Answer Components**, and **Conversational Framing**.
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
- A sensitive **Concern** should be addressed with concrete **Sources of Truth** such as policies, protocols, checklists, standards, and procedures rather than unsupported reassurance.
- **Ultimate Camp Website** uses camp-specific **Content Entities**; terms named here are examples, not an exhaustive schema catalog.
- **Content Entities**, **Entity Fields**, **Narrative Content**, **Addressable Blocks**, and **Claims** can be **Sources of Truth**.
- **Composition Rules** constrain use of **Sources of Truth** but are not source material by default.
- Evaluation annotations used to test retrieval quality are not **Sources of Truth** and must not become retrievable content for an **Answer Composition**.
- LLM memory and model knowledge are not **Sources of Truth**.
- Relevant retrieved context is the critical input to an **Answer Composition**.
- **Conversational Framing** is generated by AI, but it is not a **Source of Truth**.
- **Conversational Framing** must be grounded in selected **Sources of Truth**, **Composition Rules**, and the **Prompt**.
- A **GuideSite** should be more than a chatbot and more than a mute component renderer: it uses AI to reason about the **Prompt** and to articulate a grounded, conversational response.
- Asking for a **Prompt** creates a conversational expectation; an **Answer Presentation** that only points at UI components, CMS content, or policy excerpts fails that expectation.
- **Conversational Framing** is part of the visitor experience, not decorative copy: it is the UX layer that explains why the selected **Answer Components** and **Sources of Truth** matter for the visitor's situation.
- Any **Source of Truth** used in an **Answer Composition** requires a **Citation**.
- A **Citation** links part of an **Answer Composition** to the **Source of Truth** it uses.
- An **Assembled Answer** is represented by an **Answer Composition**.
- An **Assembled Answer** is shown to the **Visitor** as an **Answer Presentation**.
- An **Answer Presentation** is rendered from an **Answer Composition**.
- A **Composition Rule** constrains creation of an **Answer Composition** but is not itself answer material.
- An **Answer Component** is selected by an **Answer Composition** and rendered in an **Answer Presentation**.
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
- "Evidence" suggested material that supports an answer from the outside. Resolved: use **Answer Composition** for the structured answer plan assembled from approved source material and components.
- "Rule atom" suggested rules are answer material. Resolved: use **Composition Rule** for logic that governs assembly.
- "Presentation component" was too broad because ordinary applications have many components. Resolved: use **Answer Component** for reusable visible units inside an **Answer Composition**.
- "Intent" sounded too vague and too internal to the visitor. Resolved: use **Prompt** for the visitor's typed or chosen question, request, or starting point.
- "Prompt Starter" was serviceable but awkward. Resolved: use **Suggested Prompt** for a suggested **Prompt** the **Visitor** can choose to begin, continue, or refine the exchange.
- "Generated Answer" suggested freeform AI prose. Resolved: use **Assembled Answer** for the constructed answer represented by an **Answer Composition** and rendered as an **Answer Presentation**.
- "Content atom", "data atom", and "media atom" suggested artificial atomic source material. Resolved: use **Content Entity**, **Entity Field**, **Computable Field**, **Narrative Content**, and **Claim**.
- "Session" is ambiguous because camps also have sessions. Resolved: use **GuideSite Session** for the guided interaction.
- "Human escalation" implied a live support handoff. Resolved: use **Contact Path** for a suggested way to contact a relevant representative.
