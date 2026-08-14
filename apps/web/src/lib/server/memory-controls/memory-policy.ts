import type { PersistedMemoryPreferences } from "@hassali/database";

export type MemoryAccessPolicy = {
  conversationRead: boolean;
  conversationWrite: boolean;
  projectRead: boolean;
  projectWrite: boolean;
  state: "active" | "off" | "paused";
  userAutomaticWrite: boolean;
  userExplicitWrite: boolean;
  userRead: boolean;
  userSensitiveExplicitWrite: boolean;
};

export function buildMemoryAccessPolicy(
  preferences: PersistedMemoryPreferences
): MemoryAccessPolicy {
  const active = preferences.memoryEnabled && !preferences.paused;
  return {
    conversationRead: active && preferences.conversationMemoryEnabled,
    conversationWrite: active && preferences.conversationMemoryEnabled,
    projectRead: active && preferences.projectMemoryEnabled,
    projectWrite: active && preferences.projectMemoryEnabled,
    state: !preferences.memoryEnabled ? "off" : preferences.paused ? "paused" : "active",
    userAutomaticWrite:
      active && preferences.userMemoryEnabled && preferences.automaticMemoryEnabled,
    userExplicitWrite: active && preferences.userMemoryEnabled,
    userRead: active && preferences.userMemoryEnabled,
    userSensitiveExplicitWrite:
      active && preferences.userMemoryEnabled && preferences.sensitiveMemoryAllowed
  };
}

export function disabledMemoryMessage(
  state: MemoryAccessPolicy["state"],
  action: "recall" | "save"
) {
  if (state === "paused") {
    return action === "save"
      ? "Memory is paused, so I won't save that for future chats. Resume Memory in Settings to save it."
      : "Memory is paused, so I'm not using saved personal or project memory. You can still review or delete it in Settings.";
  }
  if (state === "active") {
    return action === "save"
      ? "Personal Memory is disabled, so I won't save that for future chats. You can review your Memory settings at any time."
      : "Personal Memory is disabled, so I'm not using saved personal details for this request.";
  }
  return action === "save"
    ? "Memory is off, so I won't save that for future chats. You can turn Memory on in Settings."
    : "Memory is off, so I'm not using saved personal or project memory. You can still review, export, or delete it in Settings.";
}
