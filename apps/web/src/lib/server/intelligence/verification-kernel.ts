import type { IntelligenceProductMode } from "./skill-kernel";

export type VerificationStatus =
  | "FAIL"
  | "NOT_APPLICABLE"
  | "NOT_AVAILABLE"
  | "NOT_RUN"
  | "PASS";

export type VerificationMethod =
  | "API_REQUEST"
  | "BROWSER_INTERACTION"
  | "BUILD"
  | "FILESYSTEM_STATE"
  | "GENERATED_ARTIFACT"
  | "GIT_DIFF"
  | "SOURCE_INSPECTION"
  | "TYPECHECK"
  | "UNIT_TEST";

export type VerificationEvidence = {
  capturedAt: string;
  criterionId: string;
  details: string;
  method: VerificationMethod;
  source: string;
  status: VerificationStatus;
  target: string;
};

export type VerificationCriterion = {
  description: string;
  id: string;
  method: VerificationMethod;
  required: boolean;
  target: string;
};

export type VerificationPlan = {
  criteria: VerificationCriterion[];
  mode: IntelligenceProductMode;
  requiresRuntimeSurface: boolean;
  taskKind:
    | "api"
    | "build_system"
    | "code"
    | "explanation"
    | "security"
    | "ui"
    | "website";
};

export type VerificationReport = {
  attempts: number;
  evidence: VerificationEvidence[];
  failedCriteria: string[];
  limitations: string[];
  missingCriteria: string[];
  status: VerificationStatus;
};

export type VerificationAttemptResult = {
  evidence: VerificationEvidence[];
};

export type VerificationRepairResult = {
  applied: boolean;
  details: string;
};

function now() {
  return new Date().toISOString();
}

function uniqueById(criteria: VerificationCriterion[]) {
  return [...new Map(criteria.map((criterion) => [criterion.id, criterion])).values()];
}

function taskKindFor(input: {
  changedFiles?: string[];
  mode: IntelligenceProductMode;
  prompt: string;
}): VerificationPlan["taskKind"] {
  const prompt = input.prompt.toLowerCase();
  const files = input.changedFiles ?? [];

  if (/\b(?:security|auth|permission|secret|path traversal|injection)\b/.test(prompt)) return "security";
  if (input.mode === "WEBSITE") return "website";
  if (/\b(?:api|endpoint|route|webhook|http)\b/.test(prompt) || files.some((file) => /(?:route|api)\.[jt]s$/.test(file))) return "api";
  if (/\b(?:build|typecheck|typescript config|vite config|next config)\b/.test(prompt) || files.some((file) => /(?:package\.json|tsconfig|vite\.config|next\.config)/.test(file))) return "build_system";
  if (/\b(?:button|modal|form|layout|responsive|browser|screen|page|ui)\b/.test(prompt) || files.some((file) => /\.(?:css|html|jsx|tsx)$/.test(file))) return "ui";
  if (input.mode === "ASK" && !files.length) return "explanation";
  return "code";
}

export function createVerificationPlan(input: {
  changedFiles?: string[];
  mode: IntelligenceProductMode;
  prompt: string;
}): VerificationPlan {
  const taskKind = taskKindFor(input);
  const criteria: VerificationCriterion[] = [];
  const add = (
    id: string,
    method: VerificationMethod,
    target: string,
    description: string,
    required = true
  ) => criteria.push({ description, id, method, required, target });

  if (taskKind === "explanation") {
    add("answer-addresses-request", "SOURCE_INSPECTION", "assistant-answer", "The response directly addresses the current request.");
  } else if (taskKind === "api") {
    add("typecheck", "TYPECHECK", "project", "Changed server code typechecks.");
    add("api-behavior", "API_REQUEST", "api-route", "The real route returns the expected status and response.");
    add("api-adjacent-probe", "API_REQUEST", "api-route", "One malformed or adjacent request is handled correctly.", false);
  } else if (taskKind === "build_system") {
    add("typecheck", "TYPECHECK", "project", "The project typechecks.");
    add("production-build", "BUILD", "project", "The production build completes.");
  } else if (taskKind === "ui" || taskKind === "website") {
    add("typecheck", "TYPECHECK", "project", "Changed UI code typechecks.");
    add("browser-behavior", "BROWSER_INTERACTION", "browser", "The requested behavior works through the real browser surface.");
    add("browser-adjacent-probe", "BROWSER_INTERACTION", "browser", "One relevant reload, viewport, or error-state probe holds.", false);
  } else if (taskKind === "security") {
    add("security-source-review", "SOURCE_INSPECTION", "security-surface", "The relevant attack surface and trust boundary were inspected.");
    add("security-behavior", "UNIT_TEST", "security-invariant", "The exploit path or protective invariant is exercised.");
  } else {
    add("focused-test", "UNIT_TEST", "changed-behavior", "The changed behavior passes a focused deterministic test.");
    add("typecheck", "TYPECHECK", "project", "Changed code typechecks.", false);
  }

  if (input.mode === "WEBSITE") {
    add("website-artifact", "GENERATED_ARTIFACT", "website-artifact", "Generated WEBSITE files satisfy their artifact contract.");
  }

  return {
    criteria: uniqueById(criteria),
    mode: input.mode,
    requiresRuntimeSurface: criteria.some((criterion) =>
      criterion.required && (criterion.method === "API_REQUEST" || criterion.method === "BROWSER_INTERACTION")
    ),
    taskKind
  };
}

export function createVerificationEvidence(input: Omit<VerificationEvidence, "capturedAt">): VerificationEvidence {
  return {
    ...input,
    capturedAt: now()
  };
}

export function evaluateVerification(
  plan: VerificationPlan,
  evidence: VerificationEvidence[],
  attempts = 1
): VerificationReport {
  const failedCriteria: string[] = [];
  const missingCriteria: string[] = [];
  const limitations: string[] = [];

  for (const criterion of plan.criteria) {
    const records = evidence.filter((item) =>
      item.criterionId === criterion.id &&
      item.method === criterion.method &&
      item.target === criterion.target
    );
    const latest = records.at(-1);
    if (!latest) {
      if (criterion.required) missingCriteria.push(criterion.id);
      continue;
    }
    if (latest.status === "FAIL") failedCriteria.push(criterion.id);
    if (latest.status === "NOT_AVAILABLE") {
      limitations.push(`${criterion.id}: ${latest.details}`);
      if (criterion.required) missingCriteria.push(criterion.id);
    }
    if (latest.status === "NOT_RUN" && criterion.required) missingCriteria.push(criterion.id);
    if (latest.status === "NOT_APPLICABLE" && criterion.required) {
      limitations.push(`${criterion.id}: required evidence was marked not applicable`);
      missingCriteria.push(criterion.id);
    }
  }

  const status: VerificationStatus = failedCriteria.length
    ? "FAIL"
    : missingCriteria.length
      ? limitations.length
        ? "NOT_AVAILABLE"
        : "NOT_RUN"
      : "PASS";

  return {
    attempts,
    evidence,
    failedCriteria,
    limitations,
    missingCriteria: [...new Set(missingCriteria)],
    status
  };
}

export async function runBoundedVerification(input: {
  maxAttempts?: number;
  plan: VerificationPlan;
  repair?: (report: VerificationReport, attempt: number) => Promise<VerificationRepairResult>;
  verify: (attempt: number) => Promise<VerificationAttemptResult>;
}): Promise<VerificationReport> {
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 2, 3));
  const evidence: VerificationEvidence[] = [];
  let report = evaluateVerification(input.plan, evidence, 0);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await input.verify(attempt);
    evidence.push(...result.evidence);
    report = evaluateVerification(input.plan, evidence, attempt);
    if (report.status === "PASS" || report.status === "NOT_AVAILABLE") return report;
    if (attempt >= maxAttempts || !input.repair) return report;

    const repair = await input.repair(report, attempt);
    if (!repair.applied) return report;
  }

  return report;
}

export function evidenceFromRuntimeFileVerification(input: {
  details: string[];
  ok: boolean;
}): VerificationEvidence {
  return createVerificationEvidence({
    criterionId: "approved-file-state",
    details: input.details.join(" | "),
    method: "FILESYSTEM_STATE",
    source: "approved_file_runner",
    status: input.ok ? "PASS" : "FAIL",
    target: "approved-files"
  });
}
