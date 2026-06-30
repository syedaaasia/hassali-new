import type {
  DevServerBlockedReason,
  DevServerFramework,
  DevServerPolicy,
  DevServerRuntimeStatus
} from "@/lib/server/runtime/dev-server-runtime-types";

function blockedReason(
  code: DevServerBlockedReason["code"],
  message: string,
  severity: DevServerBlockedReason["severity"] = "medium"
): DevServerBlockedReason {
  return {
    code,
    message,
    severity
  };
}

export function statusForDevServer(framework: DevServerFramework): DevServerRuntimeStatus {
  if (framework === "static_html") return "static_preview_available";
  if (framework === "unknown") return "unsupported";

  return "blocked_until_explicit_enablement";
}

export function buildDevServerPolicy(framework: DevServerFramework): DevServerPolicy {
  return {
    allowExecution: false,
    allowPackageInstall: false,
    allowProcessSpawn: false,
    allowStaticIframePreview: framework === "static_html",
    status: statusForDevServer(framework)
  };
}

export function blockedReasonsForDevServer(framework: DevServerFramework): DevServerBlockedReason[] {
  if (framework === "static_html") {
    return [
      blockedReason(
        "dev_server_execution_disabled",
        "Static HTML can use Hassali's existing iframe preview; no dev server is started.",
        "info"
      )
    ];
  }

  if (framework === "python_streamlit") {
    return [
      blockedReason("dev_server_execution_disabled", "Python app preview is summary-only. Hassali did not install packages or start Streamlit."),
      blockedReason("process_spawn_blocked", "Process spawning is blocked for Python previews."),
      blockedReason("package_install_blocked", "Package installation is blocked for Python previews.")
    ];
  }

  if (framework === "unknown") {
    return [
      blockedReason(
        "framework_not_supported",
        "Hassali could not identify a supported dev server runtime for these files."
      )
    ];
  }

  return [
    blockedReason("dev_server_execution_disabled", "Dev server execution is disabled in this phase."),
    blockedReason("process_spawn_blocked", "Process spawning is blocked for dev server previews."),
    blockedReason("package_install_blocked", "Package installation is blocked for dev server previews.")
  ];
}
