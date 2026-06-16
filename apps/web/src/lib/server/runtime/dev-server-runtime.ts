import {
  frameworkDisplayName,
  registryEntryFor
} from "@/lib/server/runtime/dev-server-registry";
import { detectDevServerRuntime } from "@/lib/server/runtime/dev-server-detector";
import {
  blockedReasonsForDevServer,
  buildDevServerPolicy
} from "@/lib/server/runtime/dev-server-policy";
import type {
  DevServerDetectionInput,
  DevServerRuntimeResult
} from "@/lib/server/runtime/dev-server-runtime-types";

export function buildDevServerRuntime(input: DevServerDetectionInput): DevServerRuntimeResult {
  const detection = detectDevServerRuntime(input);
  const policy = buildDevServerPolicy(detection.framework);
  const entry = registryEntryFor(detection.framework);
  const blockedReasons = blockedReasonsForDevServer(detection.framework);
  const port = entry?.port ?? null;
  const startCommand = entry?.startCommand ?? null;
  const previewUrl = port ? `http://localhost:${port}` : null;
  const plannedCommand = startCommand
    ? `${startCommand}${port ? ` -- planned port ${port}` : ""}`
    : null;

  return {
    blockedReason: blockedReasons[0] ?? null,
    blockedReasons,
    canRun: false,
    capabilities: [
      "framework_detection",
      "planned_command_metadata",
      "port_metadata",
      "preview_url_metadata",
      ...(detection.framework === "static_html" ? ["static_iframe_preview" as const] : [])
    ],
    confidence: detection.confidence,
    framework: detection.framework,
    frameworkDisplayName: frameworkDisplayName(detection.framework),
    plannedCommand,
    port,
    previewUrl,
    runtimeStatus: policy.status,
    signals: detection.signals,
    startCommand,
    warnings: [
      policy.allowStaticIframePreview
        ? "Static HTML preview uses the existing iframe path; Hassali did not start a server."
        : "Dev server runtime is planning-only; Hassali did not start a server or install packages."
    ],
    workingDirectory: "."
  };
}
