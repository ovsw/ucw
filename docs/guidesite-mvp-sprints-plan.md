The right slicing principle:

> **Do not build the whole GuideSite system. Build one useful guided answer loop, then widen it.**

Start with one canonical journey:

```txt
Visitor asks:
“Is overnight camp right for my 8-year-old?”

System:
- extracts child_age = 8
- detects assess_fit intent
- detects homesickness / readiness as likely concerns
- sees missing context
- returns a structured Answer Composition asking one or two useful follow-up questions
- commits the fact and focus to session state
```

That is your first “walking skeleton.” Ugly, narrow, but alive. Software biology, regrettably.

---

# Milestones

## Milestone 1: Walking Skeleton

Goal: prove the full loop works with fake intelligence and fake content.

No OpenAI.
No Sanity.
No clever retrieval.
No beautiful UI.

Just:

```txt
prompt → run → snapshot → hardcoded understanding → hardcoded composition → patch → session
```

## Milestone 2: Structured Understanding

Goal: replace hardcoded understanding with LLM JSON extraction.

The LLM does only this:

```json
{
  "intent": "assess_fit",
  "facts": {},
  "concerns": [],
  "retrievalNeeds": [],
  "contextNeeds": []
}
```

Still no answer-writing.

## Milestone 3: Grounded Retrieval

Goal: retrieve approved content from Sanity-shaped fixtures, then Sanity.

The system can answer from known entities:

- Program
- Policy
- Concern
- Prompt Template
- Source Citation

## Milestone 4: Answer Composition

Goal: produce semantic Answer Composition JSON instead of chatbot prose or UI components.

Example section kinds:

- `summary`
- `concern`
- `context_needs`
- `suggested_prompts`
- `sources`

## Milestone 5: Multi-Turn Memory

Goal: the second answer is better because the first turn updated the session.

Example:

Turn 1:

> Is overnight camp right for my 8-year-old?

System asks:

> Has your child slept away from home before?

Turn 2:

> Yes, with grandparents a few times.

System updates:

```json
"prior_sleepaway_experience": "slept_with_grandparents"
```

Then gives a more confident answer.

## Milestone 6: Operator MVP Demo

Goal: one narrow but believable operator-led GuideSite demo for a camp.

Not a platform.
Not reusable for every niche.
Not a customer-facing UI.
One high-quality guided answer loop with inspectable run diagnostics.

---

# Suggested Sprint Plan

Assume 1-week or 2-week sprints. If solo, I’d probably do 1-week sprints because shorter cycles reduce the odds of disappearing into architecture fog.

---

# Sprint 0: Define the Thin Slice

## Goal

Pick the smallest valuable scenario.

## Build

No code unless you want fixtures.

## Decisions

Choose one canonical visitor journey:

```txt
“Is overnight camp right for my 8-year-old?”
```

Define expected behavior:

1. System extracts child age.
2. System identifies the goal as `assess_fit`.
3. System detects readiness / homesickness context needs.
4. System does not make a recommendation yet.
5. System asks useful follow-up questions.
6. System stores the visitor fact and session focus.

## Issues

### Issue 0.1: Define canonical MVP journey

Acceptance criteria:

- one visitor prompt chosen
- expected extracted facts listed
- expected concerns listed
- expected context needs listed
- expected Answer Composition sections listed

### Issue 0.2: Create fixture content

Create local JSON fixtures:

```txt
program_overnight
policy_homesickness
policy_parent_communication
concern_homesickness
prompt_template_sleepaway_experience
prompt_template_child_readiness
```

Acceptance criteria:

- fixtures exist in repo
- each fixture has stable ID
- each source has title, type, body/summary, and revision/mock version

---

# Sprint 1: Walking Skeleton

## Goal

Build the end-to-end pipeline with hardcoded internals.

This is the most important sprint. Not because it is glamorous, but because it prevents you from building twelve elegant disconnected organs and calling it a body.

## Build

```txt
Visitor prompt
→ create session if needed
→ create run
→ snapshot session
→ hardcoded understanding
→ hardcoded composition
→ hardcoded patch
→ commit patch
→ display operator output
```

## Issues

### Issue 1.1: Define TypeScript types

Create types for:

```txt
SessionState
RunState
Understanding
RetrievalResult
AnswerComposition
SessionPatch
PatchOperation
```

Acceptance criteria:

- types compile
- no `any` for core state objects
- session uses keyed maps for facts and concerns

---

### Issue 1.2: Create in-memory session store

For now, use memory or local JSON storage.

Acceptance criteria:

- can create session
- can read session
- can update session
- session has `revision`

---

### Issue 1.3: Implement run creation

Acceptance criteria:

- new run gets `runId`
- run stores `sessionId`
- run stores `baseSessionRevision`
- run stores copied `snapshot`
- run does not keep reading live session after start

---

### Issue 1.4: Implement hardcoded understanding

For the canonical prompt, return:

```json
{
  "intent": "assess_fit",
  "facts": {
    "child_age": {
      "value": 8,
      "source": "explicit"
    }
  },
  "concerns": ["homesickness"],
  "retrievalNeeds": ["overnight_readiness", "homesickness_support"],
  "contextNeeds": ["prior_sleepaway_experience", "child_readiness"]
}
```

Acceptance criteria:

- canonical prompt produces expected object
- unknown prompt returns safe fallback

---

### Issue 1.5: Implement hardcoded Answer Composition

Return:

```txt
status = needs_context
summary section
context_needs section
suggested_prompts section
```

Acceptance criteria:

- output displays from semantic composition sections
- no freeform answer object is needed
- suggested prompt appears as a structured object

---

### Issue 1.6: Implement patch commit

Acceptance criteria:

- patch includes `baseRevision`
- commit succeeds when revision matches
- commit increments revision
- duplicate `runId` does not apply twice

---

# Sprint 2: Patch Engine and Run Logging

## Goal

Make state updates reliable before adding AI chaos. A wise move, so naturally most teams skip it.

## Build

Real patch operation handling.

## Issues

### Issue 2.1: Implement patch operations

Support:

```txt
upsertFact
upsertConcern
setFocus
replaceSuggestedPrompts
updateSummary
```

Acceptance criteria:

- each operation has tests
- invalid operation fails validation
- patch does not mutate input objects directly

---

### Issue 2.2: Add optimistic concurrency

Acceptance criteria:

- commit fails if `patch.baseRevision !== session.revision`
- failed commit does not partially update session
- conflict error is explicit

---

### Issue 2.3: Persist run state

Use database later. For now, local store is fine.

Acceptance criteria:

- run stores prompt, snapshot, understanding, composition, patch, status
- developer can inspect run JSON
- failed runs are saved with diagnostics

---

### Issue 2.4: Add golden-path tests

Acceptance criteria:

- canonical prompt creates expected session patch
- committed session has child age, concern, focus, suggested prompts, summary
- same run cannot be committed twice

---

# Sprint 3: LLM Prompt Understanding v1

## Goal

Replace hardcoded understanding with structured LLM extraction.

Do not let the LLM compose final answers yet. Keep the beast in a small cage. 🦝

## Build

LLM call:

```txt
prompt + session snapshot → structured understanding JSON
```

## Issues

### Issue 3.1: Create understanding JSON schema

Acceptance criteria:

- schema validates intent
- schema validates facts
- schema validates concerns
- schema validates retrieval needs
- schema validates context needs

---

### Issue 3.2: Implement LLM understanding call

Acceptance criteria:

- LLM response is parsed as JSON
- invalid JSON fails safely
- invalid schema fails safely
- raw LLM output is stored in run diagnostics for debugging

---

### Issue 3.3: Add extraction tests

Use 10 sample prompts:

```txt
Is overnight camp right for my 8-year-old?
My child is shy and has never slept away from home.
What happens if my son gets homesick?
Show me dates and prices.
Can I trust your staff?
```

Acceptance criteria:

- child age extraction works
- concerns are detected
- unsupported facts are not invented
- missing context needs are identified

---

### Issue 3.4: Add fact validation

Acceptance criteria:

- explicit facts can be committed
- inferred facts require allowed keys
- unknown fact kinds are rejected
- fact conflicts are handled as `disputed` or ignored for MVP

---

# Sprint 4: Retrieval v1 with Fixtures

## Goal

Retrieve source material from local fixtures before integrating Sanity.

Yes, fake the CMS first. The point is to prove the retrieval contract, not admire your GROQ queries in the moonlight.

## Build

```txt
retrievalNeeds + concerns → fixture source results
```

## Issues

### Issue 4.1: Define source fixture schema

Fields:

```txt
sourceId
sourceType
title
body
summary
concernIds
fieldPath
sourceRevision
```

Acceptance criteria:

- source IDs are stable
- source type is explicit
- source revision exists, even if mocked

---

### Issue 4.2: Implement retrieval adapter interface

Example:

```ts
interface RetrievalAdapter {
  retrieve(input: RetrievalInput): Promise<RetrievalResult[]>;
}
```

Acceptance criteria:

- fixture adapter implements interface
- retrieval results include source refs
- results are ranked or ordered

---

### Issue 4.3: Retrieve by concern

Acceptance criteria:

- `homesickness` retrieves homesickness policy
- unknown concern returns empty result
- retrieval result is stored in Run State

---

### Issue 4.4: Add source citations to composition

Acceptance criteria:

- factual composition sections can include `sourceRefs`
- operator output displays source titles
- every cited source maps to retrieval result

---

# Sprint 5: Answer Composition + Operator Renderer

## Goal

Make the answer a structured decision object, not chatbot prose.

The MVP output is not a component tree. It is semantic Answer Composition JSON plus a plain operator/debug renderer that makes the run inspectable.

## Build

```txt
understanding + retrieval results
→ semantic Answer Composition
→ plain operator/debug output
```

No component registry.
No React prop schemas.
No polished cards, panels, or CTAs.

## Issues

### Issue 5.1: Define semantic Answer Composition contract

Initial section kinds:

```txt
summary
answer
concern
context_needs
suggested_prompts
sources
escalation
```

Acceptance criteria:

- composition has `status`, `conversationalFraming`, `sections`, `citations`, `suggestedPrompts`, and `diagnostics`
- section kinds are semantic, not UI component names
- sections do not contain visual props, layout hints, or interaction handlers
- unknown section kind fails validation

---

### Issue 5.2: Compose `needs_context` answer

For:

```txt
Is overnight camp right for my 8-year-old?
```

System returns:

```txt
status = needs_context
conversationalFraming
summary section
context_needs section
suggested_prompts section
sources section if sources are available
```

Acceptance criteria:

- answer does not make a recommendation yet
- factual statements include source refs or are framed as context needs
- plain operator renderer can display the composition and raw JSON

---

### Issue 5.3: Compose factual concern answer

For:

```txt
What happens if my child gets homesick?
```

System returns:

```txt
status = answered or partial
conversationalFraming
summary section
concern section
sources section
suggested_prompts section if useful
```

Acceptance criteria:

- answer uses retrieved fixture content
- no unsupported claims
- source refs are visible in the operator/debug output
- raw composition remains easy to inspect

---

### Issue 5.4: Suggested prompts from templates

Acceptance criteria:

- prompts are generated from `contextNeeds`
- prompts use approved template IDs
- LLM-generated prompt text is not committed directly

---

### Issue 5.5: Add plain operator/debug renderer

Acceptance criteria:

- displays prompt, run ID, session ID, and base revision
- displays conversational framing
- displays semantic sections in a readable plain format
- displays source titles, IDs, types, field paths, and revisions when available
- displays raw Answer Composition JSON
- does not require a customer-facing frontend scaffold

---

# Sprint 6: Validation Layer

## Goal

Before adding more capability, add guardrails.

The system should refuse bad compositions before committing session state or displaying final output.

## Issues

### Issue 6.1: Validate Answer Composition shape

Acceptance criteria:

- every section validates against the semantic composition contract
- unknown section kinds fail validation
- invalid composition status fails validation
- validation result is saved in Run State

---

### Issue 6.2: Validate source coverage

Acceptance criteria:

- factual sections require source refs
- source refs must exist in retrieval results
- unsupported source refs fail validation
- known context needs and questions can pass without source refs

---

### Issue 6.3: Validate suggested prompts

Acceptance criteria:

- prompt must have template ID or approved generation reason
- unsafe prompt text is rejected
- unknown context need does not create prompt

---

### Issue 6.4: Add safe fallback composition

Acceptance criteria:

If validation fails, the operator renderer displays:

```txt
“I don’t have enough verified information to answer that confidently.”
```

and diagnostics explaining which validation checks failed.

The unsafe composition is saved in Run State diagnostics for debugging, but is not committed as final output.

---

# Sprint 7: Multi-Turn Memory

## Goal

Make the session useful across turns.

## Build

The second turn should use facts from the first turn.

## Issues

### Issue 7.1: Read prior facts from snapshot

Acceptance criteria:

- run snapshot includes committed facts
- LLM understanding receives session summary and facts
- second turn can reference prior known context

---

### Issue 7.2: Handle follow-up answer

Example:

Turn 1:

```txt
Is overnight camp right for my 8-year-old?
```

Turn 2:

```txt
She has slept at her grandparents' house a few times.
```

Acceptance criteria:

- system infers this answers `prior_sleepaway_experience`
- fact is committed
- focus context needs are updated

---

### Issue 7.3: Mark concern addressed

Acceptance criteria:

- after answering homesickness with source support, concern can move from `open` to `addressed`
- unresolved concerns remain `open`
- concern status change is patch-based

---

### Issue 7.4: Update session summary

Acceptance criteria:

- summary stays compact
- summary reflects active facts and concerns
- summary does not include full transcript

---

# Sprint 8: Sanity Retrieval Integration

## Goal

Integrate the already developed Sanity retrieval path into the GuideSite run pipeline.

Do this only after the fixture version works. Otherwise you’ll be debugging state, schemas, GROQ, LLM output, and answer composition all at once.

## Issues

### Issue 8.1: Align MVP source contract with existing Sanity-shaped retrieval

Minimum:

```txt
Concern
Policy
Program
PromptTemplate
```

Optional:

```txt
Testimonial
FAQ
StaffStandard
```

Acceptance criteria:

- GuideSite retrieval input maps to the existing Sanity retrieval strategy inputs
- Sanity retrieval results normalize to the same MVP `RetrievalResult` shape used by fixtures
- source refs include stable document ID, source type, title, field path where possible, and revision metadata where available
- fixture adapter remains the default for local deterministic tests

---

### Issue 8.2: Wire Sanity retrieval adapter into the run pipeline

Acceptance criteria:

- adapter implements same `RetrievalAdapter` interface
- fixture adapter can still be used in tests
- Sanity results normalize to same retrieval result shape
- missing required Sanity config fails loudly when Sanity retrieval is selected

---

### Issue 8.3: Retrieve approved content only

Acceptance criteria:

- draft/unapproved content is excluded
- source refs include Sanity document ID
- source refs include field path where possible

---

### Issue 8.4: Add operator source display

Acceptance criteria:

- operator can see source title
- operator can inspect source ID, type, field path, and revision metadata
- output makes clear answers are based on verified camp info
- no citation drawer or polished customer UI is required

---

# MVP Exit After Sprint 8

The initial MVP is complete when an operator can run the canonical journey and inspect:

- prompt
- session snapshot
- structured understanding
- retrieval results from fixtures or Sanity
- validated Answer Composition
- validation diagnostics
- session patch
- committed Session State

The MVP does not need:

- recommendation cards
- verdict panels
- homepage modes
- persistent customer session UI
- browse-all-info flows
- polished customer-facing rendering

Those belong to post-MVP productization.

---

# What I would build first, literally

Your first 10 issues should be:

1. Add `SessionState` and `RunState` types.
2. Add in-memory session store with `revision`.
3. Add `createRun()` with session snapshot.
4. Add hardcoded understanding for one prompt.
5. Add patch operation types.
6. Add `commitPatch()` with revision check.
7. Add `AnswerComposition` type.
8. Add plain operator/debug renderer for semantic composition sections.
9. Add canonical end-to-end test.
10. Add run JSON debug view.

That gives you a working spine.

Then you add intelligence.

Not before.

---

# Suggested folder structure

```txt
/src
  /guidesite
    /state
      sessionTypes.ts
      runTypes.ts
      patchTypes.ts
      patchEngine.ts
      sessionStore.ts

    /understanding
      understandingTypes.ts
      hardcodedUnderstanding.ts
      llmUnderstanding.ts
      understandingSchema.ts

    /retrieval
      retrievalTypes.ts
      fixtureRetrieval.ts
      sanityRetrieval.ts

    /composition
      compositionTypes.ts
      composeAnswer.ts
      validateComposition.ts
      operatorRenderer.ts

    /fixtures
      policies.json
      programs.json
      concerns.json
      promptTemplates.json

    /tests
      canonicalJourney.test.ts
      patchEngine.test.ts
      validation.test.ts
```

---

# The development order in one sentence

Build this sequence:

```txt
hardcoded loop
→ real state engine
→ LLM understanding
→ fixture retrieval
→ semantic Answer Composition
→ validation
→ multi-turn memory
→ Sanity retrieval
→ operator MVP demo
```

That order matters.

If you start with Sanity, you’ll drown in content modeling.

If you start with OpenAI, you’ll drown in nondeterminism.

If you start with UI polish, you’ll leave the MVP boundary.

Start with the guided answer loop. Then widen it.
