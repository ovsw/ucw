import { collectActiveFacts } from "./fact-state.ts";
import type { RunState } from "./types.ts";

export function collectUnresolvedContextNeeds(run: RunState): string[] {
  const activeFacts = collectActiveFacts(run);
  const unresolvedContextNeeds: string[] = [];
  const seenContextNeeds = new Set<string>();

  for (const contextNeed of run.understanding?.contextNeeds ?? []) {
    if (seenContextNeeds.has(contextNeed)) {
      continue;
    }

    seenContextNeeds.add(contextNeed);

    if (!activeFacts.has(contextNeed)) {
      unresolvedContextNeeds.push(contextNeed);
    }
  }

  return unresolvedContextNeeds;
}
