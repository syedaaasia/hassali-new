import { createHash, randomUUID } from "node:crypto";
import type {
  CommandEvidenceInput,
  DeliveryReadiness,
  ImplementationReview,
  RepairEligibility,
  ReviewedChange,
  ReviewIssue,
  TaskVerification,
  VerificationCriterion,
  VerificationEvidence,
  VerificationPlan,
  VerificationResult,
  VerificationType
} from "./verification-types";

const maxCriteria = 20;
const maxReviewFiles = 40;

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function requiredEvidence(criterion: string): VerificationType[] {
  if (/\bverification commands? pass\b/i.test(criterion)) return ["static"];
  if (/\btype(?:script|check| checking)?\b/i.test(criterion)) return ["typecheck"];
  if (/\blint\b/i.test(criterion)) return ["lint"];
  if (/\bproduction build\b|\bbuild passes?\b/i.test(criterion)) return ["build"];
  if (/\btests?\b|\bregression\b/i.test(criterion)) return ["test"];
  if (/\bbrowser\b|\bresponsive\b|\bvisual\b|\bvisible\b|\bUI\b/i.test(criterion)) return ["browser"];
  if (/\bsecurity\b|\bauth(?:entication|orization)?\b|\bsecret\b|\bisolation\b/i.test(criterion)) return ["security"];
  if (/\bJSON\b|\bCSV\b|\bZIP\b|\bimage\b|\bartifact\b/i.test(criterion)) return ["artifact"];
  if (/\bunrelated\b|\bapproved scope\b|\buser work\b|\bconstraint\b/i.test(criterion)) return ["repository-state"];
  return ["runtime"];
}

export function buildVerificationPlan(input: {
  acceptanceCriteria: string[];
  taskId: string;
}): VerificationPlan {
  const source = input.acceptanceCriteria.length
    ? input.acceptanceCriteria
    : ["The bounded project verification commands pass."];
  const criteria = [...new Set(source.map((item) => item.trim()).filter(Boolean))]
    .slice(0, maxCriteria)
    .map((criterion): VerificationCriterion => ({
      blocking: true,
      criterion,
      id: stableId("criterion", criterion),
      requiredEvidence: requiredEvidence(criterion),
      risk: /\bsecurity|auth|secret|migration|database|destructive\b/i.test(criterion) ? "high" : "medium",
      source: input.acceptanceCriteria.length ? "acceptance-criterion" : "execution-contract"
    }));
  return { criteria, createdAt: new Date().toISOString(), taskId: input.taskId };
}

function commandKindToVerificationType(kind: string): VerificationType {
  if (/typecheck|type-check|tsc/i.test(kind)) return "typecheck";
  if (/lint/i.test(kind)) return "lint";
  if (/build/i.test(kind)) return "build";
  return "test";
}

export function commandResultsToEvidence(input: CommandEvidenceInput): VerificationEvidence[] {
  return input.results.map((result) => ({
    criterionIds: input.commandKinds?.[result.commandId] ?? [],
    id: stableId("command-evidence", `${result.commandId}:${result.status}:${result.outputExcerpt}`),
    observed: result.status === "PASSED"
      ? `${result.commandId} exited successfully.`
      : `${result.commandId} ${result.status.toLowerCase()}: ${result.outputExcerpt.slice(-500)}`,
    provenance: `secure-execution:${result.commandId}`,
    status: result.status === "PASSED" ? "passed" : result.status === "CANCELLED" ? "blocked" : "failed",
    type: commandKindToVerificationType(result.commandId)
  }));
}

function relevantEvidence(criterion: VerificationCriterion, evidence: VerificationEvidence[]) {
  return evidence.filter((item) =>
    item.criterionIds.includes(criterion.id) || criterion.requiredEvidence.includes(item.type)
  );
}

export function evaluateVerificationPlan(plan: VerificationPlan, evidence: VerificationEvidence[]): TaskVerification {
  const results: VerificationResult[] = plan.criteria.map((criterion) => {
    const matching = relevantEvidence(criterion, evidence);
    const failed = matching.find((item) => item.status === "failed");
    const blocked = matching.find((item) => item.status === "blocked" || item.status === "unavailable");
    const passedTypes = new Set(matching.filter((item) => item.status === "passed").map((item) => item.type));
    const allRequiredPassed = criterion.requiredEvidence.every((type) => passedTypes.has(type));
    const status: VerificationResult["status"] = failed
      ? "failed"
      : blocked
        ? blocked.status === "unavailable" ? "unavailable" : "blocked"
        : allRequiredPassed
          ? "passed"
          : matching.some((item) => item.status === "passed")
            ? "partial"
            : "inconclusive";
    return {
      blocking: criterion.blocking,
      confidence: status === "passed" || status === "failed" ? "high" : matching.length ? "medium" : "low",
      criterion: criterion.criterion,
      criterionId: criterion.id,
      evidence: matching,
      expected: criterion.criterion,
      limitations: status === "inconclusive"
        ? [`No objective ${criterion.requiredEvidence.join(" or ")} evidence proved this criterion.`]
        : status === "partial"
          ? ["Some relevant evidence exists, but it does not prove every required verification surface."]
          : [],
      status
    };
  });
  const blockingFailures = results
    .filter((result) => result.blocking && ["blocked", "failed", "unavailable"].includes(result.status))
    .map((result) => result.criterionId);
  const pending = results.filter((result) => result.blocking && ["inconclusive", "partial"].includes(result.status));
  const warnings = results.flatMap((result) => result.limitations);
  const state: TaskVerification["state"] = results.some((result) => result.blocking && result.status === "failed")
    ? "failed"
    : results.some((result) => result.blocking && ["blocked", "unavailable"].includes(result.status))
      ? "blocked"
      : pending.some((result) => result.status === "inconclusive")
        ? "inconclusive"
        : pending.length
          ? "partially-verified"
          : warnings.length
            ? "verified-with-warnings"
            : "verified";
  return { blockingFailures, results, state, taskId: plan.taskId, warnings };
}

function lines(value: string | null) {
  return value?.split(/\r?\n/) ?? [];
}

function removedAssertions(change: ReviewedChange) {
  const before = lines(change.before).filter((line) => /\b(?:assert|expect)\s*\(/.test(line));
  const after = lines(change.after).filter((line) => /\b(?:assert|expect)\s*\(/.test(line));
  return Math.max(0, before.length - after.length);
}

export function reviewImplementation(input: {
  changes: ReviewedChange[];
  securityEvidencePresent?: boolean;
  taskId: string;
  testChangeJustification?: string;
}): ImplementationReview {
  const changes = input.changes.slice(0, maxReviewFiles);
  const issues: ReviewIssue[] = [];
  const add = (issue: ReviewIssue) => issues.push(issue);
  for (const change of changes) {
    const lower = change.path.toLowerCase();
    const after = change.after ?? "";
    if (!change.planned) add({ code: "unexpected-path", evidence: "Path is absent from the approved implementation surface.", message: "An unexpected file changed.", path: change.path, severity: "blocking" });
    if (/(?:^|\/)(?:node_modules|\.next|dist|coverage|vendor)(?:\/|$)/.test(lower)) add({ code: "generated-or-vendor-edit", evidence: "Changed path belongs to generated or vendor output.", message: "Generated or vendor content should not be edited as source.", path: change.path, severity: "high" });
    if (/(?:^|\/)\.env(?:\.|$)/.test(lower)) add({ code: "secret-file-change", evidence: "Environment secret file changed.", message: "Secret-bearing files are outside normal repair scope.", path: change.path, severity: "blocking" });
    if (/\b(?:console\.log|debugger;)\b/.test(after)) add({ code: "debug-leftover", evidence: "Debug statement found in changed content.", message: "Debug-only code remains in the patch.", path: change.path, severity: "medium" });
    if (/\b(?:describe|it|test)\.(?:skip|only)\s*\(/.test(after)) add({ code: "test-selection-weakened", evidence: "Changed test contains .skip or .only.", message: "The patch weakens or narrows test execution.", path: change.path, severity: "blocking" });
    if (/(?:@ts-ignore|eslint-disable|noqa|type:\s*ignore)/i.test(after) && !/(?:@ts-ignore|eslint-disable|noqa|type:\s*ignore)/i.test(change.before ?? "")) add({ code: "error-suppression-added", evidence: "New compiler/lint suppression found.", message: "The patch adds error suppression instead of proving a root-cause fix.", path: change.path, severity: "high" });
    const assertionDrop = removedAssertions(change);
    if (assertionDrop > 0 && !input.testChangeJustification?.trim()) add({ code: "assertion-removed", evidence: `${assertionDrop} assertion line(s) removed without recorded justification.`, message: "A test assertion was removed and requires review.", path: change.path, severity: "high" });
  }
  const paths = new Set(changes.map((change) => change.path.toLowerCase()));
  const packageChanged = paths.has("package.json");
  const lockChanged = [...paths].some((path) => /(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/.test(path));
  if (packageChanged !== lockChanged) add({ code: "dependency-ledger-mismatch", evidence: "Manifest and lockfile did not change together.", message: "Dependency metadata may be inconsistent or unauthorized.", path: packageChanged ? "package.json" : null, severity: "high" });
  const securitySensitive = changes.some((change) => /(?:approval|auth|execution-broker|execution-policy|secret|workspace-binding|persistence)/i.test(change.path));
  if (securitySensitive && !input.securityEvidencePresent) add({ code: "security-regression-evidence-required", evidence: "A security-sensitive path changed without matching regression evidence.", message: "Security-sensitive changes require focused regression evidence.", path: null, severity: "blocking" });
  if (input.changes.length > maxReviewFiles) add({ code: "review-bounds-exceeded", evidence: `Only ${maxReviewFiles} of ${input.changes.length} changed files were reviewed.`, message: "The review surface exceeded its deterministic bound.", path: null, severity: "blocking" });
  const status = issues.some((issue) => issue.severity === "blocking")
    ? "blocked"
    : issues.length ? "passed-with-warnings" : "passed";
  return { boundedFileCount: changes.length, issues, reviewId: `review-${randomUUID()}`, securitySensitive, status };
}

export function decideRepairEligibility(input: {
  approvedPaths: string[];
  attemptedCycles: number;
  currentEvidenceSignature: string;
  previousEvidenceSignatures: string[];
  proposedPaths: string[];
  repositoryStale: boolean;
  permissionValid: boolean;
}): RepairEligibility {
  if (input.attemptedCycles >= 2) return { eligible: false, nextAttempt: null, reason: "The two-cycle repair budget is exhausted.", requiresReapproval: false };
  if (!input.permissionValid) return { eligible: false, nextAttempt: null, reason: "The execution permission is no longer valid.", requiresReapproval: true };
  if (input.repositoryStale) return { eligible: false, nextAttempt: null, reason: "Repository evidence is stale and must be refreshed.", requiresReapproval: false };
  if (input.previousEvidenceSignatures.includes(input.currentEvidenceSignature)) return { eligible: false, nextAttempt: null, reason: "No new failure evidence supports another repair cycle.", requiresReapproval: false };
  const approved = new Set(input.approvedPaths);
  if (input.proposedPaths.some((path) => !approved.has(path))) return { eligible: false, nextAttempt: null, reason: "The repair expands beyond the approved implementation surface.", requiresReapproval: true };
  return { eligible: true, nextAttempt: input.attemptedCycles + 1, reason: "New actionable evidence supports a bounded repair.", requiresReapproval: false };
}

export function buildDeliveryReadiness(input: {
  changedFiles: string[];
  implementationComplete: boolean;
  manualChecks?: string[];
  recoveryState?: DeliveryReadiness["recoveryState"];
  review: ImplementationReview;
  verification: TaskVerification;
}): DeliveryReadiness {
  const ready = input.implementationComplete &&
    ["verified", "verified-with-warnings"].includes(input.verification.state) &&
    input.review.status !== "blocked" && !(input.manualChecks?.length);
  return {
    changedFiles: input.changedFiles,
    gitEligible: ready,
    implementationComplete: input.implementationComplete,
    manualChecks: input.manualChecks ?? [],
    pushAuthorized: false,
    readyForDelivery: ready,
    recoveryState: input.recoveryState ?? "not-required",
    reviewStatus: input.review.status,
    verificationState: input.verification.state,
    warnings: [...input.verification.warnings, ...input.review.issues.filter((issue) => issue.severity !== "blocking").map((issue) => issue.message)]
  };
}

export function successClaim(input: { delivery: DeliveryReadiness; attempted: boolean }) {
  if (!input.attempted) return "No implementation was attempted.";
  if (input.delivery.readyForDelivery) return "Fixed and verified.";
  if (input.delivery.verificationState === "failed") return "The repair did not pass verification. Hassali stopped rather than claiming success.";
  if (input.delivery.verificationState === "blocked") return "The implementation is blocked because required verification could not complete.";
  if (["inconclusive", "partially-verified"].includes(input.delivery.verificationState)) {
    return `Implemented, but not fully verified. ${input.delivery.manualChecks.join(" ") || "Required acceptance evidence remains missing."}`;
  }
  return "Implemented with verified checks and disclosed review warnings.";
}

export function verifyArtifact(input: {
  content: Buffer | string;
  expectedColumns?: string[];
  expectedPaths?: string[];
  kind: "csv" | "json" | "zip";
}): { evidence: string[]; ok: boolean; reason: string | null } {
  if (input.kind === "json") {
    try {
      JSON.parse(typeof input.content === "string" ? input.content : input.content.toString("utf8"));
      return { evidence: ["JSON parsed successfully."], ok: true, reason: null };
    } catch {
      return { evidence: [], ok: false, reason: "JSON is not parseable." };
    }
  }
  if (input.kind === "csv") {
    const text = typeof input.content === "string" ? input.content : input.content.toString("utf8");
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const columns = firstLine.split(",").map((value) => value.trim().replace(/^"|"$/g, ""));
    const missing = (input.expectedColumns ?? []).filter((column) => !columns.includes(column));
    return missing.length
      ? { evidence: [`Observed columns: ${columns.join(", ")}`], ok: false, reason: `Missing expected columns: ${missing.join(", ")}.` }
      : { evidence: [`CSV header contains ${columns.length} column(s).`], ok: columns.length > 0, reason: columns.length ? null : "CSV has no header columns." };
  }
  const buffer = typeof input.content === "string" ? Buffer.from(input.content, "binary") : input.content;
  const hasLocalHeader = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const hasEndRecord = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06])) >= 0;
  const missingPaths = (input.expectedPaths ?? []).filter((filePath) => !buffer.includes(Buffer.from(filePath, "utf8")));
  return hasLocalHeader && hasEndRecord && !missingPaths.length
    ? { evidence: ["ZIP local header and end record are present.", ...(input.expectedPaths?.length ? ["Expected paths are present in the central/local records."] : [])], ok: true, reason: null }
    : { evidence: [], ok: false, reason: missingPaths.length ? `ZIP is missing expected paths: ${missingPaths.join(", ")}.` : "ZIP structure is incomplete or corrupt." };
}
