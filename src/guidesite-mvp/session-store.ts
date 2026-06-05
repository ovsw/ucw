import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionState, SessionStore } from "./types.ts";

const safeIdPattern = /^[A-Za-z0-9_-]+$/;
const committedRunIdsFileName = "committed-run-ids.json";

function assertSafeId(id: string, label: string): void {
  if (!safeIdPattern.test(id)) {
    throw new Error(`${label} contains unsupported characters: ${id}`);
  }
}

function cloneSessionState(session: SessionState): SessionState {
  return structuredClone(session);
}

function readCommittedRunIds(path: string): Set<string> {
  if (!existsSync(path)) {
    return new Set<string>();
  }

  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid committed run ids store: ${path}`);
  }

  const ids = new Set<string>();
  for (const value of parsed) {
    if (typeof value === "string" && value.length > 0) {
      ids.add(value);
    }
  }

  return ids;
}

function writeCommittedRunIds(path: string, committedRunIds: Set<string>): void {
  writeFileSync(path, `${JSON.stringify([...committedRunIds], null, 2)}\n`, "utf8");
}

export function createGuideSiteFileSessionStore(directory: string): SessionStore {
  function sessionPath(sessionId: string): string {
    assertSafeId(sessionId, "Session ID");
    return join(directory, `${sessionId}.json`);
  }

  function committedRunIdsPath(): string {
    return join(directory, committedRunIdsFileName);
  }

  function writeSession(session: SessionState): SessionState {
    const stored = cloneSessionState(session);
    mkdirSync(directory, { recursive: true });
    writeFileSync(sessionPath(stored.sessionId), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return cloneSessionState(stored);
  }

  return {
    create(session) {
      return writeSession(session);
    },
    read(sessionId) {
      const path = sessionPath(sessionId);
      if (!existsSync(path)) {
        return null;
      }

      return JSON.parse(readFileSync(path, "utf8")) as SessionState;
    },
    update(session) {
      return writeSession(session);
    },
    hasCommittedRun(runId) {
      assertSafeId(runId, "Run ID");
      return readCommittedRunIds(committedRunIdsPath()).has(runId);
    },
    markCommittedRun(runId) {
      assertSafeId(runId, "Run ID");
      mkdirSync(directory, { recursive: true });
      const committedRunIds = readCommittedRunIds(committedRunIdsPath());
      committedRunIds.add(runId);
      writeCommittedRunIds(committedRunIdsPath(), committedRunIds);
    },
  };
}
