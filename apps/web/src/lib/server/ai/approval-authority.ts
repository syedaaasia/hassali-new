import type { ProposalContext } from "@/lib/server/ai/proposal-context";

export type ApprovalDecision = {
  approvalAllowed: boolean;
  criticalIssues: string[];
  decisionSource: "client-normalized" | "server";
  hasCriticalIssues: boolean;
  hasWarnings: boolean;
  reviewItems: string[];
  warnings: string[];
};

type ProposalLike = {
  changes: Array<{
    action: string;
    path?: string;
    proposedContent?: string;
    summary?: string;
  }>;
  approvalDisabled?: boolean;
  blockedReason?: string;
  contradictionStatus?: string;
  domainValidationStatus?: string;
  generatorContractStatus?: string;
  proposalRoutingReasons?: Array<{
    code: string;
    message: string;
    severity: "high" | "info" | "medium";
  }>;
  proposalQualityStatus?: string;
  proposalRepairStatus?: string;
  proposalRoutingMode?: string;
  proposalRoutingWarnings?: Array<{
    message: string;
  }>;
  publicCopyCleanStatus?: string;
  sectionCopyQualityStatus?: string;
  selfReviewStatus?: string;
  shouldBlockExecution?: boolean;
  staleTermScanStatus?: string;
  summary?: string;
  visualValidationStatus?: string;
  validationFilePaths?: string[];
};

const allowedRuntimeActions = new Set(["reload_preview", "restart_runtime", "stop_runtime"]);
const applyUnsafePlaceholderPatterns = [
  /\bCurrent Prompt Website\b/i,
  /\bcontact\s*\/\s*unknown\b/i,
  /\bdomain-specific hero\b/i,
  /\bproduct proof\s*\/\s*contact path\b/i,
  /\bunknown with clear guidance\b/i,
  /\bSupport, warranty, shipping, and contact details for Current Prompt Website\b/i,
  /\bdocument dataset domain\s*=\s*Current Prompt Website\b/i
];

function normalize(value: string) {
  return value.toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function isFileAction(action: string) {
  return action === "create" || action === "update";
}

function isUnsafePath(path: string) {
  return path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-z]:/i.test(path) ||
    path.split(/[\\/]+/).some((part) => part === ".." || part === "." || part.trim().length === 0);
}

function generatedFileMap(proposal: ProposalLike) {
  return Object.fromEntries(
    proposal.changes
      .filter((change) => isFileAction(change.action) && change.path)
      .map((change) => [change.path as string, change.proposedContent ?? ""])
  );
}

function forbiddenSignalsFor(context: ProposalContext) {
  const domain = normalize(context.domain);

  if (/\b(?:hvac|cleaning|repair|local service)\b/.test(domain)) {
    return ["clear services studio"];
  }

  if (domain.includes("seafood") || domain.includes("restaurant")) {
    return ["television", "electronics", "oled", "qled", "crm", "local service", "smart tv showroom"];
  }

  if (domain.includes("crm")) {
    return ["local service", "television shop", "oled", "qled", "seafood restaurant", "lobster", "oysters"];
  }

  if (domain.includes("ice_cream") || domain.includes("ice cream")) {
    return ["seafood", "oysters", "lobster", "crm", "television", "electronics"];
  }

  return ["local service", "clear services studio"];
}

function reviewWarnings(proposal: ProposalLike) {
  const reasonWarnings = (proposal.proposalRoutingReasons ?? [])
    .filter((reason) => reason.severity !== "info")
    .map((reason) => reason.message);
  const explicitWarnings = (proposal.proposalRoutingWarnings ?? []).map((warning) => warning.message);

  return unique([...reasonWarnings, ...explicitWarnings]);
}

function stripStaleBlockedSummary(summary: string | undefined) {
  if (!summary) return summary;

  return summary
    .replace(/\s*(?:Prompt sovereignty|Domain validation|Proposal quality gate|Asset visual validator) blocked this proposal:[^.]*\./gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildApprovalDecision(input: {
  proposal: ProposalLike;
  proposalContext: ProposalContext;
}): ApprovalDecision {
  const criticalIssues: string[] = [];
  const files = generatedFileMap(input.proposal);
  const fileNames = Object.keys(files);
  const validationFileNames = input.proposal.validationFilePaths?.length
    ? input.proposal.validationFilePaths
    : fileNames;

  if (input.proposal.approvalDisabled) {
    criticalIssues.push(input.proposal.blockedReason ?? "proposal approval is disabled");
  }

  if (input.proposal.shouldBlockExecution) {
    criticalIssues.push(input.proposal.blockedReason ?? "proposal execution is blocked");
  }

  if (input.proposal.proposalRoutingMode === "blocked") {
    criticalIssues.push(input.proposal.blockedReason ?? "proposal routing is blocked");
  }

  if (input.proposal.selfReviewStatus === "FAIL") {
    criticalIssues.push("Self Review failed this proposal");
  }

  if (input.proposal.proposalQualityStatus === "blocked") {
    criticalIssues.push(input.proposal.blockedReason ?? "proposal quality gate blocked this proposal");
  }

  if (input.proposal.domainValidationStatus === "blocked") {
    criticalIssues.push(input.proposal.blockedReason ?? "domain validation blocked this proposal");
  }

  if (input.proposal.generatorContractStatus === "blocked") {
    criticalIssues.push(input.proposal.blockedReason ?? "generator contract blocked this proposal");
  }

  if (
    input.proposal.contradictionStatus === "blocked" ||
    input.proposal.publicCopyCleanStatus === "blocked" ||
    input.proposal.sectionCopyQualityStatus === "blocked" ||
    input.proposal.staleTermScanStatus === "blocked" ||
    input.proposal.visualValidationStatus === "blocked"
  ) {
    criticalIssues.push(input.proposal.blockedReason ?? "one or more validation layers blocked this proposal");
  }

  if (
    input.proposal.proposalRepairStatus === "failed" ||
    input.proposal.proposalRepairStatus === "keep_blocked" ||
    input.proposal.proposalRepairStatus === "partial_repair"
  ) {
    criticalIssues.push("repair did not produce an apply-safe proposal");
  }

  for (const change of input.proposal.changes) {
    if (change.action === "delete_file") {
      if (input.proposalContext.mode !== "WEBSITE") {
        criticalIssues.push("delete_file is restricted to WEBSITE replacement proposals");
      } else if (!change.path || isUnsafePath(change.path)) {
        criticalIssues.push(`unsafe delete path ${change.path ?? "unknown"}`);
      }
      continue;
    }

    if (isFileAction(change.action)) {
      if (!change.path) {
        criticalIssues.push("file mutation is missing a path");
      } else if (isUnsafePath(change.path)) {
        criticalIssues.push(`unsafe file path ${change.path}`);
      }

      if (typeof change.proposedContent !== "string") {
        criticalIssues.push(`file mutation for ${change.path ?? "unknown"} is missing proposed content`);
      } else if (applyUnsafePlaceholderPatterns.some((pattern) => pattern.test(change.proposedContent ?? ""))) {
        criticalIssues.push(`apply-unsafe placeholder repair content detected in ${change.path ?? "unknown file"}`);
      }
    } else if (!allowedRuntimeActions.has(change.action)) {
      criticalIssues.push(`unsupported or dangerous action ${change.action}`);
    }
  }

  for (const requiredFile of input.proposalContext.requiredFiles) {
    if (!validationFileNames.includes(requiredFile)) {
      criticalIssues.push(`missing required file ${requiredFile}`);
    }
  }

  if (input.proposalContext.mode === "WEBSITE") {
    const allowed = new Set(input.proposalContext.requiredFiles);
    for (const path of fileNames) {
      if (path.endsWith(".html") && !allowed.has(path)) {
        criticalIssues.push(`unexpected website page ${path}`);
      }
    }
  }

  const generatedText = Object.entries(files)
    .filter(([path]) => path.toLowerCase().endsWith(".html"))
    .map(([path, content]) => `FILE:${path}\n${content}`)
    .join("\n")
    .toLowerCase();

  for (const signal of forbiddenSignalsFor(input.proposalContext)) {
    if (generatedText.includes(signal)) {
      criticalIssues.push(`wrong-domain generated output contains ${signal}`);
    }
  }

  const warnings = reviewWarnings(input.proposal);
  const uniqueCritical = unique(criticalIssues);
  const approvalAllowed = uniqueCritical.length === 0;

  return {
    approvalAllowed,
    criticalIssues: uniqueCritical,
    decisionSource: "server",
    hasCriticalIssues: uniqueCritical.length > 0,
    hasWarnings: warnings.length > 0,
    reviewItems: warnings,
    warnings,
  };
}

export function applyApprovalDecision<T extends ProposalLike>(
  proposal: T,
  decision: ApprovalDecision
): T & {
  approvalDecision: ApprovalDecision;
  approvalDisabled: boolean;
  approvalRecommendation: "approve" | "reject" | "review";
  blockedReason?: string;
  proposalRoutingMode?: "blocked" | "normal" | "review_required";
  shouldBlockExecution: boolean;
} {
  const proposalRoutingMode = decision.hasCriticalIssues
    ? "blocked"
    : decision.hasWarnings
      ? "review_required"
      : "normal";

  return {
    ...proposal,
    approvalDecision: decision,
    approvalDisabled: decision.hasCriticalIssues,
    approvalRecommendation: decision.hasCriticalIssues ? "reject" : decision.hasWarnings ? "review" : "approve",
    blockedReason: decision.hasCriticalIssues ? decision.criticalIssues.join("; ") : proposal.blockedReason,
    proposalRoutingMode,
    shouldBlockExecution: decision.hasCriticalIssues,
    summary: decision.hasCriticalIssues ? proposal.summary : stripStaleBlockedSummary(proposal.summary),
  };
}
