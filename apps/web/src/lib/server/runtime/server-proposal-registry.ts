import type { RuntimeApprovalChange } from "./runtime-approval-plan";

export type AuthorizedProposalMode = "CODE" | "WEBSITE";
export type AuthorizedProposalApprovalMode = "EXECUTE" | "SUGGEST";

export type AuthorizedServerProposal = {
  approvalMode: AuthorizedProposalApprovalMode;
  approvalResult: Record<string, unknown> | null;
  approvalStatus: "completed" | "executing" | "pending";
  changes: RuntimeApprovalChange[];
  expiresAt: number;
  metadata: Record<string, unknown>;
  mode: AuthorizedProposalMode;
  projectId: string;
  proposalId: string;
  summary: string;
};

const proposalTtlMs = 30 * 60 * 1000;
const maxProposals = 250;
const proposals = new Map<string, AuthorizedServerProposal>();

function key(projectId: string, proposalId: string) {
  return `${projectId}:${proposalId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function prune() {
  const now = Date.now();
  for (const [proposalKey, proposal] of proposals) {
    if (proposal.expiresAt <= now) proposals.delete(proposalKey);
  }
  while (proposals.size > maxProposals) {
    const oldest = proposals.keys().next().value as string | undefined;
    if (!oldest) break;
    proposals.delete(oldest);
  }
}

function modeFromProposal(proposal: Record<string, unknown>): AuthorizedProposalMode | null {
  const candidates = [
    proposal.authoritativeMode,
    proposal.executionMode,
    (proposal.kernelRoutingDecision as Record<string, unknown> | undefined)?.mode
  ].filter((value): value is "ASK" | AuthorizedProposalMode =>
    value === "ASK" || value === "CODE" || value === "WEBSITE"
  );
  if (proposal.generatorMode === "code_generation") candidates.push("CODE");
  if (proposal.generatorMode === "website_generation" || proposal.generatorMode === "small_edit") {
    candidates.push("WEBSITE");
  }
  if (candidates.includes("ASK")) return null;
  const unique = new Set(candidates);
  return unique.size === 1 && (unique.has("CODE") || unique.has("WEBSITE"))
    ? [...unique][0] as AuthorizedProposalMode
    : null;
}

export function registerServerProposal(proposal: Record<string, unknown>) {
  prune();
  const proposalId = typeof proposal.id === "string" ? proposal.id.trim() : "";
  const projectId = typeof proposal.projectId === "string" ? proposal.projectId.trim() : "";
  const changes = Array.isArray(proposal.changes) ? proposal.changes as RuntimeApprovalChange[] : [];
  const mode = modeFromProposal(proposal);
  const approvalMode = proposal.mode === "EXECUTE" || proposal.mode === "SUGGEST"
    ? proposal.mode
    : null;
  if (!proposalId || !projectId || !mode || !approvalMode || !changes.length) return null;
  const record: AuthorizedServerProposal = {
    approvalMode,
    approvalResult: null,
    approvalStatus: "pending",
    changes: clone(changes),
    expiresAt: Date.now() + proposalTtlMs,
    metadata: clone(proposal),
    mode,
    projectId,
    proposalId,
    summary: typeof proposal.summary === "string" ? proposal.summary : `Approved ${mode} proposal`
  };
  proposals.set(key(projectId, proposalId), record);
  return clone(record);
}

export function resolveServerProposal(input: {
  projectId: string;
  proposalId: string;
}) {
  prune();
  const proposal = proposals.get(key(input.projectId, input.proposalId));
  return proposal ? clone(proposal) : null;
}

export function beginServerProposalApproval(input: {
  projectId: string;
  proposalId: string;
}) {
  prune();
  const proposalKey = key(input.projectId, input.proposalId);
  const proposal = proposals.get(proposalKey);
  if (!proposal) return { status: "missing" as const };
  if (proposal.approvalStatus === "completed" && proposal.approvalResult) {
    return {
      result: clone(proposal.approvalResult),
      status: "completed" as const
    };
  }
  if (proposal.approvalStatus === "executing") return { status: "executing" as const };
  proposal.approvalStatus = "executing";
  return { proposal: clone(proposal), status: "acquired" as const };
}

export function completeServerProposalApproval(input: {
  projectId: string;
  proposalId: string;
  result: Record<string, unknown>;
}) {
  const proposal = proposals.get(key(input.projectId, input.proposalId));
  if (!proposal) return false;
  proposal.approvalResult = clone(input.result);
  proposal.approvalStatus = "completed";
  return true;
}

export function releaseServerProposalApproval(input: {
  projectId: string;
  proposalId: string;
}) {
  const proposal = proposals.get(key(input.projectId, input.proposalId));
  if (!proposal || proposal.approvalStatus !== "executing") return false;
  proposal.approvalStatus = "pending";
  return true;
}

export function clearServerProposalRegistry() {
  proposals.clear();
}
