export type ReviewSeverity = "CRITICAL" | "HIGH" | "LOW" | "MEDIUM";
export type ReviewDisposition = "CONFIRMED" | "PLAUSIBLE" | "REFUTED";

export type ReviewFinding = {
  disposition: ReviewDisposition;
  evidence: string;
  impact: string;
  line: number;
  path: string;
  problem: string;
  recommendedCorrection: string;
  severity: ReviewSeverity;
};

export type ReviewFileChange = {
  after: string;
  before?: string;
  path: string;
};

export type CodeReviewReport = {
  findings: ReviewFinding[];
  method: "DETERMINISTIC_PREFILTER";
  reviewedFiles: string[];
  reviewAngles: string[];
  status: "FINDINGS" | "NO_ACTIONABLE_FINDINGS";
};

function lineNumber(content: string, offset: number) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function finding(
  file: ReviewFileChange,
  match: RegExpExecArray,
  input: Omit<ReviewFinding, "disposition" | "line" | "path">
): ReviewFinding {
  return {
    ...input,
    disposition: "CONFIRMED",
    line: lineNumber(file.after, match.index),
    path: file.path
  };
}

function reviewFile(file: ReviewFileChange) {
  const findings: ReviewFinding[] = [];
  const checks: Array<{
    pattern: RegExp;
    finding: Omit<ReviewFinding, "disposition" | "line" | "path">;
  }> = [
    {
      pattern: /(?:===|==|!==|!=)\s*NaN|NaN\s*(?:===|==|!==|!=)/g,
      finding: {
        evidence: "JavaScript comparisons with NaN never test numeric invalidity correctly.",
        impact: "The invalid-number branch can be skipped or inverted for every NaN input.",
        problem: "NaN is compared with an equality operator.",
        recommendedCorrection: "Use Number.isNaN(value) for the intended numeric check.",
        severity: "HIGH"
      }
    },
    {
      pattern: /if\s*\(\s*[^)\r\n]*\.indexOf\([^)\r\n]*\)\s*\)/g,
      finding: {
        evidence: "indexOf returns 0 for the first item and -1 when absent; both are misread by a direct truthiness check.",
        impact: "The first match is rejected while a missing value can be accepted.",
        problem: "indexOf result is used directly as a boolean condition.",
        recommendedCorrection: "Compare the result explicitly with -1.",
        severity: "HIGH"
      }
    },
    {
      pattern: /\.forEach\s*\(\s*async\s*(?:\([^)]*\)|[a-zA-Z_$][\w$]*)\s*=>/g,
      finding: {
        evidence: "Array.forEach does not await async callbacks.",
        impact: "The enclosing operation can complete before callback work or failures settle.",
        problem: "Async work is launched through forEach without an awaitable aggregate.",
        recommendedCorrection: "Use Promise.all with map, or a for...of loop when sequencing matters.",
        severity: "MEDIUM"
      }
    },
    {
      pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g,
      finding: {
        evidence: "The catch block discards every failure without recording, translating, or rethrowing it.",
        impact: "A real failure can be reported as success or leave partial state unexplained.",
        problem: "An empty catch block swallows errors.",
        recommendedCorrection: "Handle the expected error narrowly or propagate an actionable failure.",
        severity: "MEDIUM"
      }
    }
  ];

  for (const check of checks) {
    check.pattern.lastIndex = 0;
    for (const match of file.after.matchAll(check.pattern)) {
      if (!file.before?.includes(match[0])) findings.push(finding(file, match, check.finding));
    }
  }

  return findings;
}

function severityRank(severity: ReviewSeverity) {
  return severity === "CRITICAL" ? 4 : severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 1;
}

export function runCodeReview(input: {
  files: ReviewFileChange[];
}): CodeReviewReport {
  const findings = input.files
    .flatMap(reviewFile)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.path.localeCompare(b.path) || a.line - b.line)
    .slice(0, 10);

  return {
    findings,
    method: "DETERMINISTIC_PREFILTER",
    reviewedFiles: input.files.map((file) => file.path),
    reviewAngles: [
      "correctness",
      "regressions",
      "partial failure",
      "async lifecycle",
      "invalid assumptions"
    ],
    status: findings.length ? "FINDINGS" : "NO_ACTIONABLE_FINDINGS"
  };
}
