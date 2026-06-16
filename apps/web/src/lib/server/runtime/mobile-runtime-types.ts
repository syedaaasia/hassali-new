import type { MobilePreviewRuntimeResult } from "@/lib/server/preview/mobile-preview-types";

export type MobileRuntimeStatus = "blocked" | "candidate" | "metadata_only";

export type MobileRuntimeFramework =
  | "android_xml"
  | "expo"
  | "flutter"
  | "jetpack_compose"
  | "react_native"
  | "unknown";

export type MobileRuntimeRecord = {
  candidateCommands: string[];
  capabilities: string[];
  deviceType: string;
  error: string | null;
  framework: MobileRuntimeFramework;
  navigation: string[];
  previewUrl: null;
  projectId: string;
  runtimeId: string;
  screens: string[];
  status: MobileRuntimeStatus;
  workspaceRoot: string;
};

export type MobileRuntimeOperationResult = MobileRuntimeRecord & {
  logs: string[];
};

export type MobileRuntimeStartInput = {
  mobilePreview: MobilePreviewRuntimeResult;
  productMode: "ASK" | "CODE" | "WEBSITE";
  projectId: string;
  workerType: string | null;
  workspaceRoot: string;
};
