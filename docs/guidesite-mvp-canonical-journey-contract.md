# GuideSite MVP Canonical Journey Contract

This document defines the Sprint 0 contract for the first operator-led Ultimate Camp Website guided answer loop.

It narrows the parent PRD in [issue #20](https://github.com/ovsw/ucw/issues/20), the [GuideSite MVP State Architecture](./guidesite-mvp-architecture.md), and the [GuideSite MVP Sprints Plan](./guidesite-mvp-sprints-plan.md) into one canonical Parent journey that Sprint 1 can build and test without re-deciding product scope.

## Canonical Prompt

The canonical Parent Prompt is:

> Is overnight camp right for my 8-year-old?

This is a Fit Prompt. It asks whether overnight camp fits the Parent's Child and family context. It is not a request for a final recommendation, eligibility verdict, safety promise, availability lookup, or best-option comparison.

## Expected Prompt Understanding

Prompt Understanding for the canonical Prompt should produce this meaning:

```json
{
  "goal": "assess_fit",
  "promptType": "fit",
  "fitQuestion": "Assess whether overnight camp is a good fit for the Parent's 8-year-old Child.",
  "facts": {
    "child_age": {
      "value": 8,
      "provenance": {
        "source": "explicit",
        "promptText": "8-year-old"
      }
    }
  },
  "concerns": [
    {
      "key": "homesickness",
      "label": "Homesickness",
      "status": "open",
      "provenance": "implied"
    },
    {
      "key": "child_readiness",
      "label": "Child Readiness",
      "status": "open",
      "provenance": "implied"
    }
  ],
  "contextNeeds": [
    "prior_sleepaway_experience",
    "child_readiness"
  ]
}
```

The extracted Visitor Context fact is `child_age = 8`. Its provenance must remain explicit because the age comes directly from the phrase "8-year-old" in the Parent Prompt.

The GuideSite goal is assessing Fit without making a recommendation yet. The first answer should explain that the system needs more Visitor Context before it can honestly assess Fit.

## Expected Visitor Context

The first run starts with no prior Visitor Context unless the caller supplies a Session snapshot.

After Prompt Understanding validates, the Session Patch should be allowed to store:

```json
{
  "visitorFacts": {
    "child_age": {
      "value": 8,
      "source": "explicit",
      "status": "active"
    }
  },
  "focus": {
    "goal": "assess_fit",
    "contextNeeds": [
      "prior_sleepaway_experience",
      "child_readiness"
    ]
  }
}
```

The first run should not store an answer to `prior_sleepaway_experience` or `child_readiness`. Those are missing facts to gather, not inferred facts.

## Expected Concerns

The expected Concerns are:

- `homesickness`: the Parent may need to understand how the camp handles separation, comfort, parent communication, and adjustment.
- `child_readiness`: the Parent may need to assess the Child's readiness for separation, independence, routines, and social or emotional demands.

Equivalent domain terms are acceptable only if they preserve the glossary meaning of Concern and Child Readiness.

## Expected Context Needs

The first answer should gather these missing Visitor Context facts before attempting a stronger Fit assessment:

- `prior_sleepaway_experience`: whether the Child has slept away from home before, and in what setting.
- `child_readiness`: how the Child handles new routines, separation from the Parent, asking adults for help, and group living.

The context needs should be visible in Run State, Answer Composition, Suggested Prompts, and the Session Patch focus.

## Answer Behavior

The first Assembled Answer should avoid unsupported recommendation labels.

It must not label overnight camp as:

- "best fit"
- "recommended"
- "safe"
- "available"

It should also avoid similar unsupported labels such as "right choice", "guaranteed", "perfect match", "eligible", or "open spot" unless later approved source material and deterministic rules support that specific claim.

The correct behavior is to acknowledge that age 8 is relevant, explain that Fit depends on missing Visitor Context, name the relevant Concerns, and ask controlled follow-up questions.

## Controlled Suggested Prompts

The expected controlled Suggested Prompts are:

```json
[
  {
    "id": "prompt_prior_sleepaway_experience",
    "purpose": "gather_fit_context",
    "text": "Has your child slept away from home before?"
  },
  {
    "id": "prompt_child_readiness",
    "purpose": "gather_fit_context",
    "text": "How does your child usually handle new routines or time away from you?"
  }
]
```

These are controlled Suggested Prompts for gathering missing Visitor Context. They should come from approved templates or approved generation rules, not arbitrary unvalidated model text.

## Semantic Answer Composition Section Kinds

The expected Answer Composition should use semantic section kinds, not presentation-specific names.

Minimum section kinds for the first canonical answer:

- `summary`: acknowledges the Parent Prompt and the known Child age.
- `fit_status`: states that Fit cannot be assessed honestly yet.
- `concerns`: names homesickness and Child Readiness as open Concerns.
- `context_needs`: lists missing Visitor Context needed for the next turn.
- `suggested_prompts`: carries the controlled Suggested Prompts.
- `sources`: lists source references when source-backed material is available.
- `diagnostics`: exposes operator-facing notes about missing context, validation, and source coverage.

The first answer may include Conversational Framing, but the structured contract is the semantic Answer Composition. The MVP should remain a plain operator-led output and should not define visual layout, interaction handlers, or a production presentation registry here.

## Traceability

This contract is the Sprint 0 handoff artifact for issue #21.

It links to:

- [GuideSite MVP State Architecture](./guidesite-mvp-architecture.md)
- [GuideSite MVP Sprints Plan](./guidesite-mvp-sprints-plan.md)
- [Parent PRD issue #20](https://github.com/ovsw/ucw/issues/20)
