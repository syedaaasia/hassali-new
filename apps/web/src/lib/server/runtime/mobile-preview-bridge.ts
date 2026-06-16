import type { MobileRuntimeOperationResult } from "@/lib/server/runtime/mobile-runtime-types";

export function mobileRuntimeToPreviewBridge(result: MobileRuntimeOperationResult) {
  return {
    deviceType: result.deviceType,
    framework: result.framework,
    navigation: result.navigation,
    previewUrl: result.previewUrl,
    runtimeId: result.runtimeId,
    runtimeStatus: result.status,
    screens: result.screens
  };
}
