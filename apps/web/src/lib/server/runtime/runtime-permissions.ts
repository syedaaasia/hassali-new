import { isAbsolute, normalize, relative } from "node:path";
import type {
  ApprovedExecutionPlan,
  ApprovedExecutionStep,
  RuntimeBlockedReason,
  RuntimePermissionPolicy,
  RuntimeToolName
} from "@/lib/server/runtime/runtime-types";

export const safeRuntimeTools: RuntimeToolName[] = [
  "apply_patch",
  "delete_file",
  "list_files",
  "read_file",
  "restart_preview",
  "run_typecheck",
  "verify_files",
  "write_file"
];

export const defaultRuntimePermissionPolicy: RuntimePermissionPolicy = {
  allowExternalPaths: false,
  allowPackageInstalls: false,
  allowShellCommands: false,
  allowedTools: safeRuntimeTools,
  requireApproval: true,
  requireProjectId: true,
  requireWorkspaceRoot: true
};

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

export function isPathInsideWorkspace(path: string, workspaceRoot: string) {
  if (!path || !workspaceRoot || !isAbsolute(workspaceRoot)) {
    return false;
  }

  const normalizedRoot = normalize(workspaceRoot);
  const normalizedTarget = normalize(isAbsolute(path) ? path : `${normalizedRoot}/${path}`);
  const relativePath = relative(normalizedRoot, normalizedTarget);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

export function validateRuntimeStep(
  step: ApprovedExecutionStep,
  plan: ApprovedExecutionPlan,
  policy: RuntimePermissionPolicy = defaultRuntimePermissionPolicy
): RuntimeBlockedReason[] {
  const reasons: RuntimeBlockedReason[] = [];

  if (!policy.allowedTools.includes(step.tool)) {
    reasons.push(blocked("unknown_tool", `Runtime tool '${step.tool}' is not allowed.`));
  }

  if (!step.approved) {
    reasons.push(blocked("unapproved_step", `Execution step '${step.id}' is not approved.`));
  }

  if (step.path && !isPathInsideWorkspace(step.path, plan.workspaceRoot)) {
    reasons.push(blocked("external_path_blocked", `Path '${step.path}' is outside the workspace root.`));
  }

  return reasons;
}

export function validateApprovedExecutionPlan(
  plan: ApprovedExecutionPlan,
  policy: RuntimePermissionPolicy = defaultRuntimePermissionPolicy
): RuntimeBlockedReason[] {
  const reasons: RuntimeBlockedReason[] = [];

  if (!plan.projectId) {
    reasons.push(blocked("missing_project_id", "Approved execution plan must include a projectId."));
  }

  if (!plan.workspaceRoot || !isAbsolute(plan.workspaceRoot)) {
    reasons.push(blocked("missing_workspace_root", "Approved execution plan must include an absolute workspace root."));
  }

  for (const step of plan.steps) {
    reasons.push(...validateRuntimeStep(step, plan, policy));
  }

  return reasons;
}
