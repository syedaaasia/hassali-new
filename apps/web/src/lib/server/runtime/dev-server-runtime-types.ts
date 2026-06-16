export type DevServerFramework =
  | "next_app"
  | "react_vite"
  | "static_html"
  | "unknown";

export type DevServerRuntimeStatus =
  | "blocked_until_explicit_enablement"
  | "planned"
  | "static_preview_available"
  | "unsupported";

export type DevServerCapability =
  | "framework_detection"
  | "planned_command_metadata"
  | "port_metadata"
  | "preview_url_metadata"
  | "static_iframe_preview";

export type DevServerBlockedReason = {
  code:
    | "dev_server_execution_disabled"
    | "framework_not_supported"
    | "package_install_blocked"
    | "process_spawn_blocked";
  message: string;
  severity: "info" | "medium";
};

export type DevServerDetectionInput = {
  generatedFiles?: Record<string, string>;
  proposalFiles?: Record<string, string>;
};

export type DevServerDetection = {
  confidence: number;
  framework: DevServerFramework;
  signals: string[];
};

export type DevServerRegistryEntry = {
  displayName: string;
  framework: DevServerFramework;
  patterns: RegExp[];
  port: number | null;
  startCommand: "npm run dev" | "serve index.html" | null;
  terms: string[];
};

export type DevServerPolicy = {
  allowExecution: false;
  allowPackageInstall: false;
  allowProcessSpawn: false;
  allowStaticIframePreview: boolean;
  status: DevServerRuntimeStatus;
};

export type DevServerRuntimeResult = {
  blockedReason: DevServerBlockedReason | null;
  blockedReasons: DevServerBlockedReason[];
  canRun: boolean;
  capabilities: DevServerCapability[];
  confidence: number;
  framework: DevServerFramework;
  frameworkDisplayName: string;
  plannedCommand: string | null;
  port: number | null;
  previewUrl: string | null;
  runtimeStatus: DevServerRuntimeStatus;
  signals: string[];
  startCommand: string | null;
  warnings: string[];
  workingDirectory: ".";
};
