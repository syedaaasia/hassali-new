import type { CodeCommandResult, CodeCommandSpec, CodeExecutionReport, CodeProgressEvent } from "../code-execution-types";
import { inspectGitDeliveryState, projectVerifiedDelivery } from "./git-delivery";
import {
  appendLiveTaskOutput,
  appendLiveTaskTimeline,
  attachLiveTaskDelivery,
  finishLiveExecutionTask,
  getLiveExecutionTask
} from "./live-execution-manager";
import type { ExecutionTimelineStage, ExecutionTimelineStatus } from "./live-execution-types";

type Authority = {
  externalUserId: string;
  projectId: string;
  taskId: string;
};

function stageFor(state: CodeProgressEvent["state"]): ExecutionTimelineStage {
  if (state === "INSPECTING") return "inspection";
  if (state === "DIAGNOSING" || state === "REPAIRING") return "repair";
  if (state === "REVIEWING") return "review";
  if (state === "VERIFYING" || state === "TESTING") return "verification";
  if (state === "COMPLETE" || state === "COMPLETE_WITH_LIMITATIONS") return "delivery";
  return "execution";
}

function timelineStatus(status: CodeProgressEvent["status"]): ExecutionTimelineStatus {
  if (status === "active") return "active";
  if (status === "complete") return "complete";
  if (status === "failed") return "failed";
  return "pending";
}

export function recordCodeProgress(input: Authority & { event: CodeProgressEvent }) {
  return appendLiveTaskTimeline({
    blocking: input.event.state === "BLOCKED",
    detail: `Execution state: ${input.event.state.toLowerCase().replace(/_/g, " ")}.`,
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "orchestrator",
    stage: stageFor(input.event.state),
    status: input.event.state === "CANCELLED" ? "cancelled" : timelineStatus(input.event.status),
    taskId: input.taskId,
    title: input.event.label
  });
}

export function recordCodeCommandResult(input: Authority & { command: CodeCommandSpec; result: CodeCommandResult }) {
  return appendLiveTaskTimeline({
    blocking: input.result.status === "FAILED",
    command: { id: input.command.id, label: input.command.label },
    detail: input.result.outputExcerpt || `${input.command.label} produced no output.`,
    durationMs: input.result.durationMs,
    execution: { capability: "repository.verify", scope: "owned project" },
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "tool",
    stage: "verification",
    status: input.result.status === "PASSED" ? "complete" : input.result.status === "CANCELLED" ? "cancelled" : "failed",
    taskId: input.taskId,
    title: `${input.command.label} ${input.result.status.toLowerCase()}`,
    tool: { name: input.command.command, status: input.result.status.toLowerCase() },
    warning: input.result.failureType
  });
}

export function recordCodeOutput(input: Authority & {
  commandId: string;
  stream: "stderr" | "stdout";
  text: string;
}) {
  return appendLiveTaskOutput(input);
}

export async function finalizeCodeLiveExecution(input: Authority & {
  report: CodeExecutionReport;
  workspaceRoot: string;
}) {
  const postExecution = input.report.postExecution;
  let deliverySummary = projectVerifiedDelivery({
    completionStatus: input.report.completionStatus,
    delivery: postExecution?.delivery ?? null,
    limitations: input.report.limitations
  });
  const git = postExecution
    ? await inspectGitDeliveryState({
        changeLedger: postExecution.changeLedger,
        delivery: postExecution.delivery,
        workspaceRoot: input.workspaceRoot
      })
    : {
        branch: null,
        commitEligible: false,
        commitReason: "Git delivery is unavailable because post-execution evidence was not produced.",
        diffPreview: "",
        diffSummary: "Git delivery evidence is unavailable.",
        head: null,
        repositoryAvailable: false,
        taskOwnedPaths: [],
        userOwnedPaths: [],
        warnings: ["Post-execution evidence is unavailable."],
        worktreeStatus: "unavailable" as const
      };
  if (!git.commitEligible && deliverySummary.gitEligible) {
    deliverySummary = {
      ...deliverySummary,
      gitEligible: false,
      warnings: [...deliverySummary.warnings, git.commitReason]
    };
  }
  if (postExecution) {
    attachLiveTaskDelivery({
      context: { changeLedger: postExecution.changeLedger, delivery: postExecution.delivery },
      delivery: deliverySummary,
      externalUserId: input.externalUserId,
      git,
      projectId: input.projectId,
      taskId: input.taskId
    });
  }
  appendLiveTaskTimeline({
    blocking: deliverySummary.status === "blocked" || deliverySummary.status === "failed",
    detail: deliverySummary.summary,
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "delivery",
    stage: "delivery",
    status: deliverySummary.status === "verified-ready"
      ? "complete"
      : deliverySummary.status === "verified-with-warnings" || deliverySummary.status === "partial"
        ? "warning"
        : deliverySummary.status === "cancelled" ? "cancelled" : deliverySummary.status,
    taskId: input.taskId,
    title: deliverySummary.status.replace(/-/g, " ")
  });
  appendLiveTaskTimeline({
    detail: git.commitReason,
    externalUserId: input.externalUserId,
    projectId: input.projectId,
    source: "git",
    stage: "git",
    status: git.commitEligible ? "pending" : git.repositoryAvailable ? "warning" : "blocked",
    taskId: input.taskId,
    title: git.commitEligible ? "Local commit available" : "Local commit unavailable",
    userAction: git.commitEligible
      ? { action: "local_commit", label: "Create local commit", required: true }
      : null,
    warning: git.warnings[0] ?? null
  });
  const status = input.report.completionStatus === "CANCELLED"
    ? "cancelled"
    : input.report.completionStatus === "BLOCKED"
      ? "blocked"
      : input.report.completionStatus === "FAILED"
        ? "failed"
        : "completed";
  finishLiveExecutionTask({ ...input, status });
  const snapshot = getLiveExecutionTask(input);
  return {
    ...input.report,
    deliverySummary,
    git,
    timeline: snapshot?.timeline ?? input.report.timeline ?? []
  };
}
