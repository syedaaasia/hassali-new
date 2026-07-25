import type { VerificationEvidence } from "./verification-kernel";

export type SimplificationResult = {
  afterSize: number;
  beforeSize: number;
  details: string;
  preservedBehavior: boolean;
  reducedSize: boolean;
  status: "CANDIDATE_ACCEPTED" | "REJECTED" | "SKIPPED";
};

export type SimplificationCandidate = {
  evidence: string;
  kind: "DUPLICATED_BLOCK";
  occurrences: number;
  path: string;
  recommendation: string;
};

function normalizedCodeLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line.length >= 12 &&
      !line.startsWith("//") &&
      !line.startsWith("/*") &&
      line !== "{" &&
      line !== "}"
    );
}

export function findSimplificationCandidates(input: {
  content: string;
  path: string;
}): SimplificationCandidate[] {
  const lines = normalizedCodeLines(input.content);
  const blocks = new Map<string, number>();
  for (let index = 0; index < lines.length - 1; index += 1) {
    const block = `${lines[index]}\n${lines[index + 1]}`;
    blocks.set(block, (blocks.get(block) ?? 0) + 1);
  }

  return [...blocks.entries()]
    .filter(([, occurrences]) => occurrences > 1)
    .map(([block, occurrences]) => ({
      evidence: block.slice(0, 240),
      kind: "DUPLICATED_BLOCK" as const,
      occurrences,
      path: input.path,
      recommendation: "Consider one local helper only if behavior-focused evidence proves the call sites are equivalent."
    }))
    .slice(0, 5);
}

export function assessSimplification(input: {
  after: string;
  before: string;
  evidence: VerificationEvidence[];
  requiredCriterionIds: string[];
  requested: boolean;
  target: string;
}): SimplificationResult {
  const beforeSize = input.before.length;
  const afterSize = input.after.length;
  const targetEvidence = input.evidence.filter((item) => item.target === input.target);
  const failingEvidence = targetEvidence.some((item) => item.status === "FAIL");
  const preservedBehavior = input.requiredCriterionIds.length > 0 &&
    input.requiredCriterionIds.every((criterionId) =>
      targetEvidence.some((item) => item.criterionId === criterionId && item.status === "PASS")
    ) &&
    !failingEvidence;
  const reducedSize = afterSize < beforeSize;

  if (!input.requested) {
    return {
      afterSize,
      beforeSize,
      details: "Simplification was not selected for this task.",
      preservedBehavior: false,
      reducedSize,
      status: "SKIPPED"
    };
  }

  if (!reducedSize || !preservedBehavior) {
    return {
      afterSize,
      beforeSize,
      details: !reducedSize
        ? "The candidate did not reduce code or cognitive surface."
        : "Equivalent behavior was not proven by verification evidence.",
      preservedBehavior,
      reducedSize,
      status: "REJECTED"
    };
  }

  return {
    afterSize,
    beforeSize,
    details: "The candidate reduces implementation size and has passing behavior evidence.",
    preservedBehavior,
    reducedSize,
    status: "CANDIDATE_ACCEPTED"
  };
}
