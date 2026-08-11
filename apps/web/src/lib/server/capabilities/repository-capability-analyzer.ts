import { createHash } from "node:crypto";
import { createBuiltInCapabilityPackRegistry } from "./built-in-capability-packs";
import { classifyRepositoryCommands, deriveVerificationCapabilities } from "./command-intelligence";
import { detectLocalToolCapabilities } from "./local-tool-detector";
import type {
  CapabilityMatch,
  CapabilityPackDetection,
  CommandIntelligence,
  ExecutionRequirement,
  LocalToolCapability,
  ProjectCapability,
  RepositoryCapabilityProfile,
  TaskCapabilityRequest
} from "./capability-types";
import { repositoryFileHasPrivateToken } from "../repository-intelligence/repository-intelligence";
import type { RepositorySnapshot } from "../repository-intelligence/repository-intelligence-types";

const pythonHints = ["pytest", "unittest", "ruff", "black", "mypy", "pyright", "poetry", "uv", "pip"] as const;

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

function localToolPacks(tools: LocalToolCapability[]): CapabilityPackDetection[] {
  const detections: CapabilityPackDetection[] = [];
  const media = tools.filter((tool) => tool.id === "ffmpeg" || tool.id === "ffprobe");
  if (media.some((tool) => tool.status !== "unavailable")) {
    const fullyReady = media.length === 2 && media.every((tool) => tool.status === "available" || tool.status === "detected");
    detections.push({ confidence: fullyReady ? 0.99 : 0.78, evidence: media.flatMap((tool) => tool.evidence), packId: "local-media", status: fullyReady ? "available" : "degraded" });
  }
  const ocr = tools.find((tool) => tool.id === "tesseract");
  if (ocr && ocr.status !== "unavailable") detections.push({ confidence: ocr.status === "available" ? 0.99 : 0.75, evidence: ocr.evidence, packId: "local-ocr", status: ocr.status });
  return detections;
}

function projectCapabilities(snapshot: RepositorySnapshot, packs: CapabilityPackDetection[], tools: LocalToolCapability[]): ProjectCapability[] {
  const capabilities: ProjectCapability[] = [];
  for (const pack of packs) {
    const kind = pack.packId === "local-media" ? "media-tool" : pack.packId === "local-ocr" ? "ocr-tool" : "language";
    capabilities.push({ declaredByRepository: !pack.packId.startsWith("local-"), evidence: pack.evidence, id: `pack:${pack.packId}`, kind, localStatus: pack.packId.startsWith("local-") ? pack.status : "unknown", packId: pack.packId, version: null });
  }
  for (const manager of snapshot.packageManagers) {
    capabilities.push({
      declaredByRepository: true,
      evidence: [{ confidence: 0.9, detail: `${manager} is declared by repository lock/workspace evidence; local executable health was not probed.`, source: "manifest", sourceRef: null }],
      id: `package-manager:${manager}`,
      kind: "package-manager",
      localStatus: "unknown",
      packId: "typescript-javascript",
      version: null
    });
  }
  for (const tool of tools) {
    for (const kind of tool.capabilityKinds) {
      capabilities.push({ declaredByRepository: false, evidence: tool.evidence, id: `tool:${tool.id}`, kind, localStatus: tool.status, packId: tool.id === "tesseract" ? "local-ocr" : ["ffmpeg", "ffprobe"].includes(tool.id) ? "local-media" : tool.id === "python" ? "python" : "typescript-javascript", version: tool.version });
    }
  }
  if (packs.some((pack) => pack.packId === "python")) {
    for (const hint of pythonHints) {
      const evidence = snapshot.files.filter((file) => repositoryFileHasPrivateToken(file, hint)).slice(0, 3);
      if (evidence.length) capabilities.push({ declaredByRepository: true, evidence: evidence.map((file) => ({ confidence: 0.74, detail: `${hint} is referenced by repository metadata.`, source: "repository", sourceRef: file.path })), id: `python-tool:${hint}`, kind: ["pytest", "unittest"].includes(hint) ? "test-tool" : ["ruff"].includes(hint) ? "lint-tool" : ["black"].includes(hint) ? "formatter" : ["mypy", "pyright"].includes(hint) ? "compiler" : "package-manager", localStatus: "detected", packId: "python", version: null });
    }
  }
  return capabilities.sort((left, right) => left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind));
}

export async function analyzeRepositoryCapabilities(snapshot: RepositorySnapshot, options: { localTools?: LocalToolCapability[] } = {}): Promise<RepositoryCapabilityProfile> {
  const registry = createBuiltInCapabilityPackRegistry();
  const tools = options.localTools ?? await detectLocalToolCapabilities();
  const packs = [...registry.detect(snapshot), ...localToolPacks(tools)].sort((left, right) => right.confidence - left.confidence || left.packId.localeCompare(right.packId));
  const commands = classifyRepositoryCommands(snapshot);
  const payload = JSON.stringify({ repository: snapshot.fingerprint, packs: packs.map((pack) => [pack.packId, pack.status]), tools: tools.map((tool) => [tool.id, tool.status, tool.version]), commands: commands.map((command) => command.commandId) });
  return {
    capabilities: projectCapabilities(snapshot, packs, tools),
    commands,
    createdAt: new Date().toISOString(),
    fingerprint: createHash("sha256").update(payload).digest("hex").slice(0, 24),
    localTools: tools,
    packs,
    repositoryFingerprint: snapshot.fingerprint,
    verification: deriveVerificationCapabilities(commands),
    warnings: unique([
      packs.some((pack) => pack.packId === "python") ? "Python virtual environments isolate dependencies but are not execution sandboxes." : "",
      tools.some((tool) => tool.status === "degraded") ? "One or more local tool probes were degraded; availability is not assumed." : "",
      "Detected capability does not grant execution permission."
    ])
  };
}

function requestedCapabilityIds(request: TaskCapabilityRequest, profile: RepositoryCapabilityProfile) {
  const prompt = `${request.prompt} ${(request.requiredCapabilities ?? []).join(" ")}`.toLowerCase();
  return unique([
    /\bpython\b|\.py\b/.test(prompt) ? "tool:python" : "",
    /\bffmpeg\b|transcod|extract (?:audio|frames)|video compress/.test(prompt) ? "tool:ffmpeg" : "",
    /\bffprobe\b|media metadata|codec|frame rate/.test(prompt) ? "tool:ffprobe" : "",
    /\b(?:tesseract|local ocr)\b/.test(prompt) ? "tool:tesseract" : "",
    request.requiresExecution && profile.packs.some((pack) => pack.packId === "typescript-javascript") ? "tool:node" : ""
  ]);
}

function requirement(capabilityId: string, request: TaskCapabilityRequest, command: CommandIntelligence | null, missing: boolean): ExecutionRequirement {
  return {
    approvalRequired: true,
    capabilityId,
    commandId: command?.commandId ?? null,
    commandIntent: command?.intent ?? `use ${capabilityId.replace("tool:", "")}`,
    duration: command?.longRunning ? "long-running" : "bounded",
    filesystem: !command || command.mutation === "read-only" ? "project-read" : command.mutation === "writes-artifacts" ? "temporary-write" : "project-write",
    id: `requirement-${createHash("sha256").update(`${request.taskId}:${capabilityId}:${command?.commandId ?? "none"}`).digest("hex").slice(0, 12)}`,
    missingPrerequisites: missing ? [`${capabilityId} is not available to the current Hassali server process.`] : [],
    mutation: command?.mutation ?? "read-only",
    network: command?.requiresNetwork ? "required" : "forbidden",
    permission: "not-granted",
    risk: command?.risk ?? "low",
    workingScope: command?.workspacePath || "selected owned project"
  };
}

export function matchRepositoryCapabilities(profile: RepositoryCapabilityProfile, request: TaskCapabilityRequest): CapabilityMatch {
  const requested = requestedCapabilityIds(request, profile);
  const available: string[] = [];
  const degraded: string[] = [];
  const missing: string[] = [];
  for (const id of requested) {
    const tool = profile.localTools.find((candidate) => `tool:${candidate.id}` === id);
    if (!tool || ["unavailable", "unknown"].includes(tool.status)) missing.push(id);
    else if (tool.status === "degraded") degraded.push(id);
    else available.push(id);
  }
  const prompt = request.prompt.toLowerCase();
  const desiredPurposes = ["typecheck", "test", "lint", "build"].filter((purpose) => prompt.includes(purpose) || (request.requiresExecution && ["typecheck", "test"].includes(purpose)));
  const workspaceCommands = profile.commands.filter((command) => command.workspacePath && request.workspaceHints?.some((hint) => hint === command.workspacePath || hint.startsWith(`${command.workspacePath}/`)));
  const commandPool = workspaceCommands.length ? workspaceCommands : profile.commands;
  const suggested = commandPool.filter((command) => desiredPurposes.includes(command.intent)).slice(0, 4).map((command) => command.commandId);
  return {
    availableCapabilityIds: available,
    degradedCapabilityIds: degraded,
    executionRequirements: [
      ...requested.map((id) => requirement(id, request, null, missing.includes(id) || degraded.includes(id))),
      ...suggested.map((id) => requirement("repository-command", request, profile.commands.find((command) => command.commandId === id) ?? null, false))
    ],
    missingCapabilityIds: missing,
    selectedPackIds: profile.packs.map((pack) => pack.packId),
    suggestedCommandIds: suggested,
    taskId: request.taskId,
    unsupportedCapabilityIds: []
  };
}
