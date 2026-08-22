import type { AdaptiveCodePlanSummary } from "./adaptive-code-planner";

export type CodeCandidateChange = {
  action: string;
  path?: string;
  proposedContent?: string;
};

export type CodeCandidateIssueCode =
  | "DEPENDENCY_CONTRACT_DRIFT"
  | "DUPLICATE_TARGET"
  | "EMPTY_MUTATION"
  | "MISSING_CONTENT"
  | "MUTATION_SCOPE_EXCEEDED"
  | "UNSAFE_PATH";

export type CodeCandidateValidation = {
  fileChangeCount: number;
  issues: Array<{ code: CodeCandidateIssueCode; message: string; path: string | null }>;
  valid: boolean;
};

const fileActions = new Set(["create", "delete_file", "modify", "update", "write_file"]);
const contentActions = new Set(["create", "modify", "update", "write_file"]);
const dependencyContracts = new Set([
  "bun.lockb", "cargo.toml", "composer.json", "go.mod", "package-lock.json", "package.json",
  "pnpm-lock.yaml", "poetry.lock", "pyproject.toml", "requirements.txt", "yarn.lock"
]);

function normalizedPath(value: string | undefined) {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function safeRelativePath(value: string) {
  if (!value || value.includes("\0") || /^(?:[a-z]:|\/|\\\\)/i.test(value)) return false;
  const segments = value.toLowerCase().split("/");
  if (segments.some((segment) => segment === ".." || segment === "")) return false;
  if (segments.some((segment) => [".git", ".next", "node_modules"].includes(segment))) return false;
  const filename = segments.at(-1) ?? "";
  if (filename === ".env") return false;
  if (/^\.env\./i.test(filename) && !/^\.env\.(?:example|sample|template)$/i.test(filename)) return false;
  return !/\.(?:key|pem|p12|pfx)$/i.test(filename);
}

function dependencyChangeProhibited(plan: AdaptiveCodePlanSummary) {
  return plan.preserveRequirements.some((requirement) =>
    /do not install packages|use existing dependencies/i.test(requirement)
  );
}

export function validateCodeMutationCandidate(input: {
  changes: CodeCandidateChange[];
  plan: AdaptiveCodePlanSummary;
}): CodeCandidateValidation {
  const issues: CodeCandidateValidation["issues"] = [];
  const fileChanges = input.changes.filter((change) => fileActions.has(change.action));
  const seen = new Set<string>();

  for (const change of fileChanges) {
    const path = normalizedPath(change.path);
    if (!safeRelativePath(path)) {
      issues.push({ code: "UNSAFE_PATH", message: "CODE file changes require safe project-relative paths.", path: path || null });
      continue;
    }
    const key = path.toLowerCase();
    if (seen.has(key)) {
      issues.push({ code: "DUPLICATE_TARGET", message: "A CODE proposal cannot contain conflicting changes for the same path.", path });
    }
    seen.add(key);
    if (contentActions.has(change.action) && !(change.proposedContent ?? "").trim()) {
      issues.push({ code: "MISSING_CONTENT", message: "A CODE file write must include concrete file content.", path });
    }
    const filename = path.toLowerCase().split("/").at(-1) ?? "";
    if (dependencyChangeProhibited(input.plan) && dependencyContracts.has(filename)) {
      issues.push({ code: "DEPENDENCY_CONTRACT_DRIFT", message: "The proposal changes a dependency contract despite an explicit preserve constraint.", path });
    }
  }

  if (input.plan.mutationRequired && fileChanges.length === 0) {
    issues.push({ code: "EMPTY_MUTATION", message: "A mutating CODE proposal must contain at least one concrete file change.", path: null });
  }
  if (fileChanges.length > input.plan.mutationFileLimit) {
    issues.push({
      code: "MUTATION_SCOPE_EXCEEDED",
      message: `The ${fileChanges.length}-file proposal exceeds the ${input.plan.mutationFileLimit}-file budget for this bounded task.`,
      path: null
    });
  }

  return { fileChangeCount: fileChanges.length, issues, valid: issues.length === 0 };
}
