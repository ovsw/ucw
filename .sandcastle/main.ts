// Sequential Reviewer — implement-then-review loop
//
// This template drives a two-phase workflow per issue:
//   Phase 1 (Implement): A sonnet agent picks an open issue, works on it
//                        on a dedicated branch, commits the changes, and signals
//                        completion.
//   Phase 2 (Review):    A second sonnet agent reviews the branch diff and either
//                        approves it or makes corrections directly on the branch.
//
// Both phases share a single sandbox created via createSandbox(), so the
// implementer and reviewer work on the same explicit branch.
//
// The outer loop repeats up to MAX_ITERATIONS times, processing one issue per
// iteration and stopping early once the backlog is exhausted (an implement
// phase that produces no commits). This is a middle-complexity option between
// the simple-loop (no review gate) and the parallel-planner (concurrent
// execution with a planning phase).
//
// Usage:
//   npx tsx .sandcastle/main.ts
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.ts" }

import * as sandcastle from "@ai-hero/sandcastle";
import { podman } from "@ai-hero/sandcastle/sandboxes/podman";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of implement→review cycles to run before stopping.
// Each cycle works on one issue. Raise this to process more issues per run.
const MAX_ITERATIONS = 10;

const IMPLEMENTED_LABEL = "sandcastle-implemented";
const BLOCKED_LABEL = "sandcastle-blocked";

const sandcastleLogsDir = ".sandcastle/logs";
const codexSessionLogDir = `${sandcastleLogsDir}/codex-sessions`;

mkdirSync(codexSessionLogDir, { recursive: true });

// Hooks run inside the sandbox before the agent starts each iteration.
// pnpm install ensures the sandbox always has fresh dependencies.
const hooks = {
  sandbox: { onSandboxReady: [{ command: "pnpm install --frozen-lockfile" }] },
};

// Copy node_modules from the host into the worktree before each sandbox
// starts. Avoids a full pnpm install from scratch; the hook above handles
// platform-specific binaries and any packages added since the last copy.
const copyToWorktree = ["node_modules"];

const codexAgent = sandcastle.codex("gpt-5.4-mini", { effort: "medium" });

const containerUid = process.getuid?.() ?? 1000;
const containerGid = process.getgid?.() ?? 1000;

const sandboxProvider = podman({
  containerUid,
  containerGid,
  env: {
    CODEX_HOME: "/home/agent/.codex",
  },
  mounts: [
    {
      hostPath: "~/.codex/auth.json",
      sandboxPath: "~/.codex/auth.json",
      readonly: true,
    },
    {
      hostPath: ".codex/config.toml",
      sandboxPath: "~/.codex/config.toml",
      readonly: true,
    },
    {
      hostPath: codexSessionLogDir,
      sandboxPath: "~/.codex/sessions",
    },
  ],
});

type GitHubIssue = {
  number: number;
  title: string;
  labels: { name: string }[];
};

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const ensureLabel = (name: string, description: string, color: string) => {
  const labels = JSON.parse(run("gh", ["label", "list", "--limit", "1000", "--json", "name"])) as {
    name: string;
  }[];

  if (labels.some((label) => label.name === name)) {
    return;
  }

  run("gh", ["label", "create", name, "--description", description, "--color", color]);
};

const listOpenSandcastleIssues = () =>
  JSON.parse(
    run("gh", [
      "issue",
      "list",
      "--state",
      "open",
      "--label",
      "Sandcastle",
      "--limit",
      "100",
      "--json",
      "number,title,labels",
    ]),
  ) as GitHubIssue[];

const hasLabel = (issue: GitHubIssue, labelName: string) =>
  issue.labels.some((label) => label.name === labelName);

const formatIssueList = (issues: GitHubIssue[]) =>
  issues.map((issue) => `#${issue.number} ${issue.title}`).join("\n");

const assertNoBlockedIssues = () => {
  const blockedIssues = listOpenSandcastleIssues().filter((issue) => hasLabel(issue, BLOCKED_LABEL));

  if (blockedIssues.length) {
    throw new Error(
      `Sandcastle is blocked by open issues labeled ${BLOCKED_LABEL}:\n${formatIssueList(
        blockedIssues,
      )}\nResolve the blocker and remove the label before continuing.`,
    );
  }
};

const listActionableIssues = () =>
  listOpenSandcastleIssues().filter((issue) => !hasLabel(issue, IMPLEMENTED_LABEL));

const assertCleanWorktree = (worktreePath: string) => {
  const status = run("git", ["-C", worktreePath, "status", "--porcelain"]);

  if (status.trim()) {
    throw new Error(`Sandcastle worktree has uncommitted changes:\n${status}`);
  }
};

const assertBranchDescendsFrom = (baseBranch: string, branch: string) => {
  try {
    run("git", ["merge-base", "--is-ancestor", baseBranch, branch]);
  } catch {
    throw new Error(`Branch ${branch} does not descend from expected base ${baseBranch}.`);
  }
};

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

ensureLabel(
  IMPLEMENTED_LABEL,
  "Implemented by Sandcastle on an integration branch, pending final merge/closure",
  "0e8a16",
);
ensureLabel(
  BLOCKED_LABEL,
  "Sandcastle could not proceed without human input or an external change",
  "b60205",
);

let baseBranch = "HEAD";
let finalIntegratedBranch: string | undefined;

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  assertNoBlockedIssues();

  const actionableIssues = listActionableIssues();

  if (!actionableIssues.length) {
    console.log("No actionable Sandcastle issues remain. Stopping.");
    break;
  }

  // Generate a unique branch name for this iteration.
  const branch = `sandcastle/sequential-reviewer/${Date.now()}-${iteration}`;

  // Create a single sandbox that both the implementer and reviewer share.
  // This gives both agents a real, named branch that persists across phases.
  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch,
    sandbox: sandboxProvider,
    hooks,
    copyToWorktree,
  });

  try {
    // -----------------------------------------------------------------------
    // Phase 1: Implement
    //
    // A sonnet agent picks the next open issue, writes the
    // implementation (using RGR: Red → Green → Repeat → Refactor), and
    // commits the result.
    //
    // The agent signals completion via <promise>COMPLETE</promise> when done.
    // -----------------------------------------------------------------------
    // One iteration so each outer pass implements a single issue on its own
    // branch, then hands it to the reviewer. A higher value lets the agent
    // drain the whole backlog onto this one branch in a single pass, which
    // defeats the per-issue review.
    const implement = await sandbox.run({
      name: "implementer",
      maxIterations: 1,
      agent: codexAgent,
      promptFile: "./.sandcastle/implement-prompt.md",
      promptArgs: {
        BASE_BRANCH: baseBranch,
        BRANCH: branch,
      },
    });

    if (!implement.commits.length) {
      assertNoBlockedIssues();

      // No commits and no blocked issues means there is nothing left for the
      // implementer to do.
      console.log("Implementation agent made no commits. Stopping.");
      break;
    }

    console.log(`\nImplementation complete on branch: ${branch}`);
    console.log(`Commits: ${implement.commits.length}`);

    // -----------------------------------------------------------------------
    // Phase 2: Review
    //
    // A second sonnet agent reviews the diff of the branch produced by
    // Phase 1. It uses the {{BRANCH}} prompt argument to inspect the right
    // branch, and either approves or makes corrections directly on the branch.
    // -----------------------------------------------------------------------
    await sandbox.run({
      name: "reviewer",
      maxIterations: 1,
      agent: codexAgent,
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: {
        BASE_BRANCH: baseBranch,
        BRANCH: branch,
      },
    });

    assertCleanWorktree(sandbox.worktreePath);
    assertBranchDescendsFrom(baseBranch, branch);

    baseBranch = branch;
    finalIntegratedBranch = branch;

    console.log("\nReview complete.");
  } finally {
    await sandbox.close();
  }
}

console.log("\nAll done.");

if (finalIntegratedBranch) {
  console.log(`Final integrated branch: ${finalIntegratedBranch}`);
  console.log(
    `After merging or accepting this branch, close open issues labeled ${IMPLEMENTED_LABEL}.`,
  );
} else {
  console.log("No integrated branch was produced.");
}
