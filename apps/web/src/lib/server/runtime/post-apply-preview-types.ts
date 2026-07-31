export type PostApplyRuntimeKind =
  | "astro"
  | "backend_node"
  | "library"
  | "next_app"
  | "nuxt"
  | "python"
  | "react_scripts"
  | "react_vite"
  | "remix"
  | "sveltekit"
  | "unknown";

export type PostApplyPackageManager = "bun" | "npm" | "pnpm" | "unknown" | "yarn";

export type PostApplyRuntimeStatus =
  | "AMBIGUOUS_TARGET"
  | "FAILED"
  | "NOT_ATTEMPTED"
  | "NOT_PREVIEWABLE"
  | "READY"
  | "REUSED_EXISTING";

export type PostApplyFailureClass =
  | "AMBIGUOUS_TARGET"
  | "APPLICATION_RENDER_FAILED"
  | "CANCELLED"
  | "COMPILE_ERROR"
  | "ENVIRONMENT_MISSING"
  | "HTTP_UNREACHABLE"
  | "MISSING_DEPENDENCIES"
  | "MISSING_SCRIPT"
  | "NO_PREVIEW_CAPABLE_PROJECT"
  | "NONE"
  | "PORT_CONFLICT"
  | "PROCESS_EXITED"
  | "READINESS_TIMEOUT"
  | "RUNTIME_NOT_APPROVED"
  | "UNSUPPORTED_RUNTIME";

export type PostApplyCommandSource =
  | "none"
  | "package_script"
  | "reused_existing_process";

export type PostApplyTargetCandidate = {
  commandSource: PostApplyCommandSource;
  confidence: number;
  defaultPort: number | null;
  framework: PostApplyRuntimeKind;
  manifestPath: string;
  packageManager: PostApplyPackageManager;
  packageName: string | null;
  relativeRoot: string;
  score: number;
  scriptCommand: string | null;
  selectedCommand: string | null;
  selectedScript: string | null;
  signals: string[];
};

export type PostApplyRuntimeDiscovery = {
  candidates: PostApplyTargetCandidate[];
  detected: boolean;
  selectedTarget: PostApplyTargetCandidate | null;
  status: "AMBIGUOUS_TARGET" | "DETECTED" | "NOT_PREVIEWABLE" | "NONE";
  warnings: string[];
};

export type PostApplyPreviewValidationWarning = {
  code: string;
  message: string;
};

export type PostApplyPreviewResult = {
  commandSource: PostApplyCommandSource;
  existingProcessReused: boolean;
  failureClass: PostApplyFailureClass;
  failureDetails: string | null;
  filesApplied: boolean;
  filesChanged: string[];
  httpStatus: number | null;
  packageManager: PostApplyPackageManager;
  port: number | null;
  portSelectionResult:
    | "none"
    | "preferred_port"
    | "reused_existing"
    | "used_alternative_port";
  previewAttempted: boolean;
  previewReady: boolean;
  previewUrl: string | null;
  processStarted: boolean;
  readinessVerified: boolean;
  recoverySteps: string[];
  runnableTargetDetected: boolean;
  runtimeKind: PostApplyRuntimeKind;
  runtimeStatus: PostApplyRuntimeStatus;
  selectedCommand: string | null;
  selectedScript: string | null;
  summary: string;
  validationWarnings: PostApplyPreviewValidationWarning[];
  verificationStatus: "FAILED" | "NOT_RUN" | "PASSED";
  workspacePath: string | null;
};

export type PostApplyRuntimeOperation = {
  error: string | null;
  existingProcessReused?: boolean;
  httpStatus?: number | null;
  logs: string[];
  port: number | null;
  previewUrl: string | null;
  processStarted?: boolean;
  readinessVerified?: boolean;
  runtimeStatus: "blocked" | "error" | "running" | "starting" | "stopped";
  workspaceRoot: string;
};
