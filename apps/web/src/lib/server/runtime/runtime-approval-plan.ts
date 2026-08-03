import type {
  ApprovedExecutionPlan,
  ApprovedExecutionStep,
  RuntimeBlockedReason,
  RuntimeToolName
} from "@/lib/server/runtime/runtime-types";
import { normalizePath, validateSafePath } from "@/lib/utils/path";
import {
  defaultProjectApprovalPolicy,
  isProjectApprovalPolicy,
  type ProjectApprovalPolicy
} from "@/lib/approval-policy";

export type RuntimeApprovalChange = {
  action?: unknown;
  type?: unknown;
  path?: unknown;
  proposedContent?: unknown;
  summary?: unknown;
};

export type RuntimeApprovalBody = {
  approvalPolicy?: unknown;
  approvalSource?: unknown;
  projectId?: unknown;
  proposalId?: unknown;
  productMode?: unknown;
  snapshotStatus?: unknown;
  workerType?: unknown;
  workspaceRoot?: unknown;
};

export type RuntimeApprovalValidationResult =
  | {
      error: string;
      status: 400;
    }
  | {
      approvalPolicy: ProjectApprovalPolicy;
      approvalSource: "inline_approval" | "standing_policy";
      projectId: string;
      proposalId: string;
    };

const supportedWriteActions = new Set(["create", "create_file", "modify", "update", "update_file", "write_file"]);
const metadataActions = new Set([
  "reload_preview",
  "restart_preview",
  "restart_runtime",
  "run_dev_server",
  "start_runtime",
  "stop_runtime"
]);
const blockedDeleteActions = new Set(["delete", "remove", "unlink"]);

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

function actionName(change: RuntimeApprovalChange) {
  const value = typeof change.type === "string" ? change.type : change.action;

  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isShellAction(change: RuntimeApprovalChange) {
  const action = actionName(change);

  return action === "execute_shell" || action === "runtime_command";
}

function normalizeChangePath(value: unknown, workspaceRoot: string) {
  const path = normalizePath(value);

  try {
    validateSafePath(path, workspaceRoot);
    return path;
  } catch {
    return null;
  }
}

function changeToStep(
  change: RuntimeApprovalChange,
  index: number,
  workspaceRoot: string,
  productMode: "ASK" | "CODE" | "WEBSITE"
): {
  runtimeWarning: string | null;
  blockedReasons: RuntimeBlockedReason[];
  skipped: string | null;
  step: ApprovedExecutionStep | null;
} {
  const action = actionName(change);
  const summary = typeof change.summary === "string" ? change.summary : `Approved proposal change ${index + 1}`;

  if (isShellAction(change)) {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("shell_command_blocked", "Shell command execution is blocked for runtime approval.")],
      skipped: null,
      step: null
    };
  }

  if (blockedDeleteActions.has(action)) {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("write_not_allowed", "Delete actions are blocked in this runtime approval phase.")],
      skipped: null,
      step: null
    };
  }

  if (action === "delete_file") {
    const path = normalizeChangePath(change.path, workspaceRoot);
    if (productMode !== "WEBSITE") {
      return {
        runtimeWarning: null,
        blockedReasons: [blocked("write_not_allowed", "delete_file is restricted to approved WEBSITE replacement proposals.")],
        skipped: null,
        step: null
      };
    }
    if (!path) {
      return {
        runtimeWarning: null,
        blockedReasons: [blocked("unsafe_path", "A safe relative delete path is required.")],
        skipped: null,
        step: null
      };
    }
    return {
      blockedReasons: [],
      runtimeWarning: null,
      skipped: null,
      step: {
        approved: true,
        id: `proposal-change-${index}`,
        path,
        summary,
        tool: "delete_file"
      }
    };
  }

  if (metadataActions.has(action)) {
    return {
      blockedReasons: [],
      runtimeWarning: `Runtime action '${action}' was recorded as optional preview metadata and was not executed during file approval.`,
      skipped: summary,
      step: null
    };
  }

  if (!supportedWriteActions.has(action)) {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("unknown_tool", `Unsupported proposal action '${action || "unknown"}'.`)],
      skipped: null,
      step: null
    };
  }

  const path = normalizeChangePath(change.path, workspaceRoot);

  if (!path) {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("unsafe_path", "A safe relative file path is required.")],
      skipped: null,
      step: null
    };
  }

  if (typeof change.proposedContent !== "string") {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("write_not_allowed", `Approved change for '${path}' is missing proposedContent.`)],
      skipped: null,
      step: null
    };
  }

  const tool: RuntimeToolName = "write_file";

  return {
    blockedReasons: [],
    runtimeWarning: null,
    skipped: null,
    step: {
      approved: true,
      content: change.proposedContent,
      id: `proposal-change-${index}`,
      path,
      summary,
      tool
    }
  };
}

export function buildApprovedPlanFromProposal(input: {
  changes: RuntimeApprovalChange[];
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  proposalId: string;
  workspaceRoot: string;
}) {
  const steps: ApprovedExecutionStep[] = [];
  const blockedReasons: RuntimeBlockedReason[] = [];
  const runtimeWarnings: string[] = [];
  const skippedSummaries: string[] = [];

  input.changes.forEach((change, index) => {
    const converted = changeToStep(change, index, input.workspaceRoot, input.productMode);

    blockedReasons.push(...converted.blockedReasons);

    if (converted.runtimeWarning) {
      runtimeWarnings.push(converted.runtimeWarning);
    }

    if (converted.skipped) {
      skippedSummaries.push(converted.skipped);
    }

    if (converted.step) {
      steps.push(converted.step);
    }
  });

  const plan: ApprovedExecutionPlan = {
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    id: input.proposalId,
    mode: input.productMode === "WEBSITE" ? "WEBSITE" : "CODE",
    projectId: input.projectId,
    steps: [...new Map(steps.map((step) => [step.path ?? step.id, step])).values()],
    summary: `Approved proposal ${input.proposalId}`,
    workspaceRoot: input.workspaceRoot
  };

  return {
    blockedReasons,
    plan,
    runtimeWarnings,
    skippedSummaries
  };
}

export function validateRuntimeApprovalRequest(body: RuntimeApprovalBody | null): RuntimeApprovalValidationResult {
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const proposalId = typeof body?.proposalId === "string" ? body.proposalId.trim() : "";
  if (!projectId) {
    return { error: "projectId is required.", status: 400 };
  }

  if (!proposalId) {
    return { error: "proposalId is required.", status: 400 };
  }

  return {
    approvalPolicy: isProjectApprovalPolicy(body?.approvalPolicy)
      ? body.approvalPolicy
      : defaultProjectApprovalPolicy,
    approvalSource: body?.approvalSource === "standing_policy" ? "standing_policy" : "inline_approval",
    projectId,
    proposalId
  };
}
