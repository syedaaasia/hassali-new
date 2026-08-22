import type { ProposalContext } from "@/lib/server/ai/proposal-context";
import type { DesignDirectionRequest } from "@/lib/server/design/reference/design-reference-contract";
import type { ProjectDesignContract } from "@/lib/server/design/direction/project-design-contract";

export type WebsiteProposalRepairAuthority = {
  authoritativeBusinessType: string | null;
  authoritativeDomain: string;
  designDirectionRequest: DesignDirectionRequest | null;
  originalUserRequest: string;
  pages: string[];
  projectDesignContract: ProjectDesignContract | null;
  requiredFiles: string[];
  version: 1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value.slice(0, 32)
    : null;
}

function isDesignDirectionRequest(value: unknown): value is DesignDirectionRequest {
  return isRecord(value) &&
    value.version === 1 &&
    typeof value.currentRequest === "string" &&
    Array.isArray(value.references) &&
    Array.isArray(value.profiles);
}

function isProjectDesignContract(value: unknown): value is ProjectDesignContract {
  return isRecord(value) &&
    typeof value.fingerprint === "string" &&
    typeof value.version === "number" &&
    isRecord(value.identity) &&
    Array.isArray(value.references) &&
    isRecord(value.colors) &&
    isRecord(value.typography);
}

export function createWebsiteProposalRepairAuthority(
  context: ProposalContext
): WebsiteProposalRepairAuthority | null {
  if (context.mode !== "WEBSITE") return null;
  return {
    authoritativeBusinessType: context.businessName ?? null,
    authoritativeDomain: context.domain,
    designDirectionRequest: context.designDirectionRequest ?? null,
    originalUserRequest: context.sourcePrompt,
    pages: [...context.pages],
    projectDesignContract: context.projectDesignContract ?? null,
    requiredFiles: [...context.requiredFiles],
    version: 1
  };
}

export function parseWebsiteProposalRepairAuthority(value: unknown): WebsiteProposalRepairAuthority | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const pages = stringArray(value.pages);
  const requiredFiles = stringArray(value.requiredFiles);
  if (
    typeof value.authoritativeDomain !== "string" ||
    typeof value.originalUserRequest !== "string" ||
    !pages ||
    !requiredFiles ||
    (value.authoritativeBusinessType !== null && typeof value.authoritativeBusinessType !== "string")
  ) {
    return null;
  }
  const designDirectionRequest = value.designDirectionRequest === null
    ? null
    : isDesignDirectionRequest(value.designDirectionRequest)
      ? value.designDirectionRequest
      : null;
  const projectDesignContract = value.projectDesignContract === null
    ? null
    : isProjectDesignContract(value.projectDesignContract)
      ? value.projectDesignContract
      : null;
  if (
    (value.designDirectionRequest !== null && !designDirectionRequest) ||
    (value.projectDesignContract !== null && !projectDesignContract)
  ) {
    return null;
  }
  return {
    authoritativeBusinessType: typeof value.authoritativeBusinessType === "string"
      ? value.authoritativeBusinessType
      : null,
    authoritativeDomain: value.authoritativeDomain,
    designDirectionRequest,
    originalUserRequest: value.originalUserRequest,
    pages,
    projectDesignContract,
    requiredFiles,
    version: 1
  };
}

export function repairMayReplaceDesign(failureCodes: string[]) {
  return failureCodes.some((code) =>
    /(?:design_reference|design_authority|design_contract|reference_corruption)/i.test(code)
  );
}

export function repairDesignAuthorityDrift(input: {
  actual: ProjectDesignContract | null | undefined;
  expected: ProjectDesignContract | null | undefined;
  failureCodes: string[];
}) {
  if (!input.expected || repairMayReplaceDesign(input.failureCodes)) return null;
  if (!input.actual) return "REPAIR_DESIGN_AUTHORITY_DRIFT: repaired proposal lost the authoritative design contract.";
  const expectedReferences = input.expected.references.map((reference) => [
    reference.referenceId,
    reference.sourceAttachmentId,
    reference.sourceFingerprint
  ].join(":"));
  const actualReferences = input.actual.references.map((reference) => [
    reference.referenceId,
    reference.sourceAttachmentId,
    reference.sourceFingerprint
  ].join(":"));
  if (
    input.actual.fingerprint !== input.expected.fingerprint ||
    JSON.stringify(actualReferences) !== JSON.stringify(expectedReferences)
  ) {
    return "REPAIR_DESIGN_AUTHORITY_DRIFT: non-design repair attempted to replace the resolved design reference.";
  }
  return null;
}

export function preserveWebsiteProposalContextForRepair(
  context: ProposalContext,
  authority: WebsiteProposalRepairAuthority
): ProposalContext {
  if (context.mode !== "WEBSITE") return context;
  return {
    ...context,
    businessName: authority.authoritativeBusinessType ?? context.businessName,
    designDirectionRequest: authority.designDirectionRequest,
    domain: authority.authoritativeDomain,
    pages: [...authority.pages],
    projectDesignContract: authority.projectDesignContract,
    requiredFiles: [...authority.requiredFiles],
    sourcePrompt: authority.originalUserRequest
  };
}
