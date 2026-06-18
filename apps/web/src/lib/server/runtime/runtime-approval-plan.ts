import { isAbsolute } from "node:path";
import { normalizeRuntimeWorkerType, type RuntimeWorkerType } from "@/lib/server/runtime/runtime-adapter-selector";
import type {
  ApprovedExecutionPlan,
  ApprovedExecutionStep,
  RuntimeBlockedReason,
  RuntimeToolName
} from "@/lib/server/runtime/runtime-types";

export type RuntimeApprovalChange = {
  action?: unknown;
  path?: unknown;
  proposedContent?: unknown;
  summary?: unknown;
};

export type RuntimeApprovalBody = {
  changes?: unknown;
  projectId?: unknown;
  proposalId?: unknown;
  productMode?: unknown;
  proposalMetadata?: unknown;
  riskLevel?: unknown;
  snapshotStatus?: unknown;
  taskKind?: unknown;
  workerType?: unknown;
  workspaceRoot?: unknown;
};

export type RuntimeApprovalValidationResult =
  | {
      error: string;
      status: 400;
    }
  | {
      changes: RuntimeApprovalChange[];
      projectId: string;
      proposalId: string;
      workerType: RuntimeWorkerType;
    };

const supportedWriteActions = new Set(["create", "modify", "update", "write_file"]);
const metadataActions = new Set([
  "reload_preview",
  "restart_preview",
  "restart_runtime",
  "run_dev_server",
  "start_runtime",
  "stop_runtime"
]);
const blockedDeleteActions = new Set(["delete", "remove", "unlink"]);

function normalizeChangePath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "");

  if (!normalized || isAbsolute(value)) {
    return null;
  }

  const segments = normalized.split("/");
  const unsafe = segments.some((segment) => !segment || segment === "." || segment === "..");

  return unsafe ? null : normalized;
}

function blocked(code: RuntimeBlockedReason["code"], message: string): RuntimeBlockedReason {
  return {
    code,
    message,
    severity: "high"
  };
}

function packageOrShellBlocked(summary: string) {
  if (/npm\s+install|pnpm\s+add|yarn\s+add|pip\s+install|bun\s+add/i.test(summary)) {
    return blocked("package_install_blocked", "Package installation is blocked for runtime approval.");
  }

  if (/\b(?:shell|terminal|bash|powershell|cmd\.exe)\b/i.test(summary)) {
    return blocked("shell_command_blocked", "Shell command execution is blocked for runtime approval.");
  }

  return null;
}

function changeToStep(
  change: RuntimeApprovalChange,
  index: number
): {
  runtimeWarning: string | null;
  blockedReasons: RuntimeBlockedReason[];
  skipped: string | null;
  step: ApprovedExecutionStep | null;
} {
  const action = typeof change.action === "string" ? change.action.trim().toLowerCase() : "";
  const summary = typeof change.summary === "string" ? change.summary : `Approved proposal change ${index + 1}`;

  if (blockedDeleteActions.has(action)) {
    return {
      runtimeWarning: null,
      blockedReasons: [blocked("write_not_allowed", "Delete actions are blocked in this runtime approval phase.")],
      skipped: null,
      step: null
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

  const summaryBlock = packageOrShellBlocked(summary);

  if (summaryBlock) {
    return {
      runtimeWarning: null,
      blockedReasons: [summaryBlock],
      skipped: null,
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

  const path = normalizeChangePath(change.path);

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
  projectId: string;
  proposalId: string;
  workspaceRoot: string;
}) {
  const steps: ApprovedExecutionStep[] = [];
  const blockedReasons: RuntimeBlockedReason[] = [];
  const runtimeWarnings: string[] = [];
  const skippedSummaries: string[] = [];

  input.changes.forEach((change, index) => {
    const converted = changeToStep(change, index);

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
    mode: "CODE",
    projectId: input.projectId,
    steps,
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
  const workerType = normalizeRuntimeWorkerType(body?.workerType);

  if (!projectId) {
    return { error: "projectId is required.", status: 400 };
  }

  if (!proposalId) {
    return { error: "proposalId is required.", status: 400 };
  }

  if (!Array.isArray(body?.changes)) {
    return { error: "changes array is required.", status: 400 };
  }

  return {
    changes: body.changes as RuntimeApprovalChange[],
    projectId,
    proposalId,
    workerType
  };
}
