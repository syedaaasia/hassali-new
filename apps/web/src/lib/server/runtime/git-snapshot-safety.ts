import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  RuntimeBlockedReason,
  RuntimeEvent
} from "@/lib/server/runtime/runtime-types";

const execFileAsync = promisify(execFile);

export type GitSnapshotStatus = "available" | "failed" | "unavailable";

export type GitSnapshotSafetyInput = {
  planId: string;
  projectId: string;
  runnerId: string;
  workspaceRoot: string;
};

export type GitSnapshotSafetyResult = {
  afterRef: string | null;
  beforeRef: string | null;
  blockedReasons: RuntimeBlockedReason[];
  changedFiles: string[];
  errors: string[];
  events: RuntimeEvent[];
  rollbackApplied: boolean;
  rollbackAvailable: boolean;
  snapshotId: string;
  snapshotStatus: GitSnapshotStatus;
};

type GitCommandResult = {
  ok: boolean;
  stderr: string;
  stdout: string;
};

function now() {
  return new Date().toISOString();
}

function event(input: {
  message: string;
  metadata?: RuntimeEvent["metadata"];
  runnerId: string;
  type: RuntimeEvent["type"];
}): RuntimeEvent {
  return {
    createdAt: now(),
    message: input.message,
    metadata: input.metadata,
    sessionId: input.runnerId,
    type: input.type
  };
}

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

async function runGit(workspaceRoot: string, args: string[]): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", ["-C", workspaceRoot, ...args], {
      windowsHide: true
    });

    return {
      ok: true,
      stderr: stderr.toString(),
      stdout: stdout.toString()
    };
  } catch (error) {
    const err = error as {
      stderr?: Buffer | string;
      stdout?: Buffer | string;
    };

    return {
      ok: false,
      stderr: err.stderr?.toString() ?? (error instanceof Error ? error.message : "Git command failed."),
      stdout: err.stdout?.toString() ?? ""
    };
  }
}

function parseStatusFiles(statusOutput: string) {
  return statusOutput
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const renamed = line.match(/^R.\s+(.+?)\s+->\s+(.+)$/);

      if (renamed) {
        return renamed[2];
      }

      return line.slice(3).trim();
    })
    .filter(Boolean)
    .sort();
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export async function createGitSnapshotSafety(input: GitSnapshotSafetyInput): Promise<GitSnapshotSafetyResult> {
  const snapshotId = `${input.runnerId}-git-snapshot`;
  const repo = await runGit(input.workspaceRoot, ["rev-parse", "--show-toplevel"]);

  if (!repo.ok) {
    return {
      afterRef: null,
      beforeRef: null,
      blockedReasons: [],
      changedFiles: [],
      errors: [repo.stderr],
      events: [
        event({
          message: "Git snapshot unavailable; workspace is not inside a Git repository.",
          runnerId: input.runnerId,
          type: "snapshot_unavailable"
        })
      ],
      rollbackApplied: false,
      rollbackAvailable: false,
      snapshotId,
      snapshotStatus: "unavailable"
    };
  }

  const beforeRef = await runGit(input.workspaceRoot, ["rev-parse", "HEAD"]);
  const beforeStatus = await runGit(input.workspaceRoot, ["status", "--porcelain"]);

  if (!beforeRef.ok || !beforeStatus.ok) {
    return {
      afterRef: null,
      beforeRef: beforeRef.ok ? beforeRef.stdout.trim() : null,
      blockedReasons: [blocked("unsafe_path", "Unable to capture Git snapshot before approved file write.")],
      changedFiles: [],
      errors: [beforeRef.stderr, beforeStatus.stderr].filter(Boolean),
      events: [
        event({
          message: "Git snapshot failed before approved file write.",
          runnerId: input.runnerId,
          type: "snapshot_unavailable"
        })
      ],
      rollbackApplied: false,
      rollbackAvailable: false,
      snapshotId,
      snapshotStatus: "failed"
    };
  }

  return {
    afterRef: null,
    beforeRef: beforeRef.stdout.trim(),
    blockedReasons: [],
    changedFiles: parseStatusFiles(beforeStatus.stdout),
    errors: [],
    events: [
      event({
        message: "Git snapshot metadata captured before approved file write.",
        metadata: {
          planId: input.planId,
          projectId: input.projectId,
          repoRoot: repo.stdout.trim()
        },
        runnerId: input.runnerId,
        type: "snapshot_created"
      })
    ],
    rollbackApplied: false,
    rollbackAvailable: false,
    snapshotId,
    snapshotStatus: "available"
  };
}

export async function finalizeGitSnapshotSafety(
  input: GitSnapshotSafetyInput,
  snapshot: GitSnapshotSafetyResult,
  verificationOk: boolean
): Promise<GitSnapshotSafetyResult> {
  if (snapshot.snapshotStatus !== "available") {
    return snapshot;
  }

  const afterRef = await runGit(input.workspaceRoot, ["rev-parse", "HEAD"]);
  const status = await runGit(input.workspaceRoot, ["status", "--porcelain"]);
  const diffNames = await runGit(input.workspaceRoot, ["diff", "--name-only"]);
  const binaryDiff = await runGit(input.workspaceRoot, ["diff", "--binary"]);
  const statusFiles = status.ok ? parseStatusFiles(status.stdout) : [];
  const diffFiles = diffNames.ok ? diffNames.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  const changedFiles = unique([...statusFiles, ...diffFiles]).sort();
  const rollbackAvailable = Boolean(snapshot.beforeRef && changedFiles.length > 0);
  const events: RuntimeEvent[] = [
    ...snapshot.events,
    event({
      message: changedFiles.length
        ? `Git snapshot detected ${changedFiles.length} changed file(s) after approved runner execution.`
        : "Git snapshot detected no changed files after approved runner execution.",
      metadata: {
        changedFileCount: changedFiles.length,
        hasBinaryDiff: binaryDiff.ok && binaryDiff.stdout.length > 0
      },
      runnerId: input.runnerId,
      type: "snapshot_changed_files"
    })
  ];

  if (!verificationOk && rollbackAvailable) {
    events.push(event({
      message: "Rollback is available because verification failed after approved file writes.",
      runnerId: input.runnerId,
      type: "rollback_available"
    }));
  }

  return {
    ...snapshot,
    afterRef: afterRef.ok ? afterRef.stdout.trim() : null,
    changedFiles,
    errors: [
      ...snapshot.errors,
      afterRef.ok ? "" : afterRef.stderr,
      status.ok ? "" : status.stderr,
      diffNames.ok ? "" : diffNames.stderr,
      binaryDiff.ok ? "" : binaryDiff.stderr
    ].filter(Boolean),
    events,
    rollbackAvailable: !verificationOk && rollbackAvailable
  };
}

export async function rollbackGitSnapshotFiles(input: {
  changedFiles: string[];
  runnerId: string;
  workspaceRoot: string;
  beforeRef: string;
}): Promise<GitSnapshotSafetyResult> {
  const snapshotId = `${input.runnerId}-git-rollback`;
  const events: RuntimeEvent[] = [];
  const errors: string[] = [];

  for (const file of input.changedFiles) {
    const restored = await runGit(input.workspaceRoot, ["restore", `--source=${input.beforeRef}`, "--", file]);

    if (restored.ok) {
      events.push(event({
        message: `Rollback restored '${file}' from snapshot ref.`,
        runnerId: input.runnerId,
        type: "rollback_applied"
      }));
    } else {
      errors.push(restored.stderr);
      events.push(event({
        message: `Rollback failed for '${file}'.`,
        runnerId: input.runnerId,
        type: "rollback_failed"
      }));
    }
  }

  return {
    afterRef: null,
    beforeRef: input.beforeRef,
    blockedReasons: [],
    changedFiles: input.changedFiles,
    errors,
    events,
    rollbackApplied: errors.length === 0,
    rollbackAvailable: errors.length > 0,
    snapshotId,
    snapshotStatus: errors.length === 0 ? "available" : "failed"
  };
}
