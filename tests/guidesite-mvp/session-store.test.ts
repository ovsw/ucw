import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createGuideSiteMemoryStores, startGuideSiteRun } from "../../src/guidesite-mvp/run-lifecycle.js";
import { createGuideSiteFileSessionStore } from "../../src/guidesite-mvp/session-store.js";

const canonicalPrompt = "Is overnight camp right for my 8-year-old?";

test("file session store persists a demo path across fresh store instances", () => {
  const sessionStateDirectory = mkdtempSync(join(tmpdir(), "guidesite-session-store-"));

  try {
    const firstSessionStore = createGuideSiteFileSessionStore(sessionStateDirectory);
    const firstStores = createGuideSiteMemoryStores({ sessions: firstSessionStore });
    const started = startGuideSiteRun({
      promptText: canonicalPrompt,
      stores: firstStores,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createSessionId: () => "session_reload",
      createRunId: () => "run_reload",
    });

    firstStores.sessions.update({
      ...started.session,
      revision: 2,
      updatedAt: "2026-01-01T00:01:00.000Z",
      summary: "Reloads should resume this path.",
    });
    firstStores.sessions.markCommittedRun("run_reload");

    const secondSessionStore = createGuideSiteFileSessionStore(sessionStateDirectory);
    const secondStores = createGuideSiteMemoryStores({ sessions: secondSessionStore });
    const reloaded = startGuideSiteRun({
      promptText: canonicalPrompt,
      stores: secondStores,
      sessionId: "session_reload",
      now: () => new Date("2026-01-01T00:02:00.000Z"),
      createRunId: () => "run_reload_again",
    });

    assert.equal(reloaded.session.sessionId, "session_reload");
    assert.equal(reloaded.session.revision, 2);
    assert.equal(reloaded.session.summary, "Reloads should resume this path.");
    assert.equal(reloaded.run.baseSessionRevision, 2);
    assert.equal(reloaded.run.snapshot.summary, "Reloads should resume this path.");
    assert.equal(secondSessionStore.hasCommittedRun("run_reload"), true);

    const freshDemo = startGuideSiteRun({
      promptText: canonicalPrompt,
      stores: secondStores,
      now: () => new Date("2026-01-01T00:03:00.000Z"),
      createSessionId: () => "session_new_demo",
      createRunId: () => "run_new_demo",
    });

    assert.notEqual(freshDemo.session.sessionId, reloaded.session.sessionId);
    assert.equal(freshDemo.session.revision, 1);
    assert.equal(freshDemo.run.baseSessionRevision, 1);
    assert.equal(freshDemo.run.snapshot.summary, "");
  } finally {
    rmSync(sessionStateDirectory, { recursive: true, force: true });
  }
});
