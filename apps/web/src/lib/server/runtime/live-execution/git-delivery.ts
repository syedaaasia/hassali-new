import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { sanitizeUntrustedToolText } from "@/lib/server/intelligence/security-kernel";
import { isServerOwnedProjectWorkspaceRoot } from "../workspace-binding";
import type { ChangeLedger, DeliveryReadiness } from "../verification-recovery/verification-types";
import type { GitDeliveryState, VerifiedDeliveryProjection } from "./live-execution-types";

const execFileAsync = promisify(execFile);
const maxGitOutputBytes = 24_000;
const sensitivePathPart = /^(?:\.env(?:\..*)?|\.git|\.ssh|\.npmrc|\.pypirc|credentials?|secrets?)$/i;

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  return normalized &&
    !normalized.startsWith("/") &&
    !/^[a-z]:/i.test(normalized) &&
    normalized.split("/").every((part) => Boolean(part) && part !== ".." && !sensitivePathPart.test(part))
    ? normalized
    : null;
}

function boundedGitText(value: string, limit = maxGitOutputBytes) {
  return sanitizeUntrustedToolText(value).sanitized
    .replace(/[A-Za-z]:\\[^\r\n]+/g, "[workspace]")
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/((?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)\s*[:=]\s*)[^\s,'\"]+/gi, "$1[redacted]")
    .slice(0, limit);
}

async function runGit(workspaceRoot: string, args: string[]) {
  try {
    const result = await execFileAsync("git", ["-C", workspaceRoot, ...args], {
      encoding: "utf8",
      maxBuffer: maxGitOutputBytes * 2,
      timeout: 15_000,
      windowsHide: true
    });
    return { ok: true, stderr: boundedGitText(result.stderr), stdout: boundedGitText(result.stdout) };
  } catch (error) {
    const failure = error as { stderr?: string; stdout?: string };
    return {
      ok: false,
      stderr: boundedGitText(failure.stderr ?? (error instanceof Error ? error.message : "Git command failed.")),
      stdout: boundedGitText(failure.stdout ?? "")
    };
  }
}

function statusPaths(output: string) {
  return output.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).map((line) => {
    const value = line.slice(3).trim();
    return value.includes(" -> ") ? value.split(" -> ").at(-1)! : value;
  });
}

function unavailable(reason: string): GitDeliveryState {
  return {
    branch: null,
    commitEligible: false,
    commitReason: reason,
    diffPreview: "",
    diffSummary: "Git repository state is unavailable.",
    head: null,
    repositoryAvailable: false,
    taskOwnedPaths: [],
    userOwnedPaths: [],
    warnings: [reason],
    worktreeStatus: "unavailable"
  };
}

export async function inspectGitDeliveryState(input: {
  changeLedger: ChangeLedger;
  delivery: DeliveryReadiness;
  workspaceRoot: string;
}): Promise<GitDeliveryState> {
  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    return unavailable("Git inspection requires an owned Hassali project workspace.");
  }
  const canonicalRoot = await realpath(input.workspaceRoot).catch(() => null);
  if (!canonicalRoot) return unavailable("The owned project workspace is unavailable.");
  const repo = await runGit(canonicalRoot, ["rev-parse", "--show-toplevel"]);
  if (!repo.ok) return unavailable("This project is not inside an available Git repository.");
  const repoRoot = await realpath(repo.stdout.trim()).catch(() => null);
  if (!repoRoot || path.resolve(repoRoot) !== path.resolve(canonicalRoot)) {
    return unavailable("Local commit is limited to a Git repository rooted at the owned project workspace.");
  }
  const [head, branch, status, staged] = await Promise.all([
    runGit(canonicalRoot, ["rev-parse", "--short", "HEAD"]),
    runGit(canonicalRoot, ["branch", "--show-current"]),
    runGit(canonicalRoot, ["status", "--porcelain=v1"]),
    runGit(canonicalRoot, ["diff", "--cached", "--name-only"])
  ]);
  if (!status.ok) return unavailable("Git worktree status could not be read safely.");
  const allChangedPaths = statusPaths(status.stdout).map(safeRelativePath).filter((value): value is string => Boolean(value));
  const changedPaths = allChangedPaths.slice(0, 100);
  const ledgerTaskPaths = input.changeLedger.entries
    .filter((entry) => entry.ownership === "hassali" && entry.operation !== "unchanged")
    .map((entry) => safeRelativePath(entry.path))
    .filter((value): value is string => Boolean(value));
  const taskOwnedPaths = [...new Set(changedPaths.filter((filePath) => ledgerTaskPaths.includes(filePath)))].sort();
  const userOwnedPaths = [...new Set(changedPaths.filter((filePath) => !taskOwnedPaths.includes(filePath)))].sort();
  const trackedTaskPaths = input.changeLedger.entries
    .filter((entry) => taskOwnedPaths.includes(entry.path) && entry.existedBefore)
    .map((entry) => entry.path);
  const [diffStat, diff] = taskOwnedPaths.length
    ? await Promise.all([
        runGit(canonicalRoot, ["diff", "--stat", "--", ...taskOwnedPaths]),
        runGit(canonicalRoot, ["diff", "--no-ext-diff", "--unified=2", "--", ...taskOwnedPaths])
      ])
    : [{ ok: true, stderr: "", stdout: "" }, { ok: true, stderr: "", stdout: "" }];
  const diffContainsRedaction = diff.stdout.includes("[redacted]");
  const warnings: string[] = [];
  if (allChangedPaths.length > changedPaths.length) warnings.push("Git status exceeded the 100-path inspection bound; local commit is disabled.");
  if (userOwnedPaths.length) warnings.push(`${userOwnedPaths.length} pre-existing or unrelated worktree path(s) are excluded from this task.`);
  if (staged.stdout.trim()) warnings.push("Pre-existing staged changes prevent Hassali from creating a local task commit.");
  if (trackedTaskPaths.length !== taskOwnedPaths.length) warnings.push("Untracked task files must be reviewed and committed manually in this bounded foundation.");
  if (diffContainsRedaction) warnings.push("Potential secret material was redacted from the diff; local commit is blocked.");
  const commitEligible = input.delivery.gitEligible &&
    allChangedPaths.length === changedPaths.length &&
    taskOwnedPaths.length > 0 &&
    userOwnedPaths.length === 0 &&
    !staged.stdout.trim() &&
    trackedTaskPaths.length === taskOwnedPaths.length &&
    !diffContainsRedaction;
  const commitReason = commitEligible
    ? "Verified tracked task changes are eligible for one explicit local commit. Push remains separately unauthorized."
    : !input.delivery.gitEligible
      ? "Verification and review evidence is not sufficient for a local commit."
      : !taskOwnedPaths.length
        ? "No task-owned tracked changes are available to commit."
        : userOwnedPaths.length
          ? "Unrelated or pre-existing user changes must remain outside an automated task commit."
          : staged.stdout.trim()
            ? "Pre-existing staged changes must be resolved before a task-scoped commit."
            : diffContainsRedaction
              ? "Potential secret material must be removed before a local task commit."
            : "This bounded commit flow does not add untracked files automatically.";
  return {
    branch: branch.ok && branch.stdout.trim() ? branch.stdout.trim() : null,
    commitEligible,
    commitReason,
    diffPreview: diff.ok ? diff.stdout.trim() : "",
    diffSummary: diffStat.ok && diffStat.stdout.trim() ? diffStat.stdout.trim() : `${taskOwnedPaths.length} task-owned path(s) changed.`,
    head: head.ok ? head.stdout.trim() : null,
    repositoryAvailable: true,
    taskOwnedPaths,
    userOwnedPaths,
    warnings,
    worktreeStatus: changedPaths.length ? "dirty" : "clean"
  };
}

export function projectVerifiedDelivery(input: {
  completionStatus: "BLOCKED" | "CANCELLED" | "COMPLETE_VERIFIED" | "COMPLETE_WITH_LIMITATIONS" | "FAILED";
  delivery: DeliveryReadiness | null;
  limitations: string[];
}): VerifiedDeliveryProjection {
  const status = input.completionStatus === "COMPLETE_VERIFIED"
    ? "verified-ready"
    : input.completionStatus === "COMPLETE_WITH_LIMITATIONS"
      ? "verified-with-warnings"
      : input.completionStatus === "CANCELLED"
        ? "cancelled"
        : input.completionStatus === "BLOCKED"
          ? "blocked"
          : input.delivery?.implementationComplete ? "partial" : "failed";
  const changedFiles = input.delivery?.changedFiles ?? [];
  const warnings = [...new Set([...(input.delivery?.warnings ?? []), ...input.limitations])];
  const summary = status === "verified-ready"
    ? "Implementation, verification, and review evidence support delivery."
    : status === "verified-with-warnings"
      ? "Implementation completed with disclosed verification or review limitations."
      : status === "cancelled"
        ? "The approved task was cancelled before verified delivery."
        : status === "blocked"
          ? "A safety or scope boundary blocked verified delivery."
          : status === "partial"
            ? "Some implementation evidence exists, but delivery is not fully verified."
            : "The task did not produce verified delivery evidence.";
  return {
    artifacts: changedFiles.map((filePath) => ({ kind: "file" as const, label: filePath, path: filePath })),
    changedFiles,
    gitEligible: Boolean(input.delivery?.gitEligible && status === "verified-ready"),
    manualChecks: input.delivery?.manualChecks ?? [],
    pushAuthorized: false,
    status,
    summary,
    warnings
  };
}

export async function createTaskLocalCommit(input: {
  authorizationSource: "inline_git_commit";
  changeLedger: ChangeLedger;
  commitMessage: string;
  delivery: DeliveryReadiness;
  git: GitDeliveryState;
  workspaceRoot: string;
}) {
  if (input.authorizationSource !== "inline_git_commit") return { error: "Explicit local commit authorization is required.", ok: false as const };
  if (!input.git.commitEligible || !input.git.repositoryAvailable || !input.git.taskOwnedPaths.length) {
    return { error: input.git.commitReason, ok: false as const };
  }
  const current = await inspectGitDeliveryState({
    changeLedger: input.changeLedger,
    delivery: input.delivery,
    workspaceRoot: input.workspaceRoot
  });
  if (!current.commitEligible || current.head !== input.git.head || current.branch !== input.git.branch || current.diffPreview !== input.git.diffPreview) {
    return { error: "Git state changed after verification. Refresh and review the task before committing.", ok: false as const };
  }
  const message = input.commitMessage.replace(/[\r\n]+/g, " ").trim().slice(0, 120);
  if (!message) return { error: "A bounded local commit message is required.", ok: false as const };
  const commit = await runGit(input.workspaceRoot, ["commit", "--only", "-m", message, "--", ...current.taskOwnedPaths]);
  if (!commit.ok) return { error: commit.stderr || "Git could not create the local task commit.", ok: false as const };
  const head = await runGit(input.workspaceRoot, ["rev-parse", "--short", "HEAD"]);
  return {
    commitHash: head.ok ? head.stdout.trim() : null,
    message: "Local task commit created. No push was attempted or authorized.",
    ok: true as const,
    pushPerformed: false as const
  };
}
