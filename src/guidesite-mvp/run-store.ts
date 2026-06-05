import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunState, RunStore } from "./types.ts";

const safeRunIdPattern = /^[A-Za-z0-9_-]+$/;

function assertSafeRunId(runId: string): void {
  if (!safeRunIdPattern.test(runId)) {
    throw new Error(`Run ID contains unsupported characters: ${runId}`);
  }
}

function cloneRunState(run: RunState): RunState {
  return structuredClone(run);
}

export function createGuideSiteFileRunStore(directory: string): RunStore {
  function runPath(runId: string): string {
    assertSafeRunId(runId);
    return join(directory, `${runId}.json`);
  }

  function writeRun(run: RunState): RunState {
    const stored = cloneRunState(run);
    mkdirSync(directory, { recursive: true });
    writeFileSync(runPath(stored.runId), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return cloneRunState(stored);
  }

  return {
    create(run) {
      return writeRun(run);
    },
    read(runId) {
      const path = runPath(runId);
      if (!existsSync(path)) {
        return null;
      }

      return JSON.parse(readFileSync(path, "utf8")) as RunState;
    },
    update(run) {
      return writeRun(run);
    },
    inspect(runId) {
      const path = runPath(runId);
      return existsSync(path) ? { path } : null;
    },
  };
}
