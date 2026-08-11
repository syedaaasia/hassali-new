import type { RepositoryScript, RepositorySnapshot } from "../repository-intelligence/repository-intelligence-types";

export type CapabilityKind =
  | "build-tool"
  | "compiler"
  | "formatter"
  | "interpreter"
  | "language"
  | "lint-tool"
  | "media-tool"
  | "ocr-tool"
  | "package-manager"
  | "runtime"
  | "test-tool"
  | "utility-tool";

export type CapabilityStatus =
  | "available"
  | "degraded"
  | "detected"
  | "incompatible"
  | "unavailable"
  | "unknown"
  | "unsupported";

export type CapabilityEvidence = {
  confidence: number;
  detail: string;
  source: "manifest" | "platform" | "repository" | "runtime-probe" | "script";
  sourceRef: string | null;
};

export type CapabilityPackDetection = {
  confidence: number;
  evidence: CapabilityEvidence[];
  packId: string;
  status: CapabilityStatus;
};

export type CapabilityPack = {
  deepAnalysis: "limited" | "metadata" | "symbols-and-routes";
  detect(snapshot: RepositorySnapshot): CapabilityPackDetection | null;
  fileExtensions: string[];
  id: string;
  kinds: CapabilityKind[];
  limitations: string[];
  manifestNames: string[];
  supportedLanguages: string[];
  version: string;
};

export type LocalToolId = "ffmpeg" | "ffprobe" | "node" | "python" | "tesseract";

export type LocalToolCapability = {
  capabilityKinds: CapabilityKind[];
  checkedAt: string;
  evidence: CapabilityEvidence[];
  executableName: string | null;
  id: LocalToolId;
  limitations: string[];
  operations: string[];
  platform: NodeJS.Platform;
  status: CapabilityStatus;
  version: string | null;
};

export type ProjectCapability = {
  declaredByRepository: boolean;
  evidence: CapabilityEvidence[];
  id: string;
  kind: CapabilityKind;
  localStatus: CapabilityStatus;
  packId: string | null;
  version: string | null;
};

export type CommandRisk = "critical" | "high" | "low" | "moderate";
export type CommandMutation = "external-mutation" | "may-write" | "read-only" | "writes-artifacts";

export type CommandIntelligence = {
  commandId: string;
  evidence: CapabilityEvidence[];
  intent: RepositoryScript["purpose"] | "deploy" | "install";
  invocation: { args: string[]; executable: string } | null;
  longRunning: boolean;
  mutation: CommandMutation;
  packIds: string[];
  requiresInstallation: boolean;
  requiresNetwork: boolean;
  risk: CommandRisk;
  scriptBody: string;
  scriptName: string;
  workspacePath: string;
};

export type VerificationCapability = {
  commandId: string;
  kind: "build" | "integration-test" | "lint" | "syntax" | "test" | "typecheck";
  priority: number;
  scope: "package" | "repository" | "workspace";
};

export type RepositoryCapabilityProfile = {
  capabilities: ProjectCapability[];
  commands: CommandIntelligence[];
  createdAt: string;
  fingerprint: string;
  localTools: LocalToolCapability[];
  packs: CapabilityPackDetection[];
  repositoryFingerprint: string;
  verification: VerificationCapability[];
  warnings: string[];
};

export type TaskCapabilityRequest = {
  approvalRequired: boolean;
  prompt: string;
  requiredCapabilities?: string[];
  requiresExecution: boolean;
  taskId: string;
  workspaceHints?: string[];
};

export type ExecutionRequirement = {
  approvalRequired: boolean;
  capabilityId: string;
  commandId: string | null;
  commandIntent: string;
  duration: "bounded" | "long-running" | "unknown";
  filesystem: "project-read" | "project-write" | "temporary-write";
  id: string;
  missingPrerequisites: string[];
  mutation: CommandMutation;
  network: "forbidden" | "required" | "unknown";
  permission: "not-granted";
  risk: CommandRisk;
  workingScope: string;
};

export type CapabilityMatch = {
  availableCapabilityIds: string[];
  degradedCapabilityIds: string[];
  executionRequirements: ExecutionRequirement[];
  missingCapabilityIds: string[];
  selectedPackIds: string[];
  suggestedCommandIds: string[];
  taskId: string;
  unsupportedCapabilityIds: string[];
};
