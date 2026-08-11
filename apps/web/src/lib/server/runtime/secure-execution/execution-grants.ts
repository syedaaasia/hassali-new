import { randomUUID } from "node:crypto";
import path from "node:path";
import type { ProjectApprovalPolicy } from "@/lib/approval-policy";
import type {
  ExecutionCapability,
  ExecutionGrant,
  ExecutionMode,
  ExecutionRequest,
  ExecutionRisk,
  ExecutionScope
} from "./execution-types";

const grants = new Map<string, ExecutionGrant>();
const maxGrantTtlMs = 10 * 60 * 1000;
const maxStoredGrants = 256;
const riskRank: Record<ExecutionRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function samePath(left: string, right: string) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

export function issueExecutionGrant(input: {
  approvalPolicy: ProjectApprovalPolicy;
  approvalSource: "inline_approval" | "standing_policy";
  capabilities: ExecutionCapability[];
  externalUserId: string;
  maxUses?: number;
  mode: ExecutionMode;
  projectId: string | null;
  riskCeiling?: Exclude<ExecutionRisk, "critical">;
  scopeKind: ExecutionScope["kind"];
  scopeRoot: string;
  ttlMs?: number;
}) {
  const issuedAt = Date.now();
  for (const [id, grant] of grants) {
    if (grant.expiresAt <= issuedAt || grant.uses >= grant.maxUses) grants.delete(id);
  }
  while (grants.size >= maxStoredGrants) {
    const oldest = grants.keys().next().value as string | undefined;
    if (!oldest) break;
    grants.delete(oldest);
  }
  const grant: ExecutionGrant = {
    approvalPolicy: input.approvalPolicy,
    approvalSource: input.approvalSource,
    capabilities: [...new Set(input.capabilities)],
    externalUserId: input.externalUserId,
    expiresAt: issuedAt + Math.min(Math.max(input.ttlMs ?? 5 * 60 * 1000, 1_000), maxGrantTtlMs),
    id: randomUUID(),
    issuedAt,
    maxUses: Math.min(Math.max(input.maxUses ?? 1, 1), 32),
    mode: input.mode,
    projectId: input.projectId,
    riskCeiling: input.riskCeiling ?? "medium",
    scopeKind: input.scopeKind,
    scopeRoot: path.resolve(input.scopeRoot),
    uses: 0
  };
  grants.set(grant.id, grant);
  return grant.id;
}

export function consumeExecutionGrant(request: ExecutionRequest): {
  grant: ExecutionGrant | null;
  reason: "expired" | "invalid" | "scope-mismatch" | null;
} {
  const grant = grants.get(request.grantId);
  if (!grant) return { grant: null, reason: "invalid" };
  if (grant.expiresAt <= Date.now() || grant.uses >= grant.maxUses) {
    grants.delete(grant.id);
    return { grant: null, reason: "expired" };
  }
  if (
    grant.externalUserId !== request.actor.externalUserId ||
    grant.projectId !== request.actor.projectId ||
    grant.mode !== request.mode ||
    grant.scopeKind !== request.scope.kind ||
    !samePath(grant.scopeRoot, request.scope.root) ||
    !grant.capabilities.includes(request.capability) ||
    riskRank[request.risk] > riskRank[grant.riskCeiling]
  ) {
    return { grant: null, reason: "scope-mismatch" };
  }
  grant.uses += 1;
  return { grant, reason: null };
}

export function revokeExecutionGrant(grantId: string) {
  return grants.delete(grantId);
}

export function clearExecutionGrantsForTests() {
  grants.clear();
}
