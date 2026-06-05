import { collectActiveFacts } from "./fact-state.ts";
import type { RunState } from "./types.ts";

export function collectUnresolvedContextNeeds(run: RunState): string[] {
  const activeFacts = collectActiveFacts(run);
  const unresolvedContextNeeds: string[] = [];
  const seenContextNeedIds = new Set<string>();
  const contextNeeds = run.understanding?.contextNeeds ?? [];

  for (const contextNeed of contextNeeds) {
    if (seenContextNeedIds.has(contextNeed)) {
      continue;
    }

    seenContextNeedIds.add(contextNeed);

    if (activeFacts.has(contextNeed)) {
      continue;
    }

    unresolvedContextNeeds.push(contextNeed);
  }

  return unresolvedContextNeeds;
}
