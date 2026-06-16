import { recordRuntimeStreamEvent } from "@/lib/server/runtime/runtime-event-buffer";
import { isServerOwnedProjectWorkspaceRoot } from "@/lib/server/runtime/workspace-binding";
import { startRuntime } from "@/lib/server/runtime/mobile-process-registry";
import type {
  MobileRuntimeFramework,
  MobileRuntimeOperationResult,
  MobileRuntimeStartInput,
  MobileRuntimeStatus
} from "@/lib/server/runtime/mobile-runtime-types";

function normalizeFramework(value: string): MobileRuntimeFramework {
  if (
    value === "android_xml" ||
    value === "expo" ||
    value === "flutter" ||
    value === "jetpack_compose" ||
    value === "react_native"
  ) {
    return value;
  }

  return "unknown";
}

function candidateCommands(framework: MobileRuntimeFramework) {
  if (framework === "expo") return ["npm run start", "npx expo start"];
  if (framework === "react_native") return ["npm run start"];
  if (framework === "flutter") return ["flutter run"];
  if (framework === "android_xml" || framework === "jetpack_compose") return ["Android Studio / Gradle run"];

  return [];
}

function statusFor(framework: MobileRuntimeFramework): MobileRuntimeStatus {
  return framework === "expo" ? "candidate" : "metadata_only";
}

export async function buildMobileRuntimeCandidate(
  input: MobileRuntimeStartInput
): Promise<MobileRuntimeOperationResult> {
  const reasons: string[] = [];

  if (input.productMode !== "CODE") {
    reasons.push("Mobile runtime candidates are only enabled for CODE mode.");
  }

  if (input.workerType !== "local") {
    reasons.push("Mobile runtime candidates require the local approved runner.");
  }

  if (!(await isServerOwnedProjectWorkspaceRoot(input.workspaceRoot))) {
    reasons.push("Mobile runtime workspace must be server-owned.");
  }

  const framework = normalizeFramework(input.mobilePreview.framework);
  const runtimeId = `mobile-runtime-${Date.now()}`;
  const blocked = framework === "unknown" || reasons.length > 0;
  const status: MobileRuntimeStatus = blocked ? "blocked" : statusFor(framework);
  const error = reasons[0] ?? (framework === "unknown" ? "No supported mobile runtime framework detected." : null);

  recordRuntimeStreamEvent({
    error,
    framework: "mobile",
    message: error ?? `Mobile runtime candidate recorded for ${framework}.`,
    projectId: input.projectId,
    runtimeId,
    status: blocked ? "blocked" : "stopped",
    stream: "system",
    type: blocked ? "error" : "status"
  });

  return startRuntime({
    candidateCommands: candidateCommands(framework),
    capabilities: input.mobilePreview.capabilities,
    deviceType: input.mobilePreview.deviceType,
    error,
    framework,
    navigation: input.mobilePreview.navigation,
    previewUrl: null,
    projectId: input.projectId,
    runtimeId,
    screens: input.mobilePreview.screens,
    status,
    workspaceRoot: input.workspaceRoot
  });
}
