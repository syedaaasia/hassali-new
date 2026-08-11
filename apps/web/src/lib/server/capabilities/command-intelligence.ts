import { createHash } from "node:crypto";
import type { CommandIntelligence, VerificationCapability } from "./capability-types";
import type { RepositoryScript, RepositorySnapshot } from "../repository-intelligence/repository-intelligence-types";

function packageInvocation(snapshot: RepositorySnapshot, script: RepositoryScript) {
  const manager = snapshot.packageManagers.includes("pnpm")
    ? "pnpm"
    : snapshot.packageManagers.includes("yarn")
      ? "yarn"
      : snapshot.packageManagers.includes("npm")
        ? "npm"
        : null;
  if (!manager) return null;
  return { executable: manager, args: manager === "npm" ? ["run", script.name] : [script.name] };
}

function commandId(script: RepositoryScript) {
  return `script-${createHash("sha256").update(`${script.workspacePath}:${script.name}:${script.body}`).digest("hex").slice(0, 12)}`;
}

function mutationFor(script: RepositoryScript): CommandIntelligence["mutation"] {
  if (/\b(?:deploy|publish)\b/i.test(`${script.name} ${script.body}`)) return "external-mutation";
  if (["build", "generate"].includes(script.purpose)) return "writes-artifacts";
  return script.mayMutate ? "may-write" : "read-only";
}

function riskFor(script: RepositoryScript): CommandIntelligence["risk"] {
  if (/\b(?:deploy|publish|drop|delete)\b/i.test(`${script.name} ${script.body}`)) return "critical";
  return script.risk;
}

export function classifyRepositoryCommands(snapshot: RepositorySnapshot): CommandIntelligence[] {
  return snapshot.scripts
    .map((script) => ({
      commandId: commandId(script),
      evidence: [{ confidence: 0.99, detail: `Declared repository script '${script.name}' was classified without execution.`, source: "script" as const, sourceRef: script.workspacePath }],
      intent: /\b(?:deploy|publish)\b/i.test(`${script.name} ${script.body}`) ? "deploy" as const : script.purpose,
      invocation: packageInvocation(snapshot, script),
      longRunning: script.longRunning,
      mutation: mutationFor(script),
      packIds: ["typescript-javascript"],
      requiresInstallation: false,
      requiresNetwork: /\b(?:deploy|publish|download|fetch)\b/i.test(`${script.name} ${script.body}`),
      risk: riskFor(script),
      scriptBody: script.body,
      scriptName: script.name,
      workspacePath: script.workspacePath
    }))
    .sort((left, right) => left.workspacePath.localeCompare(right.workspacePath) || left.scriptName.localeCompare(right.scriptName));
}

const verificationPriority: Partial<Record<RepositoryScript["purpose"], { kind: VerificationCapability["kind"]; priority: number }>> = {
  typecheck: { kind: "typecheck", priority: 10 },
  test: { kind: "test", priority: 20 },
  lint: { kind: "lint", priority: 30 },
  build: { kind: "build", priority: 40 }
};

export function deriveVerificationCapabilities(commands: CommandIntelligence[]): VerificationCapability[] {
  return commands
    .flatMap((command) => {
      const mapped = verificationPriority[command.intent as RepositoryScript["purpose"]];
      if (!mapped || command.mutation === "external-mutation") return [];
      return [{ commandId: command.commandId, kind: mapped.kind, priority: mapped.priority, scope: command.workspacePath ? "workspace" as const : "repository" as const }];
    })
    .sort((left, right) => left.priority - right.priority || left.commandId.localeCompare(right.commandId));
}
