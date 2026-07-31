import type { DevServerRuntimeResult } from "@/lib/server/runtime/dev-server-runtime-types";
import {
  discoverPostApplyRuntime,
  resolvePostApplyTargetWorkspace
} from "@/lib/server/runtime/post-apply-runtime-discovery";
import type {
  PostApplyFailureClass,
  PostApplyPreviewResult,
  PostApplyPreviewValidationWarning,
  PostApplyRuntimeOperation,
  PostApplyTargetCandidate
} from "@/lib/server/runtime/post-apply-preview-types";
import { startNextRuntime } from "@/lib/server/runtime/next-runtime-manager";
import { startViteRuntime } from "@/lib/server/runtime/vite-runtime-manager";

type PostApplyStartAdapter = (input: {
  abortSignal?: AbortSignal;
  projectId: string;
  projectWorkspaceRoot: string;
  target: PostApplyTargetCandidate;
  targetWorkspaceRoot: string;
  workerType: string | null;
}) => Promise<PostApplyRuntimeOperation>;

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function failureClassFor(error: string | null, logs: string[]): PostApplyFailureClass {
  const text = [error ?? "", ...logs.slice(-30)].join("\n").toLowerCase();
  if (/\bcancel(?:led|ed)?\b|abort/i.test(text)) return "CANCELLED";
  if (/\b(?:module not found|cannot find (?:module|package)|dependency tree|executable is not available|missing dependenc)/i.test(text)) {
    return "MISSING_DEPENDENCIES";
  }
  if (/\b(?:scripts?\.dev|missing script|requires an approved package\.json|requires package\.json)/i.test(text)) {
    return "MISSING_SCRIPT";
  }
  if (/\b(?:eaddrinuse|port\b.+\b(?:occupied|conflict|available)|allocate a local)/i.test(text)) {
    return "PORT_CONFLICT";
  }
  if (/\b(?:database_url|environment variable|missing env|env var|required by the application)/i.test(text)) {
    return "ENVIRONMENT_MISSING";
  }
  if (/\b(?:compile|syntaxerror|typescript error|invalid jsx|failed to compile|error ts\d+)/i.test(text)) {
    return "COMPILE_ERROR";
  }
  if (/\b(?:http 5\d\d|application render|internal server error)/i.test(text)) {
    return "APPLICATION_RENDER_FAILED";
  }
  if (/\b(?:timed out|timeout|did not become ready)/i.test(text)) {
    return "READINESS_TIMEOUT";
  }
  if (/\b(?:exited|exit code|process.+(?:closed|ended|stopped))/i.test(text)) {
    return "PROCESS_EXITED";
  }
  return "HTTP_UNREACHABLE";
}

function recoveryFor(failureClass: PostApplyFailureClass, target: PostApplyTargetCandidate | null) {
  const command = target?.selectedCommand;
  if (failureClass === "MISSING_DEPENDENCIES") {
    return unique([
      "Install the project dependencies through an explicitly approved package-install flow.",
      command ? `Then retry the existing project script: ${command}.` : null,
      "Hassali did not install any package automatically."
    ]);
  }
  if (failureClass === "MISSING_SCRIPT") {
    return [
      "Add or correct a bounded dev script in the selected package manifest, then approve a new runtime attempt."
    ];
  }
  if (failureClass === "PORT_CONFLICT") {
    return [
      "Stop the conflicting process yourself or configure this project to use another supported port.",
      "Hassali did not stop the unrelated process."
    ];
  }
  if (failureClass === "ENVIRONMENT_MISSING") {
    return [
      "Configure the required environment variable in the approved project runtime without exposing its value, then retry."
    ];
  }
  if (failureClass === "COMPILE_ERROR" || failureClass === "APPLICATION_RENDER_FAILED") {
    return [
      "Review the concise runtime error below, fix the affected source file, and approve the repair before retrying preview."
    ];
  }
  if (failureClass === "PROCESS_EXITED") {
    return [
      "Review the final runtime log lines and correct the startup failure before retrying."
    ];
  }
  if (failureClass === "READINESS_TIMEOUT" || failureClass === "HTTP_UNREACHABLE") {
    return [
      "Confirm the selected dev script serves HTTP on the configured host and port, then retry the bounded preview start."
    ];
  }
  if (failureClass === "CANCELLED") {
    return ["Retry preview when you are ready; the cancelled phase-owned runtime was cleaned up."];
  }
  return [];
}

function summaryFor(result: Omit<PostApplyPreviewResult, "summary">) {
  if (result.previewReady) {
    return [
      "Files were applied and verified.",
      result.existingProcessReused ? "A healthy project-owned preview was reused." : "A project-owned preview was started.",
      `Readiness was verified at ${result.previewUrl}.`,
      result.selectedCommand ? `Runtime command: ${result.selectedCommand}.` : ""
    ].filter(Boolean).join(" ");
  }
  if (!result.filesApplied) {
    return "Preview was not attempted because the approved file changes were not applied.";
  }
  if (result.runtimeStatus === "NOT_PREVIEWABLE") {
    return "The change was applied and verified, but this target does not expose a supported browser preview.";
  }
  if (result.runtimeStatus === "AMBIGUOUS_TARGET") {
    return "The file changes were applied, but preview was not started because more than one runnable application matched.";
  }
  if (result.runtimeStatus === "NOT_ATTEMPTED") {
    return result.failureClass === "RUNTIME_NOT_APPROVED"
      ? "The file changes were applied, but runtime start was not authorized by the approved CODE execution path."
      : "The file changes were applied, but no preview-capable project was detected.";
  }
  return `The file changes were applied, but the preview did not start successfully. ${result.failureDetails ?? "Runtime readiness was not verified."}`;
}

export function normalizePostApplyPreviewResult(
  input: Omit<PostApplyPreviewResult, "summary" | "validationWarnings"> & {
    validationWarnings?: PostApplyPreviewValidationWarning[];
  }
): PostApplyPreviewResult {
  let previewReady = input.previewReady;
  let readinessVerified = input.readinessVerified;
  let previewUrl = input.previewUrl;
  let runtimeStatus = input.runtimeStatus;
  let failureClass = input.failureClass;
  const warnings = [...(input.validationWarnings ?? [])];
  const warn = (code: string, message: string) => warnings.push({ code, message });

  if (!input.filesApplied && input.previewAttempted) {
    warn("POST_APPLY_PREVIEW_WITHOUT_FILES", "Preview cannot be attempted before files are applied.");
    previewReady = false;
    readinessVerified = false;
    previewUrl = null;
    runtimeStatus = "NOT_ATTEMPTED";
    failureClass = "NO_PREVIEW_CAPABLE_PROJECT";
  }
  if (previewReady && !readinessVerified) {
    warn("POST_APPLY_READY_WITHOUT_READINESS", "Preview readiness requires verified evidence.");
    previewReady = false;
    previewUrl = null;
    runtimeStatus = "FAILED";
    failureClass = "HTTP_UNREACHABLE";
  }
  if (previewReady && !previewUrl) {
    warn("POST_APPLY_READY_WITHOUT_URL", "A ready browser preview requires a verified URL.");
    previewReady = false;
    readinessVerified = false;
    runtimeStatus = "FAILED";
    failureClass = "HTTP_UNREACHABLE";
  }
  if (runtimeStatus === "FAILED" && previewReady) {
    warn("POST_APPLY_FAILED_AND_READY", "A failed runtime cannot be preview-ready.");
    previewReady = false;
    readinessVerified = false;
    previewUrl = null;
  }
  if (
    previewReady &&
    runtimeStatus !== "READY" &&
    runtimeStatus !== "REUSED_EXISTING"
  ) {
    warn("POST_APPLY_READY_WITH_INVALID_STATUS", "Preview readiness requires a successful runtime status.");
    previewReady = false;
    readinessVerified = false;
    previewUrl = null;
    runtimeStatus = "FAILED";
    failureClass = failureClass === "NONE" ? "HTTP_UNREACHABLE" : failureClass;
  }
  if (!previewReady && (runtimeStatus === "READY" || runtimeStatus === "REUSED_EXISTING")) {
    warn("POST_APPLY_SUCCESS_STATUS_WITHOUT_READY", "Success status requires a verified ready preview.");
    runtimeStatus = "FAILED";
    failureClass = failureClass === "NONE" ? "HTTP_UNREACHABLE" : failureClass;
  }
  if (!previewReady && previewUrl) {
    warn("POST_APPLY_URL_WITHOUT_READY_PREVIEW", "A preview URL cannot be exposed for a non-ready preview.");
    previewUrl = null;
  }
  if (runtimeStatus === "FAILED" && failureClass === "NONE") {
    warn("POST_APPLY_FAILED_WITHOUT_CLASS", "A failed preview requires a failure classification.");
    failureClass = "HTTP_UNREACHABLE";
  }

  const normalized = {
    ...input,
    failureClass,
    previewReady,
    previewUrl,
    readinessVerified,
    runtimeStatus,
    validationWarnings: warnings
  };
  return {
    ...normalized,
    summary: summaryFor(normalized)
  };
}

function baseResult(input: {
  filesApplied: boolean;
  filesChanged: string[];
  verificationStatus: PostApplyPreviewResult["verificationStatus"];
}): Omit<PostApplyPreviewResult, "summary" | "validationWarnings"> {
  return {
    commandSource: "none",
    existingProcessReused: false,
    failureClass: "NONE",
    failureDetails: null,
    filesApplied: input.filesApplied,
    filesChanged: input.filesChanged,
    httpStatus: null,
    packageManager: "unknown",
    port: null,
    portSelectionResult: "none",
    previewAttempted: false,
    previewReady: false,
    previewUrl: null,
    processStarted: false,
    readinessVerified: false,
    recoverySteps: [],
    runnableTargetDetected: false,
    runtimeKind: "unknown",
    runtimeStatus: "NOT_ATTEMPTED",
    selectedCommand: null,
    selectedScript: null,
    verificationStatus: input.verificationStatus,
    workspacePath: null
  };
}

async function defaultStartAdapter(input: {
  abortSignal?: AbortSignal;
  projectId: string;
  projectWorkspaceRoot: string;
  target: PostApplyTargetCandidate;
  targetWorkspaceRoot: string;
  workerType: string | null;
}): Promise<PostApplyRuntimeOperation> {
  const devServerRuntime: DevServerRuntimeResult = {
    blockedReason: null,
    blockedReasons: [],
    canRun: true,
    capabilities: ["framework_detection", "planned_command_metadata", "port_metadata"],
    confidence: input.target.confidence,
    framework: input.target.framework === "next_app" ? "next_app" as const : "react_vite" as const,
    frameworkDisplayName: input.target.framework === "next_app" ? "Next.js" : "React Vite",
    plannedCommand: input.target.selectedCommand,
    port: input.target.defaultPort,
    previewUrl: null,
    runtimeStatus: "blocked_until_explicit_enablement" as const,
    signals: input.target.signals,
    startCommand: input.target.scriptCommand,
    warnings: [],
    workingDirectory: "." as const
  };

  if (input.target.framework === "next_app") {
    return startNextRuntime({
      abortSignal: input.abortSignal,
      devServerRuntime,
      productMode: "CODE",
      projectRoot: input.projectWorkspaceRoot,
      projectId: input.projectId,
      workerType: input.workerType,
      workspaceRoot: input.targetWorkspaceRoot
    });
  }
  return startViteRuntime({
    abortSignal: input.abortSignal,
    devServerRuntime,
    productMode: "CODE",
    projectRoot: input.projectWorkspaceRoot,
    projectId: input.projectId,
    workerType: input.workerType,
    workspaceRoot: input.targetWorkspaceRoot
  });
}

export async function runPostApplyPreview(input: {
  abortSignal?: AbortSignal;
  approvalSatisfied: boolean;
  filesApplied: boolean;
  filesChanged: string[];
  generatedFiles: Record<string, string>;
  projectId: string;
  runtimeExecutableAvailable?: (input: {
    projectWorkspaceRoot: string;
    scriptCommand: string;
    targetWorkspaceRoot: string;
  }) => boolean | Promise<boolean>;
  runtimeStartAllowed: boolean;
  startAdapter?: PostApplyStartAdapter;
  verificationStatus: PostApplyPreviewResult["verificationStatus"];
  workerType: string | null;
  workspaceRoot: string;
}) {
  const initial = baseResult(input);
  if (!input.filesApplied) {
    return {
      discovery: discoverPostApplyRuntime({
        generatedFiles: input.generatedFiles,
        writtenFiles: input.filesChanged
      }),
      operation: null,
      result: normalizePostApplyPreviewResult(initial)
    };
  }

  const discovery = discoverPostApplyRuntime({
    generatedFiles: input.generatedFiles,
    writtenFiles: input.filesChanged
  });
  const discoveryValidationWarnings = discovery.warnings.map((message) => ({
    code: "POST_APPLY_DISCOVERY_WARNING",
    message
  }));
  const target = discovery.selectedTarget;
  if (discovery.status === "AMBIGUOUS_TARGET") {
    const result = normalizePostApplyPreviewResult({
      ...initial,
      failureClass: "AMBIGUOUS_TARGET",
      failureDetails: discovery.warnings[0] ?? "Multiple runnable targets matched.",
      recoverySteps: ["Choose the intended application package before starting preview."],
      runnableTargetDetected: true,
      runtimeStatus: "AMBIGUOUS_TARGET",
      validationWarnings: discoveryValidationWarnings
    });
    return { discovery, operation: null, result };
  }
  if (discovery.status === "NOT_PREVIEWABLE") {
    const result = normalizePostApplyPreviewResult({
      ...initial,
      failureClass: "UNSUPPORTED_RUNTIME",
      failureDetails: discovery.warnings[0] ?? "This target has no supported browser preview.",
      runnableTargetDetected: discovery.detected,
      runtimeKind: target?.framework ?? (discovery.detected ? "python" : "unknown"),
      runtimeStatus: "NOT_PREVIEWABLE",
      validationWarnings: discoveryValidationWarnings,
      workspacePath: target?.relativeRoot ?? null
    });
    return { discovery, operation: null, result };
  }
  if (discovery.status === "NONE" || !target) {
    const result = normalizePostApplyPreviewResult({
      ...initial,
      failureClass: "NO_PREVIEW_CAPABLE_PROJECT",
      failureDetails: discovery.warnings[0] ?? "No preview-capable project was detected.",
      recoverySteps: ["Confirm the approved files include a runnable browser application and package manifest."],
      validationWarnings: discoveryValidationWarnings
    });
    return { discovery, operation: null, result };
  }

  const selected = {
    ...initial,
    commandSource: target.commandSource,
    packageManager: target.packageManager,
    runnableTargetDetected: true,
    runtimeKind: target.framework,
    selectedCommand: target.selectedCommand,
    selectedScript: target.selectedScript,
    validationWarnings: discoveryValidationWarnings,
    workspacePath: target.relativeRoot || "."
  };
  if (!target.selectedScript || !target.scriptCommand) {
    const result = normalizePostApplyPreviewResult({
      ...selected,
      failureClass: "MISSING_SCRIPT",
      failureDetails: "The selected package does not define a runnable dev, preview, or start script.",
      recoverySteps: recoveryFor("MISSING_SCRIPT", target),
      runtimeStatus: "FAILED"
    });
    return { discovery, operation: null, result };
  }

  const targetWorkspaceRoot = resolvePostApplyTargetWorkspace(input.workspaceRoot, target.relativeRoot);
  const executableAvailable = input.runtimeExecutableAvailable
    ? await input.runtimeExecutableAvailable({
        projectWorkspaceRoot: input.workspaceRoot,
        scriptCommand: target.scriptCommand,
        targetWorkspaceRoot
      })
    : null;
  if (executableAvailable === false) {
    const result = normalizePostApplyPreviewResult({
      ...selected,
      failureClass: "MISSING_DEPENDENCIES",
      failureDetails: "The project-local runtime executable is not available in the approved project dependency tree.",
      recoverySteps: recoveryFor("MISSING_DEPENDENCIES", target),
      runtimeStatus: "FAILED"
    });
    return { discovery, operation: null, result };
  }
  if (!input.approvalSatisfied || !input.runtimeStartAllowed) {
    const result = normalizePostApplyPreviewResult({
      ...selected,
      failureClass: "RUNTIME_NOT_APPROVED",
      failureDetails: "Runtime start requires the approved CODE execution path and successful bounded verification.",
      recoverySteps: ["Approve a CODE execution proposal with bounded verification before starting this runtime."]
    });
    return { discovery, operation: null, result };
  }

  const operation = await (input.startAdapter ?? defaultStartAdapter)({
    abortSignal: input.abortSignal,
    projectId: input.projectId,
    projectWorkspaceRoot: input.workspaceRoot,
    target,
    targetWorkspaceRoot,
    workerType: input.workerType
  });
  const ready = operation.runtimeStatus === "running" &&
    operation.readinessVerified === true &&
    Boolean(operation.previewUrl);
  const failureClass = ready ? "NONE" : failureClassFor(operation.error, operation.logs);
  const usedAlternativePort = Boolean(
    operation.port &&
    target.defaultPort &&
    operation.port !== target.defaultPort
  );
  const result = normalizePostApplyPreviewResult({
    ...selected,
    commandSource: operation.existingProcessReused ? "reused_existing_process" : selected.commandSource,
    existingProcessReused: Boolean(operation.existingProcessReused),
    failureClass,
    failureDetails: ready ? null : operation.error ?? operation.logs.at(-1) ?? "Runtime readiness was not verified.",
    httpStatus: operation.httpStatus ?? null,
    port: ready ? operation.port : null,
    portSelectionResult: operation.existingProcessReused
      ? "reused_existing"
      : usedAlternativePort
        ? "used_alternative_port"
        : operation.port
          ? "preferred_port"
          : "none",
    previewAttempted: true,
    previewReady: ready,
    previewUrl: ready ? operation.previewUrl : null,
    processStarted: Boolean(operation.processStarted),
    readinessVerified: ready,
    recoverySteps: ready ? [] : recoveryFor(failureClass, target),
    runtimeStatus: ready
      ? operation.existingProcessReused ? "REUSED_EXISTING" : "READY"
      : "FAILED"
  });
  return { discovery, operation, result };
}
