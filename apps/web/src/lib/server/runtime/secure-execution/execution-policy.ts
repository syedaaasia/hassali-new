import path from "node:path";
import type { ExecutionGrant, ExecutionRequest } from "./execution-types";

const blockedExecutables = new Set([
  "bash",
  "cmd",
  "cmd.exe",
  "command",
  "fish",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "sh",
  "wsl",
  "zsh"
]);
const packageManagers = new Set(["bun", "npm", "npm.cmd", "pnpm", "pnpm.cmd", "yarn", "yarn.cmd"]);
const allowedByMode = {
  ASK: new Set(["media.inspect", "media.transform", "ocr.extract", "python.deterministic"]),
  CODE: new Set(["git.read", "media.inspect", "media.transform", "ocr.extract", "python.deterministic", "python.project", "repository.verify"]),
  GROWTH: new Set<string>(),
  WEBSITE: new Set(["media.inspect", "media.transform", "ocr.extract"])
} satisfies Record<ExecutionRequest["mode"], Set<string>>;

function executableName(value: string) {
  return path.basename(value).toLowerCase();
}

function joinedArgs(request: ExecutionRequest) {
  return request.command.args.join(" ").toLowerCase();
}

function hardDenyReason(request: ExecutionRequest) {
  const executable = executableName(request.command.executable);
  const args = joinedArgs(request);
  if (blockedExecutables.has(executable)) return "Shell interpreters are never accepted by the execution broker.";
  if (packageManagers.has(executable) && /(?:^|\s)(?:add|ci|install|remove|uninstall|update|upgrade)(?:\s|$)/.test(args)) {
    return "Package installation and dependency mutation are disabled.";
  }
  if (
    (/(?:^|\b)(?:node|node\.exe)$/.test(executable) && ["-e", "--eval", "-p", "--print"].includes(request.command.args[0] ?? "")) ||
    (/(?:^|\b)(?:py|py\.exe|python|python\.exe|python3|python3\.exe)$/.test(executable) && request.command.args.some((argument) => argument === "-c" || argument === "-m"))
  ) {
    return "Inline or module-based dynamic code execution is blocked; use a reviewed file-backed adapter operation."
  }
  if (executable === "git" || executable === "git.exe") {
    const operation = request.command.args[0]?.toLowerCase() ?? "";
    if (request.capability !== "git.read" || !new Set(["diff", "log", "rev-parse", "show", "status"]).has(operation)) {
      return "Git mutation, commit, reset, checkout, clean, and push require a later explicit delivery policy.";
    }
  }
  if (/\b(?:deploy|publish|vercel|netlify|wrangler)\b/.test(`${executable} ${args}`)) {
    return "Deployment and publication are outside this execution grant.";
  }
  if (/\b(?:migrate\s+(?:deploy|dev|reset)|db\s+(?:push|drop|reset)|drop\s+(?:database|schema|table)|truncate\s+table)\b/.test(args)) {
    return "Database apply, reset, and destructive operations are hard denied.";
  }
  if (request.risk === "critical") return "Critical-risk operations cannot be authorized by project approval policies.";
  return null;
}

export function evaluateExecutionPolicy(request: ExecutionRequest, grant: ExecutionGrant) {
  const hardDeny = hardDenyReason(request);
  if (hardDeny) return { code: "hard-deny" as const, message: hardDeny };
  if (!allowedByMode[request.mode].has(request.capability)) {
    return {
      code: "command-not-allowed" as const,
      message: `${request.capability} is not available in ${request.mode} mode.`
    };
  }
  if (request.network !== "none") {
    return {
      code: "network-not-enforced" as const,
      message: "Networked execution is blocked because this runtime does not provide kernel-enforced network isolation."
    };
  }
  if (request.mode === "ASK" && (request.scope.kind !== "task-temp" || request.mutation === "project")) {
    return {
      code: "path-blocked" as const,
      message: "ASK execution is limited to Hassali-owned temporary task artifacts."
    };
  }
  if (request.mode === "CODE" && request.scope.kind !== "project" && request.capability === "repository.verify") {
    return {
      code: "path-blocked" as const,
      message: "Repository verification requires the approved project workspace."
    };
  }
  if (grant.approvalPolicy === "ask" && grant.approvalSource !== "inline_approval") {
    return {
      code: "approval-required" as const,
      message: "Ask for approval requires an inline server-authorized grant."
    };
  }
  if (request.risk === "high" && grant.approvalSource !== "inline_approval") {
    return {
      code: "approval-required" as const,
      message: "High-risk execution requires fresh inline approval."
    };
  }
  return null;
}
