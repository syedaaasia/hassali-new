import { detectExecutablePreviewFramework } from "@/lib/server/preview/executable-preview-detector";
import {
  blockedReasonsForExecutablePreview,
  buildExecutablePreviewPolicy
} from "@/lib/server/preview/executable-preview-policy";
import { buildDevServerRuntime } from "@/lib/server/runtime/dev-server-runtime";
import type {
  ExecutablePreviewCommandPlan,
  ExecutablePreviewDetectionInput,
  ExecutablePreviewFramework,
  ExecutablePreviewRuntimeResult
} from "@/lib/server/preview/executable-preview-types";

function commandPlanFor(framework: ExecutablePreviewFramework): ExecutablePreviewCommandPlan {
  if (framework === "static_html" || framework === "html") {
    return {
      defaultPort: null,
      devCommand: null,
      installCommand: null,
      renderMode: "static_iframe",
      status: "static_ready"
    };
  }

  if (framework === "react_vite" || framework === "vite") {
    return {
      defaultPort: 5173,
      devCommand: "npm run dev",
      installCommand: null,
      renderMode: "dev_server_metadata",
      status: "blocked_until_explicit_enablement"
    };
  }

  if (framework === "next_app" || framework === "next") {
    return {
      defaultPort: 3000,
      devCommand: "npm run dev",
      installCommand: null,
      renderMode: "dev_server_metadata",
      status: "blocked_until_explicit_enablement"
    };
  }

  if (framework === "nuxt" || framework === "remix") {
    return {
      defaultPort: 3000,
      devCommand: "npm run dev",
      installCommand: null,
      renderMode: "dev_server_metadata",
      status: "blocked_until_explicit_enablement"
    };
  }

  if (framework === "astro") {
    return {
      defaultPort: 4321,
      devCommand: "npm run dev",
      installCommand: null,
      renderMode: "dev_server_metadata",
      status: "blocked_until_explicit_enablement"
    };
  }

  if (
    framework === "angular" ||
    framework === "svelte" ||
    framework === "sveltekit" ||
    framework === "vue"
  ) {
    return {
      defaultPort: framework === "angular" ? 4200 : 5173,
      devCommand: "npm run dev",
      installCommand: null,
      renderMode: "dev_server_metadata",
      status: "blocked_until_explicit_enablement"
    };
  }

  if (framework === "python_streamlit") {
    return {
      defaultPort: null,
      devCommand: null,
      installCommand: null,
      renderMode: "none",
      status: "blocked_until_explicit_enablement"
    };
  }

  return {
    defaultPort: null,
    devCommand: framework === "unknown" ? null : "npm run dev",
    installCommand: null,
    renderMode: framework === "unknown" ? "none" : "dev_server_metadata",
    status: framework === "unknown" ? "unsupported" : "blocked_until_explicit_enablement"
  };
}

export function buildExecutablePreviewRuntime(
  input: ExecutablePreviewDetectionInput
): ExecutablePreviewRuntimeResult {
  const detection = detectExecutablePreviewFramework(input);
  const policy = buildExecutablePreviewPolicy(detection.framework);
  const commandPlan = commandPlanFor(detection.framework);
  const devServerRuntime = buildDevServerRuntime(input);
  const blockedReasons = blockedReasonsForExecutablePreview(detection.framework);
  const canExecuteNow =
    (detection.framework === "static_html" || detection.framework === "html") &&
    policy.allowStaticHtml;
  const capabilities: ExecutablePreviewRuntimeResult["capabilities"] = [
    "framework_detection",
    "command_plan_metadata",
    "no_execution",
    ...(canExecuteNow ? ["static_iframe" as const] : ["safe_enablement_required" as const])
  ];

  return {
    blockedReasons,
    canExecuteNow,
    capabilities,
    commandPlan,
    confidence: detection.confidence,
    devServerRuntime,
    executablePreviewStatus: policy.status,
    framework: detection.framework,
    frameworkMatch: detection.frameworkMatch,
    renderUrl: null,
    signals: detection.signals,
    warnings: canExecuteNow
      ? ["Static HTML can use the existing iframe preview path."]
      : ["Executable preview is planning-only; Hassali did not run installs, scripts, or dev servers."]
  };
}
