import type {
  ExecutablePreviewBlockedReason,
  ExecutablePreviewFramework,
  ExecutablePreviewPolicy,
  ExecutablePreviewStatus
} from "@/lib/server/preview/executable-preview-types";

function blockedReason(
  code: ExecutablePreviewBlockedReason["code"],
  message: string,
  severity: ExecutablePreviewBlockedReason["severity"] = "medium"
): ExecutablePreviewBlockedReason {
  return {
    code,
    message,
    severity
  };
}

export function executablePreviewStatusFor(
  framework: ExecutablePreviewFramework
): ExecutablePreviewStatus {
  if (framework === "static_html") return "static_ready";
  if (framework === "unknown") return "unsupported";

  return "blocked_until_explicit_enablement";
}

export function buildExecutablePreviewPolicy(
  framework: ExecutablePreviewFramework
): ExecutablePreviewPolicy {
  const status = executablePreviewStatusFor(framework);

  return {
    allowArbitraryShell: false,
    allowDevServerStart: false,
    allowExternalNetwork: false,
    allowPackageInstall: false,
    allowStaticHtml: framework === "static_html",
    status
  };
}

export function blockedReasonsForExecutablePreview(
  framework: ExecutablePreviewFramework
): ExecutablePreviewBlockedReason[] {
  if (framework === "static_html") {
    return [];
  }

  if (framework === "unknown") {
    return [
      blockedReason(
        "unknown_framework",
        "Hassali could not identify a safe executable preview framework from the generated files."
      )
    ];
  }

  return [
    blockedReason("package_install_blocked", "Package installation is blocked in this phase."),
    blockedReason("dev_server_blocked", "Dev server startup is blocked until explicit safe enablement."),
    blockedReason("arbitrary_shell_blocked", "Arbitrary shell execution is not allowed for previews."),
    blockedReason("external_network_blocked", "External network access is blocked for executable previews.")
  ];
}
