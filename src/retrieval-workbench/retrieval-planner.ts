export type RetrievalPlanNeedKind = "stated" | "implied";

export type RetrievalPlanNeed = {
  id: string;
  kind: RetrievalPlanNeedKind;
  description: string;
};

export type RetrievalPlanQuery = {
  id: string;
  needId: string;
  question: string;
  searchText: string;
};

export type RetrievalPlan = {
  prompt: string;
  needs: RetrievalPlanNeed[];
  queries: RetrievalPlanQuery[];
};

export type RetrievalPlanner = {
  id: string;
  label: string;
  planPrompt(prompt: string): RetrievalPlan;
};

type CreatePlanInput = {
  prompt: string;
  needs: RetrievalPlanNeed[];
  queries: RetrievalPlanQuery[];
};

const STATED_NEED_ID = "need-stated-prompt";

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function assertNonEmpty(value: string, label: string): string {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`Retrieval Planner produced an empty ${label}.`);
  }

  return normalized;
}

function normalizePlan(input: CreatePlanInput): RetrievalPlan {
  const prompt = assertNonEmpty(input.prompt, "prompt");
  const needs = input.needs.map((need) => ({
    ...need,
    id: assertNonEmpty(need.id, "need id"),
    description: assertNonEmpty(need.description, "need description"),
  }));
  const needIds = new Set(needs.map((need) => need.id));

  if (needs.length === 0) {
    throw new Error("Retrieval Planner produced no needs.");
  }

  const seenSearchText = new Set<string>();
  const queries: RetrievalPlanQuery[] = [];

  for (const query of input.queries) {
    const normalizedQuery = {
      ...query,
      id: assertNonEmpty(query.id, "query id"),
      needId: assertNonEmpty(query.needId, "query need id"),
      question: assertNonEmpty(query.question, "query question"),
      searchText: assertNonEmpty(query.searchText, "query search text"),
    };

    if (!needIds.has(normalizedQuery.needId)) {
      throw new Error(`Retrieval Planner query references an unknown need: ${normalizedQuery.needId}.`);
    }

    const searchTextKey = normalizedQuery.searchText.toLowerCase();
    if (seenSearchText.has(searchTextKey)) {
      continue;
    }

    seenSearchText.add(searchTextKey);
    queries.push(normalizedQuery);
  }

  if (queries.length === 0) {
    throw new Error("Retrieval Planner produced no retrieval queries.");
  }

  return { prompt, needs, queries };
}

function createStatedNeed(prompt: string): { need: RetrievalPlanNeed; query: RetrievalPlanQuery } {
  return {
    need: {
      id: STATED_NEED_ID,
      kind: "stated",
      description: "Answer the Visitor's stated prompt directly.",
    },
    query: {
      id: "query-stated-prompt",
      needId: STATED_NEED_ID,
      question: "What source material directly answers the stated prompt?",
      searchText: prompt,
    },
  };
}

function suggestsGentlerCampAlternative(prompt: string): boolean {
  const normalized = prompt.toLowerCase();

  return (
    /\bday camp\b/.test(normalized) ||
    /\bgentler option\b/.test(normalized) ||
    (/\bovernight\b/.test(normalized) && /\btoo much\b/.test(normalized))
  );
}

export function createPrototypeRetrievalPlanner(): RetrievalPlanner {
  return {
    id: "prototypeRetrievalPlanner",
    label: "Prototype Retrieval Planner",
    planPrompt(prompt: string): RetrievalPlan {
      const stated = createStatedNeed(prompt);
      const needs: RetrievalPlanNeed[] = [stated.need];
      const queries: RetrievalPlanQuery[] = [stated.query];

      if (suggestsGentlerCampAlternative(prompt)) {
        const needId = "need-registration-change-policy";

        needs.push({
          id: needId,
          kind: "implied",
          description:
            "Check whether a gentler camp alternative creates registration, cancellation, refund, or plan-change questions.",
        });
        queries.push({
          id: "query-registration-change-policy",
          needId,
          question: "What registration, cancellation, refund, or plan-change policies affect a gentler camp alternative?",
          searchText: "registration cancellation refund plan change day camp alternative",
        });
      }

      return normalizePlan({ prompt, needs, queries });
    },
  };
}

export function cloneRetrievalPlan(plan: RetrievalPlan): RetrievalPlan {
  return {
    prompt: plan.prompt,
    needs: plan.needs.map((need) => ({ ...need })),
    queries: plan.queries.map((query) => ({ ...query })),
  };
}
