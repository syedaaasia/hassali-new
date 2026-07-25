import type { IntelligenceProductMode } from "./skill-kernel";
import { sanitizeUntrustedToolText } from "./security-kernel";

export type AgentTaskComplexity = "HIGH" | "LOW" | "MEDIUM";
export type AgentRole = "browser_verifier" | "investigator" | "reviewer" | "security_reviewer";
export type AgentTaskStatus = "FAILED" | "SUCCEEDED" | "UNAVAILABLE";

export type AgentTask = {
  allowedTools: string[];
  evidenceRequirement: string;
  id: string;
  mutationAllowed: boolean;
  objective: string;
  projectId: string;
  role: AgentRole;
  scope: string[];
};

export type AgentPlan = {
  complexity: AgentTaskComplexity;
  maxAgents: number;
  parallel: boolean;
  reason: string;
  recursiveDelegationAllowed: false;
  tasks: AgentTask[];
};

export type AgentTaskResult = {
  evidence: string[];
  findings: string[];
  injectionDetected: boolean;
  secretRedactionApplied: boolean;
  status: AgentTaskStatus;
  taskId: string;
};

export type AgentExecutor = {
  readOnly: true;
  execute: (task: AgentTask) => Promise<{
    evidence: string[];
    findings: string[];
    status: AgentTaskStatus;
  }>;
};

function complexityFor(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\b(?:explain|what is|typo|rename|one line|single file)\b/.test(normalized)) return "LOW" as const;
  if (
    /\b(?:frontend|ui|browser)\b/.test(normalized) &&
    /\b(?:backend|api|database|server)\b/.test(normalized)
  ) return "HIGH" as const;
  if (/\b(?:security|review|audit|investigate|large refactor|multiple modules)\b/.test(normalized)) return "MEDIUM" as const;
  return "LOW" as const;
}

function task(
  input: {
    allowedTools: string[];
    evidenceRequirement: string;
    id: string;
    objective: string;
    projectId: string;
    role: AgentRole;
    scope: string[];
  }
): AgentTask {
  return {
    ...input,
    mutationAllowed: false
  };
}

export function createAgentPlan(input: {
  mode: IntelligenceProductMode;
  parentMutationAllowed: boolean;
  projectId: string;
  prompt: string;
}): AgentPlan {
  const complexity = complexityFor(input.prompt);
  const normalized = input.prompt.toLowerCase();
  const tasks: AgentTask[] = [];

  if (complexity === "HIGH") {
    tasks.push(
      task({
        allowedTools: ["workspace.read_file", "workspace.search_files"],
        evidenceRequirement: "Return concrete frontend findings with file or browser evidence.",
        id: "frontend-investigation",
        objective: "Inspect the frontend side of the reported behavior.",
        projectId: input.projectId,
        role: "investigator",
        scope: ["frontend", "browser-facing behavior"]
      }),
      task({
        allowedTools: ["workspace.read_file", "workspace.search_files", "git.diff"],
        evidenceRequirement: "Return concrete backend findings with route, data, or error-path evidence.",
        id: "backend-investigation",
        objective: "Inspect the backend side of the reported behavior.",
        projectId: input.projectId,
        role: "investigator",
        scope: ["backend", "API and persistence behavior"]
      })
    );
  } else if (complexity === "MEDIUM" && /\bsecurity|auth|permission|secret|injection\b/.test(normalized)) {
    tasks.push(task({
      allowedTools: ["workspace.read_file", "workspace.search_files", "git.diff"],
      evidenceRequirement: "Identify attack surface, precondition, impact, affected code, and mitigation.",
      id: "security-review",
      objective: "Review the bounded security-sensitive change independently.",
      projectId: input.projectId,
      role: "security_reviewer",
      scope: ["changed security-sensitive files"]
    }));
  } else if (complexity === "MEDIUM") {
    tasks.push(task({
      allowedTools: ["workspace.read_file", "workspace.search_files", "git.diff"],
      evidenceRequirement: "Return actionable correctness findings grounded in the supplied diff.",
      id: "independent-review",
      objective: "Review the completed change independently.",
      projectId: input.projectId,
      role: "reviewer",
      scope: ["changed files", "adjacent contracts"]
    }));
  }

  const maxAgents = complexity === "HIGH" ? 2 : complexity === "MEDIUM" ? 1 : 0;
  return {
    complexity,
    maxAgents,
    parallel: tasks.length > 1,
    reason: tasks.length
      ? `The task is ${complexity.toLowerCase()} complexity and contains independent evidence work.`
      : "The task is small or sequential; delegation would add cost without useful parallelism.",
    recursiveDelegationAllowed: false,
    tasks: tasks.slice(0, maxAgents).map((entry) => ({
      ...entry,
      mutationAllowed: input.parentMutationAllowed && entry.mutationAllowed
    }))
  };
}

function sanitizeValues(values: string[]) {
  let injectionDetected = false;
  let secretRedactionApplied = false;
  const sanitized = values.map((value) => {
    const result = sanitizeUntrustedToolText(value);
    injectionDetected ||= result.injectionDetected;
    secretRedactionApplied ||= result.secretRedactionApplied;
    return result.sanitized;
  });
  return { injectionDetected, sanitized, secretRedactionApplied };
}

export async function runAgentPlan(input: {
  executor: AgentExecutor;
  parentMutationAllowed: boolean;
  plan: AgentPlan;
  projectId: string;
}): Promise<AgentTaskResult[]> {
  if (input.executor.readOnly !== true) {
    return input.plan.tasks.slice(0, input.plan.maxAgents).map((entry) => ({
      evidence: ["Agent executor did not provide the required read-only capability."],
      findings: [],
      injectionDetected: false,
      secretRedactionApplied: false,
      status: "FAILED",
      taskId: entry.id
    }));
  }
  const tasks = input.plan.tasks.slice(0, input.plan.maxAgents).map((entry) => ({
    ...entry,
    mutationAllowed: input.parentMutationAllowed && entry.mutationAllowed
  }));

  return Promise.all(tasks.map(async (entry): Promise<AgentTaskResult> => {
    if (entry.projectId !== input.projectId) {
      return {
        evidence: ["Agent project identity did not match the parent task."],
        findings: [],
        injectionDetected: false,
        secretRedactionApplied: false,
        status: "FAILED",
        taskId: entry.id
      };
    }

    try {
      const result = await input.executor.execute(entry);
      const evidence = sanitizeValues(result.evidence);
      const findings = sanitizeValues(result.findings);
      return {
        evidence: evidence.sanitized,
        findings: findings.sanitized,
        injectionDetected: evidence.injectionDetected || findings.injectionDetected,
        secretRedactionApplied: evidence.secretRedactionApplied || findings.secretRedactionApplied,
        status: result.status,
        taskId: entry.id
      };
    } catch (error) {
      const sanitized = sanitizeValues([
        error instanceof Error ? error.message : "Agent execution failed."
      ]);
      return {
        evidence: sanitized.sanitized,
        findings: [],
        injectionDetected: sanitized.injectionDetected,
        secretRedactionApplied: sanitized.secretRedactionApplied,
        status: "FAILED",
        taskId: entry.id
      };
    }
  }));
}
