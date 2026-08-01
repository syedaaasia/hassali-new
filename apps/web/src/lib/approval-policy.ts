export type ProjectApprovalPolicy = "approve_for_me" | "ask" | "full_project_access";

export const defaultProjectApprovalPolicy: ProjectApprovalPolicy = "ask";

export const projectApprovalPolicyOptions: Array<{
  description: string;
  label: string;
  value: ProjectApprovalPolicy;
}> = [
  {
    description: "Ask before every file edit or runtime action.",
    label: "Ask for approval",
    value: "ask"
  },
  {
    description: "Apply validation-clean file proposals; ask for warnings, deletes, and runtime actions.",
    label: "Approve for me",
    value: "approve_for_me"
  },
  {
    description: "Use standing approval inside this project; server safety gates still apply.",
    label: "Full project access",
    value: "full_project_access"
  }
];

type ApprovalCandidate = {
  approvalDecision?: {
    approvalAllowed: boolean;
    hasCriticalIssues: boolean;
    hasWarnings: boolean;
  };
  approvalDisabled?: boolean;
  changes: Array<{ action: string }>;
  proposalRoutingMode?: string;
  shouldBlockExecution?: boolean;
  status: string;
};

export function canApplyWithProjectApprovalPolicy(
  policy: ProjectApprovalPolicy,
  proposal: ApprovalCandidate
) {
  if (policy === "ask" || proposal.status !== "pending") return false;
  if (
    !proposal.approvalDecision?.approvalAllowed ||
    proposal.approvalDisabled ||
    proposal.shouldBlockExecution ||
    proposal.proposalRoutingMode === "blocked" ||
    proposal.approvalDecision.hasCriticalIssues
  ) {
    return false;
  }

  if (policy === "full_project_access") return true;

  return !proposal.approvalDecision?.hasWarnings &&
    proposal.proposalRoutingMode !== "review_required" &&
    proposal.changes.length > 0 &&
    proposal.changes.every((change) =>
      change.action === "create" ||
      change.action === "modify" ||
      change.action === "update" ||
      change.action === "write_file"
    );
}

export function approvalPolicyStorageKey(projectId: string) {
  return `hassali:approval-policy:${projectId}`;
}

export function isProjectApprovalPolicy(value: unknown): value is ProjectApprovalPolicy {
  return value === "ask" || value === "approve_for_me" || value === "full_project_access";
}
