import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { WorkspaceContextInput } from "@/lib/server/ai/workspace-context-engine";
import type {
  DeferredToolMetadata,
  DeferredToolSelection,
  ToolEffect
} from "./deferred-tool-kernel";
import type { BrowserVerificationAdapter } from "./browser-verification-kernel";
import { sanitizeUntrustedToolText } from "./security-kernel";

const execFileAsync = promisify(execFile);

export type ToolExecutionStatus = "DENIED" | "FAILED" | "SUCCEEDED" | "UNAVAILABLE";
export type ToolFailureType =
  | "APPROVAL_REQUIRED"
  | "EXECUTION_ERROR"
  | "INVALID_ARGUMENTS"
  | "OWNERSHIP_NOT_VERIFIED"
  | "PERMISSION_REQUIRED"
  | "PROJECT_MISMATCH"
  | "TOOL_UNAVAILABLE"
  | "UNSAFE_PATH";

export type ToolInvocation = {
  approvalGranted?: boolean;
  arguments: Record<string, unknown>;
  permissionGranted?: boolean;
  projectId: string;
  tool: string;
};

export type ToolExecutionResult = {
  effect: ToolEffect;
  evidence: string;
  failureType: ToolFailureType | null;
  injectionDetected: boolean;
  output: unknown;
  projectId: string;
  retryable: boolean;
  secretRedactionApplied: boolean;
  status: ToolExecutionStatus;
  tool: string;
  trusted: false;
};

export type ToolExecutionContext = {
  browserAdapter?: BrowserVerificationAdapter;
  project: VerifiedProjectExecutionBinding;
  workspace?: WorkspaceContextInput;
};

const verifiedProjectBinding = Symbol("verified-project-binding");

export type VerifiedProjectExecutionBinding = {
  projectBaseRoot?: string;
  projectId: string;
  workspaceRoot?: string;
  [verifiedProjectBinding]: true;
};

export function createVerifiedProjectExecutionBinding(input: {
  projectBaseRoot?: string;
  projectId: string;
  workspaceRoot?: string;
}): VerifiedProjectExecutionBinding {
  if (!input.projectId.trim()) throw new Error("Verified project binding requires a projectId.");
  if (input.workspaceRoot && input.projectBaseRoot && !isInside(input.workspaceRoot, input.projectBaseRoot)) {
    throw new Error("Verified project workspace is outside the configured project base root.");
  }
  return {
    projectBaseRoot: input.projectBaseRoot,
    projectId: input.projectId,
    workspaceRoot: input.workspaceRoot,
    [verifiedProjectBinding]: true
  };
}

function denied(
  invocation: ToolInvocation,
  effect: ToolEffect,
  failureType: ToolFailureType,
  evidence: string,
  status: ToolExecutionStatus = "DENIED"
): ToolExecutionResult {
  const sanitized = sanitizeUntrustedToolText(evidence);
  return {
    effect,
    evidence: sanitized.sanitized,
    failureType,
    injectionDetected: sanitized.injectionDetected,
    output: null,
    projectId: invocation.projectId,
    retryable: false,
    secretRedactionApplied: sanitized.secretRedactionApplied,
    status,
    tool: invocation.tool,
    trusted: false
  };
}

function safeWorkspacePath(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/i.test(normalized)) return null;
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  return normalized;
}

function isInside(target: string, base: string) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function metadataFor(selection: DeferredToolSelection, name: string): DeferredToolMetadata | null {
  return selection.discoveredTools.find((tool) => tool.name === name) ?? null;
}

function sanitizedResult(
  invocation: ToolInvocation,
  effect: ToolEffect,
  output: unknown,
  evidence: string
): ToolExecutionResult {
  const sanitizeValue = (
    value: unknown,
    depth = 0
  ): { injectionDetected: boolean; secretRedactionApplied: boolean; value: unknown } => {
    if (typeof value === "string") {
      const sanitized = sanitizeUntrustedToolText(value.slice(0, 50_000));
      return {
        injectionDetected: sanitized.injectionDetected,
        secretRedactionApplied: sanitized.secretRedactionApplied,
        value: sanitized.sanitized
      };
    }
    if (depth >= 4 || value === null || typeof value !== "object") {
      return { injectionDetected: false, secretRedactionApplied: false, value };
    }
    const entries = Array.isArray(value)
      ? value.slice(0, 100).map((item, index) => [String(index), item] as const)
      : Object.entries(value as Record<string, unknown>).slice(0, 100);
    let injectionDetected = false;
    let secretRedactionApplied = false;
    const sanitizedEntries = entries.map(([key, item]) => {
      const sanitized = sanitizeValue(item, depth + 1);
      injectionDetected ||= sanitized.injectionDetected;
      secretRedactionApplied ||= sanitized.secretRedactionApplied;
      return [key, sanitized.value] as const;
    });
    return {
      injectionDetected,
      secretRedactionApplied,
      value: Array.isArray(value)
        ? sanitizedEntries.map(([, item]) => item)
        : Object.fromEntries(sanitizedEntries)
    };
  };
  const sanitized = sanitizeValue(output);

  return {
    effect,
    evidence,
    failureType: null,
    injectionDetected: sanitized.injectionDetected,
    output: sanitized.value,
    projectId: invocation.projectId,
    retryable: false,
    secretRedactionApplied: sanitized.secretRedactionApplied,
    status: "SUCCEEDED",
    tool: invocation.tool,
    trusted: false
  };
}

async function executeGit(
  invocation: ToolInvocation,
  context: ToolExecutionContext,
  command: "diff" | "status",
  args: string[]
) {
  const binding = context.project;
  if (!binding.workspaceRoot || !binding.projectBaseRoot) {
    return denied(invocation, "READ_ONLY", "TOOL_UNAVAILABLE", "Git inspection needs a server-owned project workspace.", "UNAVAILABLE");
  }
  if (!isInside(binding.workspaceRoot, binding.projectBaseRoot)) {
    return denied(invocation, "READ_ONLY", "UNSAFE_PATH", "The project workspace is outside the configured Hassali workspace root.");
  }

  try {
    const result = await execFileAsync("git", args, {
      cwd: binding.workspaceRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_EXTERNAL_DIFF: "",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_PAGER: "cat"
      },
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 512 * 1024
    });
    return sanitizedResult(invocation, "READ_ONLY", result.stdout, `Executed hardened fixed read-only git ${command} inspection.`);
  } catch (error) {
    return denied(
      invocation,
      "READ_ONLY",
      "EXECUTION_ERROR",
      error instanceof Error ? error.message : "Git inspection failed.",
      "FAILED"
    );
  }
}

export async function executeDeferredTool(input: {
  context: ToolExecutionContext;
  invocation: ToolInvocation;
  selection: DeferredToolSelection;
}): Promise<ToolExecutionResult> {
  const { context, invocation, selection } = input;
  const metadata = metadataFor(selection, invocation.tool);
  if (!metadata || metadata.availability === "unavailable") {
    return denied(invocation, metadata?.effect ?? "READ_ONLY", "TOOL_UNAVAILABLE", "The selected tool is not available.", "UNAVAILABLE");
  }
  if (!selection.loadedSchemas.some((schema) => schema.name === invocation.tool)) {
    return denied(invocation, metadata.effect, "TOOL_UNAVAILABLE", "The tool schema was not selected for this task.", "UNAVAILABLE");
  }
  if (context.project.projectId !== invocation.projectId) {
    return denied(invocation, metadata.effect, "PROJECT_MISMATCH", "Tool projectId does not match the selected project.");
  }
  if (context.project[verifiedProjectBinding] !== true) {
    return denied(invocation, metadata.effect, "OWNERSHIP_NOT_VERIFIED", "Project ownership must be verified before tool execution.");
  }
  if (metadata.availability === "permission_required" && !invocation.permissionGranted) {
    return denied(invocation, metadata.effect, "PERMISSION_REQUIRED", "This tool requires an explicit permission grant.");
  }
  if (metadata.effect !== "READ_ONLY" && !invocation.approvalGranted) {
    return denied(invocation, metadata.effect, "APPROVAL_REQUIRED", "Mutating tools require an approved Hassali proposal.");
  }

  if (invocation.tool === "workspace.read_file") {
    const target = safeWorkspacePath(invocation.arguments.path);
    if (!target) return denied(invocation, metadata.effect, "UNSAFE_PATH", "File path is not a safe project-relative path.");
    const content = context.workspace?.fileContents?.[target] ??
      (context.workspace?.activePath === target ? context.workspace.activeFileContent : undefined);
    if (typeof content !== "string") {
      return denied(invocation, metadata.effect, "INVALID_ARGUMENTS", "The requested file is not present in selected workspace context.", "FAILED");
    }
    return sanitizedResult(invocation, metadata.effect, { content, path: target }, "Read one file from selected project context.");
  }

  if (invocation.tool === "workspace.search_files") {
    const query = typeof invocation.arguments.query === "string" ? invocation.arguments.query.trim() : "";
    if (!query || query.length > 160) {
      return denied(invocation, metadata.effect, "INVALID_ARGUMENTS", "Search query must contain 1-160 characters.");
    }
    const matches = Object.entries(context.workspace?.fileContents ?? {})
      .filter(([filePath]) => Boolean(safeWorkspacePath(filePath)))
      .flatMap(([filePath, content]) =>
        content.split(/\r?\n/).flatMap((line, index) =>
          line.toLowerCase().includes(query.toLowerCase())
            ? [{ line: index + 1, path: filePath, text: line.slice(0, 240) }]
            : []
        )
      )
      .slice(0, 50);
    return sanitizedResult(invocation, metadata.effect, { matches, query }, `Searched ${Object.keys(context.workspace?.fileContents ?? {}).length} selected project file(s).`);
  }

  if (invocation.tool === "git.status") {
    return executeGit(invocation, context, "status", [
      "-c",
      "core.fsmonitor=false",
      "status",
      "--short",
      "--untracked-files=all",
      "--no-ahead-behind"
    ]);
  }

  if (invocation.tool === "git.diff") {
    return executeGit(invocation, context, "diff", [
      "-c",
      "core.fsmonitor=false",
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--"
    ]);
  }

  if (invocation.tool === "browser.inspect") {
    if (!context.browserAdapter) {
      return denied(invocation, metadata.effect, "TOOL_UNAVAILABLE", "No browser adapter is available for this execution.", "UNAVAILABLE");
    }
    const url = typeof invocation.arguments.url === "string" ? invocation.arguments.url : "";
    if (!/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(url)) {
      return denied(invocation, metadata.effect, "INVALID_ARGUMENTS", "Browser inspection is limited to explicit local application URLs in I2.");
    }
    const result = await context.browserAdapter.runStep("inspect_initial", {
      reloadRequired: false,
      steps: ["inspect_initial"],
      target: { kind: "browser", url },
      viewports: [{ height: 900, name: "desktop", width: 1440 }]
    });
    return sanitizedResult(invocation, metadata.effect, result, "Inspected a local application through the configured browser adapter.");
  }

  return denied(invocation, metadata.effect, "TOOL_UNAVAILABLE", "No controlled executor is registered for this tool.", "UNAVAILABLE");
}
