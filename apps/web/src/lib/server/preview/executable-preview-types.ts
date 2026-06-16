export type ExecutablePreviewFramework =
  | "next_app"
  | "node_api"
  | "react_component"
  | "react_vite"
  | "static_html"
  | "unknown";

export type ExecutablePreviewStatus =
  | "blocked_until_explicit_enablement"
  | "planning_only"
  | "static_ready"
  | "unsupported";

export type ExecutablePreviewCapability =
  | "command_plan_metadata"
  | "framework_detection"
  | "no_execution"
  | "static_iframe"
  | "safe_enablement_required";

export type ExecutablePreviewBlockedReason = {
  code:
    | "arbitrary_shell_blocked"
    | "dev_server_blocked"
    | "external_network_blocked"
    | "package_install_blocked"
    | "unknown_framework"
    | "unknown_scripts_blocked";
  message: string;
  severity: "info" | "medium";
};

export type ExecutablePreviewCommandPlan = {
  defaultPort: number | null;
  devCommand: "npm run dev" | null;
  installCommand: null;
  renderMode: "dev_server_metadata" | "none" | "static_iframe";
  status: ExecutablePreviewStatus;
};

export type ExecutablePreviewPolicy = {
  allowArbitraryShell: false;
  allowDevServerStart: false;
  allowExternalNetwork: false;
  allowPackageInstall: false;
  allowStaticHtml: boolean;
  status: ExecutablePreviewStatus;
};

export type ExecutablePreviewRuntimeResult = {
  blockedReasons: ExecutablePreviewBlockedReason[];
  canExecuteNow: boolean;
  capabilities: ExecutablePreviewCapability[];
  commandPlan: ExecutablePreviewCommandPlan;
  confidence: number;
  executablePreviewStatus: ExecutablePreviewStatus;
  framework: ExecutablePreviewFramework;
  renderUrl?: null;
  signals: string[];
  warnings: string[];
};

export type ExecutablePreviewDetectionInput = {
  generatedFiles?: Record<string, string>;
  proposalFiles?: Record<string, string>;
};

export type ExecutablePreviewDetection = {
  confidence: number;
  framework: ExecutablePreviewFramework;
  signals: string[];
};
