import type { RunState } from "./types.ts";

export function collectActiveFacts(run: RunState): Map<string, string | number | boolean> {
  const activeFacts = new Map<string, string | number | boolean>();

  for (const [factKey, fact] of Object.entries(run.snapshot.visitorFacts)) {
    if (fact.status === "active") {
      activeFacts.set(factKey, fact.value);
    }
  }

  for (const [factKey, fact] of Object.entries(run.understanding?.facts ?? {})) {
    activeFacts.set(factKey, fact.value);
  }

  return activeFacts;
}
