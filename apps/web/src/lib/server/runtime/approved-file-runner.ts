import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, resolve } from "node:path";
import {
  createGitSnapshotSafety,
  finalizeGitSnapshotSafety,
  type GitSnapshotSafetyResult
} from "@/lib/server/runtime/git-snapshot-safety";
import {
  defaultRuntimePermissionPolicy,
  isPathInsideWorkspace,
  validateRuntimeStep
} from "@/lib/server/runtime/runtime-permissions";
import type {
  ApprovedExecutionPlan,
  ApprovedExecutionStep,
  RuntimeBlockedReason,
  RuntimeEvent,
  RuntimePermissionPolicy,
  RuntimeToolName,
  RuntimeVerificationResult
} from "@/lib/server/runtime/runtime-types";

const runnerAllowedTools: RuntimeToolName[] = [
  "apply_patch",
  "restart_preview",
  "verify_files",
  "write_file"
];

const approvedFileRunnerPolicy: RuntimePermissionPolicy = {
  ...defaultRuntimePermissionPolicy,
  allowedTools: runnerAllowedTools
};

export type ApprovedFileRunnerInput = {
  approvedPlan: ApprovedExecutionPlan;
  files?: Record<string, string>;
  projectId: string;
  workspaceRoot: string;
};

export type ApprovedFileRunnerOutput = {
  appliedSteps: string[];
  blockedSteps: Array<{
    reasons: RuntimeBlockedReason[];
    stepId: string;
  }>;
  errors: string[];
  events: RuntimeEvent[];
  runnerId: string;
  runnerStatus: "blocked" | "completed" | "failed" | "partial";
  skippedSteps: string[];
  snapshot: GitSnapshotSafetyResult;
  verification: RuntimeVerificationResult;
  writtenFiles: string[];
};

function now() {
  return new Date().toISOString();
}

function event(input: {
  message: string;
  metadata?: RuntimeEvent["metadata"];
  runnerId: string;
  stepId?: string;
  type: RuntimeEvent["type"];
}): RuntimeEvent {
  return {
    createdAt: now(),
    message: input.message,
    metadata: input.metadata,
    sessionId: input.runnerId,
    stepId: input.stepId,
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

function resolveInsideWorkspace(workspaceRoot: string, path: string) {
  const target = isAbsolute(path) ? normalize(path) : resolve(workspaceRoot, path);

  if (!isPathInsideWorkspace(target, workspaceRoot)) {
    return null;
  }

  return target;
}

function stepFilePath(step: ApprovedExecutionStep) {
  return step.path?.trim() ?? "";
}

function contentForStep(step: ApprovedExecutionStep, files?: Record<string, string>) {
  if (typeof step.content === "string") {
    return step.content;
  }

  if (step.path && typeof files?.[step.path] === "string") {
    return files[step.path];
  }

  return null;
}

function validateRunnerStep(
  step: ApprovedExecutionStep,
  plan: ApprovedExecutionPlan,
  workspaceRoot: string
) {
  const reasons = validateRuntimeStep(step, plan, approvedFileRunnerPolicy);

  if (!runnerAllowedTools.includes(step.tool)) {
    reasons.push(blocked("unknown_tool", `Approved file runner does not support '${step.tool}'.`));
  }

  if ((step.tool === "write_file" || step.tool === "apply_patch") && !stepFilePath(step)) {
    reasons.push(blocked("unsafe_path", `Step '${step.id}' needs a target path.`));
  }

  if (step.path && !resolveInsideWorkspace(workspaceRoot, step.path)) {
    reasons.push(blocked("external_path_blocked", `Step '${step.id}' targets a path outside the workspace root.`));
  }

  return reasons;
}

async function writeApprovedFile(workspaceRoot: string, path: string, content: string) {
  const target = resolveInsideWorkspace(workspaceRoot, path);

  if (!target) {
    throw new Error(`Refusing to write outside workspace root: ${path}`);
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");

  return target;
}

async function verifyWrittenFiles(writtenFiles: Array<{ content: string; path: string; target: string }>) {
  const details: string[] = [];
  let ok = true;

  for (const file of writtenFiles) {
    try {
      const [stats, content] = await Promise.all([
        stat(file.target),
        readFile(file.target, "utf8")
      ]);

      if (!stats.isFile() || content !== file.content || content.length === 0) {
        ok = false;
        details.push(`${file.path}: verification content mismatch`);
      } else {
        details.push(`${file.path}: exists (${stats.size} bytes)`);
      }
    } catch {
      ok = false;
      details.push(`${file.path}: missing after write`);
    }
  }

  return {
    checkedAt: now(),
    details: details.length ? details : ["No files were written; no file existence checks were required."],
    ok
  };
}

async function captureFileBeforeWrite(target: string) {
  try {
    return {
      content: await readFile(target, "utf8"),
      existed: true
    };
  } catch {
    return {
      content: "",
      existed: false
    };
  }
}

async function rollbackWrites(
  backups: Array<{ content: string; existed: boolean; target: string }>
) {
  for (const backup of [...backups].reverse()) {
    if (backup.existed) {
      await mkdir(dirname(backup.target), { recursive: true });
      await writeFile(backup.target, backup.content, "utf8");
    } else {
      await rm(backup.target, { force: true });
    }
  }
}

export async function runApprovedFilePlan(input: ApprovedFileRunnerInput): Promise<ApprovedFileRunnerOutput> {
  const runnerId = `approved-file-runner-${Date.now()}`;
  const events: RuntimeEvent[] = [
    event({
      message: `Approved file runner received plan '${input.approvedPlan.id}'.`,
      runnerId,
      type: "plan_received"
    })
  ];
  const appliedSteps: string[] = [];
  const skippedSteps: string[] = [];
  const blockedSteps: ApprovedFileRunnerOutput["blockedSteps"] = [];
  const writtenFiles: string[] = [];
  const writtenTargets: Array<{ content: string; path: string; target: string }> = [];
  const backups: Array<{ content: string; existed: boolean; target: string }> = [];
  const errors: string[] = [];
  const snapshotBefore = await createGitSnapshotSafety({
    planId: input.approvedPlan.id,
    projectId: input.projectId,
    runnerId,
    workspaceRoot: input.workspaceRoot
  });

  events.push(...snapshotBefore.events);

  if (input.projectId !== input.approvedPlan.projectId) {
    blockedSteps.push({
      reasons: [blocked("missing_project_id", "Input projectId must match approved plan projectId.")],
      stepId: input.approvedPlan.id
    });
  }

  if (input.workspaceRoot !== input.approvedPlan.workspaceRoot) {
    blockedSteps.push({
      reasons: [blocked("missing_workspace_root", "Input workspaceRoot must match approved plan workspaceRoot.")],
      stepId: input.approvedPlan.id
    });
  }

  const runnableSteps: ApprovedExecutionStep[] = [];

  for (const step of input.approvedPlan.steps) {
    events.push(event({ message: `Checking approved step '${step.id}'.`, runnerId, stepId: step.id, type: "step_started" }));
    const reasons = validateRunnerStep(step, input.approvedPlan, input.workspaceRoot);

    if (reasons.length > 0) {
      blockedSteps.push({ reasons, stepId: step.id });
      events.push(event({ message: `Blocked step '${step.id}'.`, runnerId, stepId: step.id, type: "blocked" }));
      continue;
    }

    if (step.tool === "restart_preview") {
      skippedSteps.push(step.id);
      events.push(event({
        message: "restart_preview recorded as metadata only; no runtime process was touched.",
        runnerId,
        stepId: step.id,
        type: "step_skipped"
      }));
      continue;
    }

    if (step.tool === "verify_files") {
      skippedSteps.push(step.id);
      events.push(event({
        message: "verify_files deferred to final runner verification.",
        runnerId,
        stepId: step.id,
        type: "verification"
      }));
      continue;
    }

    const targetContent = contentForStep(step, input.files);

    if (targetContent === null || targetContent.length === 0) {
      blockedSteps.push({
        reasons: [blocked("write_not_allowed", `Step '${step.id}' has no approved content to write.`)],
        stepId: step.id
      });
      events.push(event({ message: `Blocked step '${step.id}' because no approved content was provided.`, runnerId, stepId: step.id, type: "blocked" }));
      continue;
    }

    runnableSteps.push(step);
  }

  if (blockedSteps.length === 0) {
    for (const step of runnableSteps) {
      try {
        const targetContent = contentForStep(step, input.files);

        if (targetContent === null || targetContent.length === 0) {
          throw new Error(`Step '${step.id}' has no approved content to write.`);
        }

        const target = resolveInsideWorkspace(input.workspaceRoot, stepFilePath(step));

        if (!target) {
          throw new Error(`Refusing to write outside workspace root: ${stepFilePath(step)}`);
        }

        backups.push({ ...(await captureFileBeforeWrite(target)), target });
        await writeApprovedFile(input.workspaceRoot, stepFilePath(step), targetContent);
        writtenFiles.push(stepFilePath(step));
        writtenTargets.push({ content: targetContent, path: stepFilePath(step), target });
        appliedSteps.push(step.id);
        events.push(event({
          message: `Wrote approved file '${step.path}'.`,
          metadata: { path: step.path ?? null, tool: step.tool },
          runnerId,
          stepId: step.id,
          type: "file_written"
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown approved file runner error.";
        errors.push(message);
        events.push(event({ message, runnerId, stepId: step.id, type: "error" }));
        break;
      }
    }
  }

  let verification = await verifyWrittenFiles(writtenTargets);

  if (!verification.ok && errors.length === 0) {
    errors.push("Approved file runner verification failed.");
  }

  if ((errors.length > 0 || !verification.ok) && writtenTargets.length > 0) {
    await rollbackWrites(backups).catch((error) => {
      errors.push(error instanceof Error ? error.message : "Rollback failed.");
    });
    events.push(event({
      message: "Approved file transaction rolled back to the pre-approval snapshot.",
      metadata: { filesWrittenBeforeFailure: writtenTargets.length },
      runnerId,
      type: "rollback_applied"
    }));
    writtenFiles.length = 0;
    appliedSteps.length = 0;
    verification = await verifyWrittenFiles([]);
  }
  const snapshot = await finalizeGitSnapshotSafety(
    {
      planId: input.approvedPlan.id,
      projectId: input.projectId,
      runnerId,
      workspaceRoot: input.workspaceRoot
    },
    snapshotBefore,
    verification.ok && errors.length === 0
  );
  events.push(...snapshot.events.slice(snapshotBefore.events.length));
  events.push(event({
    message: verification.ok ? "Approved file runner verification passed." : "Approved file runner verification failed.",
    runnerId,
    type: "verification"
  }));

  const runnerStatus =
    errors.length > 0
      ? "failed"
      : blockedSteps.length > 0 && appliedSteps.length > 0
        ? "partial"
        : blockedSteps.length > 0
          ? "blocked"
          : "completed";

  return {
    appliedSteps,
    blockedSteps,
    errors,
    events,
    runnerId,
    runnerStatus,
    skippedSteps,
    snapshot,
    verification,
    writtenFiles
  };
}

export async function readApprovedFile(workspaceRoot: string, path: string) {
  const target = resolveInsideWorkspace(workspaceRoot, path);

  if (!target) {
    throw new Error(`Refusing to read outside workspace root: ${path}`);
  }

  return readFile(target, "utf8");
}
