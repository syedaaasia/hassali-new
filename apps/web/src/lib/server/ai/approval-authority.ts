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
  proposalRoutingReasons?: Array<{
    code: string;
    message: string;
    severity: "high" | "info" | "medium";
  }>;
  proposalRoutingWarnings?: Array<{
    message: string;
  }>;
  summary?: string;
};

const allowedRuntimeActions = new Set(["reload_preview", "restart_runtime", "stop_runtime"]);

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

export function buildApprovalDecision(input: {
  proposal: ProposalLike;
  proposalContext: ProposalContext;
}): ApprovalDecision {
  const criticalIssues: string[] = [];
  const files = generatedFileMap(input.proposal);
  const fileNames = Object.keys(files);

  for (const change of input.proposal.changes) {
    if (isFileAction(change.action)) {
      if (!change.path) {
        criticalIssues.push("file mutation is missing a path");
      } else if (isUnsafePath(change.path)) {
        criticalIssues.push(`unsafe file path ${change.path}`);
      }

      if (typeof change.proposedContent !== "string") {
        criticalIssues.push(`file mutation for ${change.path ?? "unknown"} is missing proposed content`);
      }
    } else if (!allowedRuntimeActions.has(change.action)) {
      criticalIssues.push(`unsupported or dangerous action ${change.action}`);
    }
  }

  for (const requiredFile of input.proposalContext.requiredFiles) {
    if (!fileNames.includes(requiredFile)) {
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

  return {
    approvalAllowed: uniqueCritical.length === 0,
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
    blockedReason: decision.hasCriticalIssues ? decision.criticalIssues.join("; ") : undefined,
    proposalRoutingMode,
    shouldBlockExecution: decision.hasCriticalIssues,
  };
}
