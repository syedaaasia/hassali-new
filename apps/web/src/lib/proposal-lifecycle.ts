export type ProposalLifecycleStatus =
  | "applied"
  | "applying"
  | "expired"
  | "failed"
  | "pending"
  | "rejected"
  | "submitting";

export type ProposalLifecycleSnapshot = {
  error?: string;
  result?: Record<string, unknown>;
  status: ProposalLifecycleStatus;
  updatedAt?: string;
};

export function proposalLifecycleIsActionable(status: ProposalLifecycleStatus) {
  return status === "pending";
}

export function proposalLifecycleLabel(status: ProposalLifecycleStatus) {
  if (status === "submitting") return "Approving...";
  if (status === "applying") return "Applying changes...";
  if (status === "applied") return "Applied";
  if (status === "rejected") return "Rejected";
  if (status === "expired") return "Expired - regenerate this proposal";
  if (status === "failed") return "Apply failed";
  return "Pending approval";
}

export function normalizeProposalLifecycleSnapshot(value: unknown): ProposalLifecycleSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "pending" };
  const record = value as Record<string, unknown>;
  const status = ["applied", "applying", "expired", "failed", "pending", "rejected", "submitting"].includes(String(record.status))
    ? record.status as ProposalLifecycleStatus
    : "pending";
  return {
    ...(typeof record.error === "string" ? { error: record.error } : {}),
    ...(record.result && typeof record.result === "object" && !Array.isArray(record.result) ? { result: record.result as Record<string, unknown> } : {}),
    status,
    ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {})
  };
}
