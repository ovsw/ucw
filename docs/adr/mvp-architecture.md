# GuideSite MVP State Architecture Design Document

## 1. Purpose

This document defines the MVP architecture for managing conversational state in a GuideSite experience.

The system uses two state objects:

1. **Session State**: compact, durable memory for the whole visitor conversation.
2. **Run State**: full working trace for a single conversational turn.

The core pattern is:

```txt
Session State → session snapshot in Run State → pipeline writes Run State → validated Session Patch → Session State
```

The goal is to keep the system testable, replayable, and resistant to hidden state mutation while avoiding unnecessary architecture complexity for the MVP.

---

# 2. Product Context

GuideSite is an intent-first website architecture where the visitor asks questions, expresses concerns, or explores options, and the system assembles a personalized decision experience from verified content.

The system should not behave like a generic chatbot.

It should produce source-backed UI compositions such as:

- answer summaries
- recommendation cards
- concern cards
- comparison tables
- context-needs panels
- suggested prompts
- source/proof drawers
- human escalation CTAs

The LLM may help interpret intent and orchestrate the response, but it must not invent facts, policies, prices, recommendations, or claims.

---

# 3. MVP Goals

The MVP should prove that the system can:

1. Read compact prior session context.
2. Understand the current visitor prompt.
3. Extract structured facts, concerns, retrieval needs, and context needs.
4. Retrieve verified content from Sanity.
5. Compose a source-backed UI response.
6. Validate the response before committing state.
7. Produce an explicit patch to update session memory.
8. Commit the patch safely using optimistic concurrency.
9. Keep each run replayable and debuggable.

---

# 4. Non-Goals for MVP

The MVP should not include:

- complex multi-intent prompt-part tracking
- permanent missing-concern candidate workflows
- long-term analytics
- deep interaction ledgers inside live session state
- session-level source snapshot archives
- complex answer-history storage in session state
- freeform LLM-generated suggested prompts
- autonomous content summarization without source constraints
- advanced personalization beyond the current session
- multi-user account memory

These may be added later if product testing proves they are necessary.

---

# 5. Core Design Principles

## 5.1 Session State is compact current memory

Session State should represent the current useful understanding of the visitor, not the full history of everything that happened.

Full historical traces belong in Run State logs or analytics storage.

## 5.2 Run State is the full turn trace

Run State captures the complete lifecycle of one conversational turn:

- prompt
- session snapshot
- structured understanding
- retrieval results
- UI composition
- validation result
- session patch
- diagnostics

This makes each turn replayable and testable.

## 5.3 Only Start Run reads live Session State

At the beginning of a run, the system copies the relevant live Session State into `runState.snapshot`.

After that, the run works only from its own snapshot and internal state.

## 5.4 Only Commit Patch writes live Session State

The pipeline does not mutate Session State directly.

At the end of the run, it produces a `sessionPatch`.

The patch is validated and then committed atomically.

## 5.5 The LLM proposes; the system validates

LLM outputs are not trusted session facts until they pass validation and are transformed into patch operations.

This applies to:

- visitor facts
- concerns
- context needs
- suggested prompts
- UI blocks
- answer claims

## 5.6 UI composition is first-class

The answer is not just prose.

The answer is a structured UI composition made from approved components and source-backed data.

## 5.7 Recommendations require deterministic support

The system must not label something “best fit,” “recommended,” “safe,” “affordable,” or “available” unless that label is produced by approved rules or verified source data.

---

# 6. High-Level Architecture

```txt
Visitor Prompt
   ↓
Start Run
   ↓
Session Snapshot
   ↓
Prompt Understanding
   ↓
Sanity Retrieval
   ↓
Compose UI + Validate
   ↓
Build Session Patch
   ↓
Commit Patch
   ↓
Render Answer
```

---

# 7. Core Objects

## 7.1 Session State

Session State is durable conversation memory.

It should be small, current, and easy to hydrate into future runs.

### MVP Shape

```json
{
  "schemaVersion": 1,
  "sessionId": "session_123",
  "revision": 1,
  "status": "active",
  "createdAt": "ISO_DATE",
  "updatedAt": "ISO_DATE",

  "visitorFacts": {},

  "concerns": {},

  "focus": {
    "goal": null,
    "contextNeeds": []
  },

  "suggestedPrompts": [],

  "summary": ""
}
```

---

## 7.2 Visitor Facts

Facts should be stored as keyed objects, not arrays.

### Example

```json
{
  "visitorFacts": {
    "child_age": {
      "value": 8,
      "source": "explicit",
      "sourceRunId": "run_1",
      "status": "active"
    }
  }
}
```

### Rules

- Use stable keys such as `child_age`, `budget`, `available_dates`, `prior_sleepaway_experience`.
- `source` should mean provenance, not confidence.
- Valid `source` values:
  - `explicit`
  - `inferred`

- Valid `status` values:
  - `active`
  - `superseded`
  - `disputed`

For MVP, avoid numeric confidence unless it is genuinely used by logic.

---

## 7.3 Concerns

Concerns should also be keyed by stable concern IDs.

### Example

```json
{
  "concerns": {
    "homesickness": {
      "status": "open",
      "sourceRunIds": ["run_1"]
    },
    "bullying": {
      "status": "addressed",
      "sourceRunIds": ["run_2"]
    }
  }
}
```

### Valid concern statuses

```txt
open | addressed | deferred
```

### Rules

- Only confirmed concerns should be committed to Session State.
- Possible or weak concerns should remain in Run State.
- MVP should not persist `missingConcernCandidates`.

---

## 7.4 Focus

Focus represents the current conversational direction.

### Example

```json
{
  "focus": {
    "goal": "assess_fit",
    "contextNeeds": ["prior_sleepaway_experience", "child_readiness"]
  }
}
```

### Valid goals

```txt
answer_factual
assess_fit
gather_context
address_concern
compare_options
```

### Rule

Session State should store open needs, not run-local IDs.

Avoid this:

```json
{
  "openPromptPartIds": ["part_2"]
}
```

Use this instead:

```json
{
  "contextNeeds": ["prior_sleepaway_experience"]
}
```

---

## 7.5 Suggested Prompts

Suggested prompts should be validated system objects, not freeform LLM output.

### Example

```json
{
  "suggestedPrompts": [
    {
      "id": "sp_1",
      "text": "Has your child slept away from home before?",
      "purpose": "gather_info",
      "contextNeeds": ["prior_sleepaway_experience"],
      "concerns": ["homesickness"],
      "templateId": "ask_sleepaway_experience"
    }
  ]
}
```

### Rules

Suggested prompts should come from:

1. approved templates
2. known context needs
3. approved concern flows

The LLM may propose prompt intent, but final prompt text should be validated or generated from a controlled template.

---

# 8. Run State

Run State is the working state for one conversational turn.

It is not the source of truth for the session, but it is the source of truth for debugging and replaying that turn.

## MVP Shape

```json
{
  "schemaVersion": 1,
  "runId": "run_2",
  "sessionId": "session_123",
  "baseSessionRevision": 1,

  "status": "started",

  "prompt": {
    "text": "Is overnight camp right for my 8-year-old?",
    "source": "typed",
    "selectedSuggestedPromptId": null
  },

  "snapshot": {
    "visitorFacts": {},
    "concerns": {},
    "focus": {
      "goal": null,
      "contextNeeds": []
    },
    "suggestedPrompts": [],
    "summary": ""
  },

  "understanding": null,

  "retrieval": null,

  "composition": null,

  "validation": null,

  "patch": null,

  "diagnostics": []
}
```

---

# 9. Run Lifecycle

## Step 1: Start Run

### Reads

Live Session State.

### Writes

New Run State.

### Responsibilities

- Generate `runId`.
- Read current Session State.
- Copy relevant Session State into `runState.snapshot`.
- Store `baseSessionRevision`.
- Store current visitor prompt.
- Set run status to `started`.

### Invariant

After this step, the run must not read live Session State again.

---

## Step 2: Understand Prompt

### Reads

- `runState.prompt`
- `runState.snapshot`

### Writes

`runState.understanding`

### External Calls

OpenAI API or equivalent LLM.

### Output Shape

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
  "possibleConcerns": ["first_time_overnight_readiness"],
  "retrievalNeeds": ["overnight_readiness", "homesickness_support"],
  "contextNeeds": ["prior_sleepaway_experience", "child_readiness"]
}
```

### Rules

- This step may propose facts, concerns, retrieval needs, and context needs.
- These are not trusted session updates yet.
- They must be validated before being transformed into a patch.

---

## Step 3: Retrieve Sources

### Reads

- `runState.understanding.retrievalNeeds`
- `runState.understanding.concerns`
- relevant visitor facts from `runState.snapshot`

### Writes

`runState.retrieval`

### External Calls

Sanity Dataset.

### Output Shape

```json
{
  "needs": ["overnight_readiness", "homesickness_support"],
  "results": [
    {
      "sourceId": "policy_homesickness",
      "sourceType": "policy",
      "title": "Homesickness Policy",
      "rank": 1,
      "fieldPath": "summary",
      "sourceRevision": "sanity_rev_abc123"
    }
  ]
}
```

### Rules

- Retrieval should return structured source references.
- Source references should identify source type, source ID, field path, and revision if available.
- The system should avoid relying on unapproved draft content.

---

## Step 4: Compose UI and Validate

### Reads

- `runState.prompt`
- `runState.snapshot`
- `runState.understanding`
- `runState.retrieval`
- component registry
- validation rules
- safety rules
- suggested prompt templates

### Writes

- `runState.composition`
- `runState.validation`

### Composition Shape

```json
{
  "compositionId": "answer_2",
  "status": "needs_context",
  "blocks": [
    {
      "type": "AnswerSummary",
      "props": {
        "text": "Overnight camp may be a fit, but I need a little more context before recommending it confidently."
      },
      "sourceRefs": []
    },
    {
      "type": "ContextNeedsPanel",
      "props": {
        "needs": ["prior_sleepaway_experience", "child_readiness"]
      },
      "sourceRefs": []
    },
    {
      "type": "SuggestedPromptList",
      "props": {
        "prompts": ["sp_1"]
      },
      "sourceRefs": []
    }
  ],
  "citations": [],
  "suggestedPrompts": [
    {
      "id": "sp_1",
      "text": "Has your child slept away from home before?",
      "purpose": "gather_info",
      "contextNeeds": ["prior_sleepaway_experience"],
      "concerns": ["homesickness"],
      "templateId": "ask_sleepaway_experience"
    }
  ],
  "diagnostics": []
}
```

### Valid composition statuses

```txt
answered
partial
needs_context
insufficient_sources
abstained
```

### Validation Shape

```json
{
  "status": "passed",
  "checks": {
    "componentSchemaValid": true,
    "sourceCoverageValid": true,
    "safetyRulesPassed": true,
    "suggestedPromptsValid": true,
    "recommendationRulesValid": true
  },
  "errors": []
}
```

### Validation Rules

The answer must pass validation before the session patch can be committed.

Validation should check:

1. Every factual claim has source support or is clearly framed as a question/context need.
2. Every UI block conforms to the component schema.
3. Suggested prompts come from approved templates or approved generation rules.
4. Safety-sensitive topics use approved framing.
5. Recommendations are supported by deterministic rules.
6. Pricing, dates, availability, and eligibility come from structured data.
7. The response status matches the available evidence.
8. The system does not overclaim certainty.

---

## Step 5: Build Session Patch

### Reads

- `runState.understanding`
- `runState.composition`
- `runState.validation`

### Writes

`runState.patch`

### Patch Shape

```json
{
  "baseRevision": 1,
  "runId": "run_2",
  "ops": [
    {
      "op": "upsertFact",
      "key": "child_age",
      "value": 8,
      "source": "explicit",
      "sourceRunId": "run_2"
    },
    {
      "op": "upsertConcern",
      "key": "homesickness",
      "status": "open",
      "sourceRunId": "run_2"
    },
    {
      "op": "setFocus",
      "goal": "assess_fit",
      "contextNeeds": ["prior_sleepaway_experience", "child_readiness"]
    },
    {
      "op": "replaceSuggestedPrompts",
      "prompts": [
        {
          "id": "sp_1",
          "text": "Has your child slept away from home before?",
          "purpose": "gather_info",
          "contextNeeds": ["prior_sleepaway_experience"],
          "concerns": ["homesickness"],
          "templateId": "ask_sleepaway_experience"
        }
      ]
    },
    {
      "op": "updateSummary",
      "summary": "Visitor is evaluating overnight camp for an 8-year-old. Homesickness/readiness is an open concern."
    }
  ]
}
```

### Rules

- Build patch only after composition validation passes.
- Patch should include `baseRevision`.
- Patch should include `runId`.
- Patch operations should be idempotent where possible.
- Do not commit weak or speculative concerns.
- Do not commit freeform LLM output without validation.

---

## Step 6: Commit Patch

### Reads

- `runState.patch`
- live Session State revision

### Writes

Live Session State.

### External Calls

Persistence layer.

### Commit Rules

The commit should succeed only if:

```txt
liveSession.revision === patch.baseRevision
```

If the revision matches:

1. Apply patch operations.
2. Increment session revision.
3. Set `updatedAt`.
4. Mark run as `committed`.

If the revision does not match:

1. Reject the patch.
2. Mark run as `failed` or `conflict`.
3. Optionally start a new run from the latest Session State.

### Idempotency Rule

If the same `runId` has already been committed, do not apply the patch again.

This prevents duplicate commits during retries.

---

## Step 7: Render Answer

### Reads

`runState.composition`

### Writes

UI-local render state only.

### Rule

For MVP, commit before rendering the final answer.

If streaming is introduced later, streamed output should be treated as provisional until validation and commit are complete.

---

# 10. Session Patch Operations

## Supported MVP Operations

```txt
upsertFact
upsertConcern
setFocus
replaceSuggestedPrompts
updateSummary
```

## Optional Later Operations

```txt
markConcernAddressed
markFactSuperseded
clearFocus
appendRunReference
archiveSuggestedPrompt
```

---

# 11. Source and Citation Model

Source provenance should be stored primarily in Run State and UI Composition, not bloated into Session State.

## Citation Shape

```json
{
  "sourceId": "policy_homesickness",
  "sourceType": "policy",
  "title": "Homesickness Policy",
  "fieldPath": "summary",
  "sourceRevision": "sanity_rev_abc123",
  "retrievedAt": "ISO_DATE"
}
```

## Rules

- Every source-backed UI block should include `sourceRefs`.
- Every factual answer should expose its sources to the visitor.
- Source references should point to approved Sanity content.
- Source revisions should be stored where possible for auditability.
- For MVP, source snapshots do not need to be persisted in Session State.

---

# 12. UI Composition Model

The answer should be rendered as structured UI, not a freeform chat message.

## Composition Shape

```json
{
  "compositionId": "answer_2",
  "status": "partial",
  "blocks": [
    {
      "type": "VerdictPanel",
      "props": {
        "variant": "likely_fit_with_caveat",
        "headline": "Likely fit, with one important caveat"
      },
      "sourceRefs": []
    },
    {
      "type": "ConcernCard",
      "props": {
        "concernId": "homesickness",
        "title": "Homesickness support"
      },
      "sourceRefs": ["policy_homesickness"]
    },
    {
      "type": "SuggestedPromptList",
      "props": {
        "prompts": ["sp_1", "sp_2"]
      },
      "sourceRefs": []
    }
  ],
  "citations": [],
  "suggestedPrompts": [],
  "diagnostics": []
}
```

## MVP Component Types

```txt
AnswerSummary
VerdictPanel
ConcernCard
ContextNeedsPanel
SuggestedPromptList
SourceList
HumanEscalationCTA
ProgramCard
ComparisonTable
```

## Rules

- Components should be selected by the system or LLM orchestration.
- Component props must validate against a schema.
- Components must not contain unsupported claims.
- Sensitive components should use approved templates.

---

# 13. Suggested Prompt Handling

The LLM may identify that a follow-up question is needed.

The final prompt text should come from controlled logic.

## Example

LLM proposes:

```json
{
  "contextNeed": "prior_sleepaway_experience"
}
```

System resolves it to:

```json
{
  "id": "sp_1",
  "templateId": "ask_sleepaway_experience",
  "text": "Has your child slept away from home before?",
  "purpose": "gather_info",
  "contextNeeds": ["prior_sleepaway_experience"],
  "concerns": ["homesickness"]
}
```

## Rule

Do not commit arbitrary LLM-generated prompt text to Session State.

---

# 14. Error Handling

## Insufficient Sources

If retrieval does not return enough verified material:

```json
{
  "status": "insufficient_sources",
  "blocks": [
    {
      "type": "AnswerSummary",
      "props": {
        "text": "I do not have enough verified information to answer that confidently."
      },
      "sourceRefs": []
    },
    {
      "type": "HumanEscalationCTA",
      "props": {
        "reason": "This question requires confirmation from the camp."
      },
      "sourceRefs": []
    }
  ]
}
```

## Needs Context

If the system needs visitor information before answering:

```json
{
  "status": "needs_context",
  "blocks": [
    {
      "type": "ContextNeedsPanel",
      "props": {
        "needs": ["prior_sleepaway_experience"]
      },
      "sourceRefs": []
    },
    {
      "type": "SuggestedPromptList",
      "props": {
        "prompts": ["sp_1"]
      },
      "sourceRefs": []
    }
  ]
}
```

## Validation Failure

If composition validation fails:

1. Do not commit the patch.
2. Do not render the unsafe composition.
3. Render a safe fallback.
4. Log diagnostics in Run State.

---

# 15. Persistence Strategy

## Session Store

Stores current durable session memory.

Recommended fields:

```txt
sessionId
schemaVersion
revision
status
visitorFacts
concerns
focus
suggestedPrompts
summary
createdAt
updatedAt
committedRunIds
```

## Run Store

Stores full run traces.

Recommended fields:

```txt
runId
sessionId
baseSessionRevision
status
prompt
snapshot
understanding
retrieval
composition
validation
patch
diagnostics
createdAt
updatedAt
```

## Why separate them

Session State should be fast to hydrate.

Run State should be rich enough to audit and debug.

Do not make Session State carry every historical detail.

---

# 16. Example Lifecycle

## Visitor Prompt

```txt
Is overnight camp right for my 8-year-old?
```

## Understanding

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

## Retrieval

```json
{
  "results": [
    {
      "sourceId": "policy_homesickness",
      "sourceType": "policy",
      "title": "Homesickness Policy",
      "rank": 1,
      "fieldPath": "summary"
    }
  ]
}
```

## Composition

```json
{
  "status": "needs_context",
  "blocks": [
    {
      "type": "AnswerSummary",
      "props": {
        "text": "Overnight camp may be a fit, but I need a little more context before recommending it confidently."
      },
      "sourceRefs": []
    },
    {
      "type": "ContextNeedsPanel",
      "props": {
        "needs": ["prior_sleepaway_experience", "child_readiness"]
      },
      "sourceRefs": []
    },
    {
      "type": "SuggestedPromptList",
      "props": {
        "prompts": ["sp_1"]
      },
      "sourceRefs": []
    }
  ],
  "suggestedPrompts": [
    {
      "id": "sp_1",
      "text": "Has your child slept away from home before?",
      "purpose": "gather_info",
      "contextNeeds": ["prior_sleepaway_experience"],
      "concerns": ["homesickness"],
      "templateId": "ask_sleepaway_experience"
    }
  ]
}
```

## Patch

```json
{
  "baseRevision": 1,
  "runId": "run_2",
  "ops": [
    {
      "op": "upsertFact",
      "key": "child_age",
      "value": 8,
      "source": "explicit",
      "sourceRunId": "run_2"
    },
    {
      "op": "upsertConcern",
      "key": "homesickness",
      "status": "open",
      "sourceRunId": "run_2"
    },
    {
      "op": "setFocus",
      "goal": "assess_fit",
      "contextNeeds": ["prior_sleepaway_experience", "child_readiness"]
    },
    {
      "op": "replaceSuggestedPrompts",
      "prompts": [
        {
          "id": "sp_1",
          "text": "Has your child slept away from home before?",
          "purpose": "gather_info",
          "contextNeeds": ["prior_sleepaway_experience"],
          "concerns": ["homesickness"],
          "templateId": "ask_sleepaway_experience"
        }
      ]
    },
    {
      "op": "updateSummary",
      "summary": "Visitor is evaluating overnight camp for an 8-year-old. Homesickness/readiness is an open concern."
    }
  ]
}
```

---

# 17. Acceptance Criteria

## State Isolation

- A run does not mutate live Session State before commit.
- A run uses `snapshot`, not live session reads, after Start Run.
- Session State is updated only through validated patches.

## Replayability

- Given the same run snapshot, prompt, retrieval data, and config, the system can reproduce or inspect the run.
- Run State contains enough data to debug a bad answer.

## Concurrency

- Patches include `baseRevision`.
- Commits fail if the live session revision has changed.
- Duplicate commits from the same `runId` do not apply twice.

## Source Grounding

- Factual UI blocks expose source references.
- Unsupported claims fail validation.
- Sensitive topics require approved framing.

## Suggested Prompts

- Suggested prompts are structured objects.
- Suggested prompt text comes from approved templates or validated generation rules.
- Freeform LLM prompt suggestions are not directly committed.

## UI Composition

- The answer is represented as structured component blocks.
- Component props validate against schemas.
- The rendered answer matches the validated composition.

## MVP Simplicity

- Session State remains compact.
- Historical detail lives in Run State, not Session State.
- The system avoids unnecessary long-lived structures until product testing justifies them.

---

# 18. Future Extensions

Possible post-MVP additions:

1. Persistent interaction ledger.
2. Answer history summaries.
3. Source snapshot archival.
4. Multi-part prompt decomposition.
5. Concern promotion and dismissal workflow.
6. Analytics event stream.
7. Visitor consent and privacy controls.
8. Advanced fit-scoring rules.
9. Deterministic pricing calculators.
10. Human handoff summaries.
11. Saved personalized plans.
12. Multi-session visitor accounts.
13. A/B testing for decision-confidence metrics.

These should be added only after the MVP proves the core loop.

---

# 19. Final Architecture Summary

The MVP architecture should be:

```txt
Session = compact durable memory
Run = full trace of one turn
Snapshot = isolated read model
Patch = validated state update
Composition = source-backed UI answer
Commit = atomic revision-checked write
```

The system should optimize for:

- testability
- source grounding
- explicit state transitions
- deterministic commits
- minimal live session complexity
- validated UI composition
- safe handling of sensitive concerns

This preserves the original snapshot-plus-patch insight while stripping out unnecessary MVP complexity.
