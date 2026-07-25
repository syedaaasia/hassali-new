import {
  hasWorkspaceInjectionLikeText,
  redactWorkspaceSecrets
} from "@/lib/server/ai/workspace-context-engine";

export type SecuritySeverity = "CRITICAL" | "HIGH" | "LOW" | "MEDIUM";

export type SecurityFinding = {
  affectedCode: string;
  attackSurface: string;
  confidence: number;
  impact: string;
  mitigation: string;
  path: string;
  precondition: string;
  severity: SecuritySeverity;
  title: string;
};

export type SecurityReviewReport = {
  findings: SecurityFinding[];
  sanitizedUntrustedText: string[];
  secretRedactionApplied: boolean;
  status: "FINDINGS" | "NO_ACTIONABLE_FINDINGS";
  untrustedInstructionDetected: boolean;
};

function safeExcerpt(value: string) {
  return redactWorkspaceSecrets(value).redacted
    .replace(/\b(?:SYSTEM|DEVELOPER|ASSISTANT)\s*:[^\r\n]*/gi, "[untrusted instruction omitted]")
    .slice(0, 240);
}

function pathTraversalFinding(path: string): SecurityFinding {
  return {
    affectedCode: path,
    attackSurface: "User-controlled file path resolution",
    confidence: 0.92,
    impact: "An attacker can read or write files outside the selected project workspace.",
    mitigation: "Resolve against the server-owned project root and reject targets outside that exact root before file access.",
    path,
    precondition: "A request-controlled path reaches resolve/join and a filesystem operation without a containment check.",
    severity: "HIGH",
    title: "Project path can escape its workspace"
  };
}

function clientSecretFinding(path: string): SecurityFinding {
  return {
    affectedCode: path,
    attackSurface: "Browser-visible configuration",
    confidence: 0.95,
    impact: "A provider credential can be delivered to untrusted browser code and copied by any visitor.",
    mitigation: "Keep provider credentials in server-only environment variables without a public prefix.",
    path,
    precondition: "A real secret is assigned to a client-exposed environment key or serialized into client source.",
    severity: "CRITICAL",
    title: "Server credential is exposed to the browser"
  };
}

export function sanitizeUntrustedToolText(value: string) {
  const redacted = redactWorkspaceSecrets(value);
  const instructionLike = (text: string) =>
    hasWorkspaceInjectionLikeText(text) ||
    /(?:^|\b)(?:ignore|override|disregard)\s+(?:all\s+)?(?:prior|previous|system|developer|user)?\s*(?:rules?|instructions?|constraints?)/i.test(text) ||
    /\b(?:bypass|disable)\s+(?:approval|safety|authorization)\b/i.test(text) ||
    /\bexecute\s+(?:a\s+)?destructive\s+(?:tool|command|operation)\b/i.test(text);
  const injectionDetected = hasWorkspaceInjectionLikeText(redacted.redacted) ||
    instructionLike(redacted.redacted) ||
    /(?:^|\n)\s*(?:SYSTEM|DEVELOPER|ASSISTANT)\s*:/i.test(redacted.redacted);
  const sanitized = redacted.redacted
    .split(/\r?\n/)
    .map((line) =>
      instructionLike(line) || /^\s*(?:SYSTEM|DEVELOPER|ASSISTANT)\s*:/i.test(line)
        ? "[untrusted instruction-like content omitted]"
        : line
    )
    .join("\n");

  return {
    injectionDetected,
    sanitized,
    secretRedactionApplied: redacted.redactionApplied
  };
}

export function runSecurityReview(input: {
  files: Array<{ content: string; path: string }>;
  untrustedText?: string[];
}): SecurityReviewReport {
  const findings: SecurityFinding[] = [];
  let secretRedactionApplied = false;
  let untrustedInstructionDetected = false;
  const sanitizedUntrustedText: string[] = [];

  for (const file of input.files) {
    const content = file.content;
    const redacted = redactWorkspaceSecrets(content);
    secretRedactionApplied ||= redacted.redactionApplied;

    const resolvesUntrustedPath =
      /\b(?:resolve|join)\s*\([^;\n]*(?:user|input|request|params?|path)[^;\n]*\)/i.test(content);
    const performsFileAccess = /\b(?:readFile|writeFile|rm|unlink|mkdir|stat)\s*\(/.test(content);
    const checksContainment = /\b(?:isInsidePath|startsWith|relative)\s*\(/.test(content) ||
      /outside (?:the )?(?:workspace|project)|escaped? (?:the )?(?:workspace|project)/i.test(content);
    if (resolvesUntrustedPath && performsFileAccess && !checksContainment) {
      findings.push(pathTraversalFinding(file.path));
    }

    if (/\bNEXT_PUBLIC_[A-Z0-9_]*(?:KEY|SECRET|TOKEN)\b\s*[:=]\s*["'`][^"'`\s]+/i.test(content)) {
      findings.push(clientSecretFinding(file.path));
    }
  }

  for (const value of input.untrustedText ?? []) {
    const sanitized = sanitizeUntrustedToolText(value);
    secretRedactionApplied ||= sanitized.secretRedactionApplied;
    untrustedInstructionDetected ||= sanitized.injectionDetected;
    sanitizedUntrustedText.push(safeExcerpt(sanitized.sanitized));
  }

  return {
    findings,
    sanitizedUntrustedText,
    secretRedactionApplied,
    status: findings.length ? "FINDINGS" : "NO_ACTIONABLE_FINDINGS",
    untrustedInstructionDetected
  };
}
