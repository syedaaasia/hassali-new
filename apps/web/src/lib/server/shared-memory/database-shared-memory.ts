import { loadOwnedMemoryPreferences } from "@hassali/database";
import { createDatabaseProjectMemoryStore } from "@/lib/server/project-memory/database-project-memory-store";
import { handleAskProjectMemory } from "@/lib/server/project-memory/project-memory";
import { createDatabaseUserMemoryStore } from "@/lib/server/user-memory/database-user-memory-store";
import { handleAskUserMemory } from "@/lib/server/user-memory/user-memory";
import {
  buildMemoryContextPolicy,
  buildSharedMemoryContext,
  isExplicitSharedMemoryWrite,
  type MemoryContextCapsule,
  type SharedMemoryMode
} from "./shared-memory";

export async function buildOwnedSharedMemoryContext(input: {
  conversationId?: string | null;
  externalUserId: string;
  mode: SharedMemoryMode;
  projectId: string;
  prompt: string;
  publicResearch?: boolean;
}): Promise<MemoryContextCapsule> {
  let preferences = null;
  try {
    preferences = await loadOwnedMemoryPreferences(input.externalUserId);
  } catch (error) {
    console.error("shared memory preferences unavailable", error instanceof Error ? error.message : "Unknown error");
  }
  return buildSharedMemoryContext({
    conversationId: input.conversationId,
    mode: input.mode,
    preferences,
    projectStore: createDatabaseProjectMemoryStore(input.externalUserId, input.projectId),
    prompt: input.prompt,
    publicResearch: input.publicResearch,
    userStore: createDatabaseUserMemoryStore(input.externalUserId)
  });
}

export async function captureOwnedCrossModeMemory(input: {
  conversationId: string;
  externalUserId: string;
  mode: Exclude<SharedMemoryMode, "ASK">;
  projectId: string;
  prompt: string;
  sourceMessageId?: string | null;
}) {
  let preferences = null;
  try {
    preferences = await loadOwnedMemoryPreferences(input.externalUserId);
  } catch (error) {
    console.error("shared memory capture preferences unavailable", error instanceof Error ? error.message : "Unknown error");
    return { projectSaved: 0, userIntent: "none" };
  }
  const policy = buildMemoryContextPolicy({ mode: input.mode, preferences, prompt: input.prompt });
  const explicit = isExplicitSharedMemoryWrite(input.prompt);
  const userMemory = await handleAskUserMemory({
    policy: {
      allowAutomaticWrite: policy.writeUserAutomatic,
      allowExplicitWrite: policy.writeUserExplicit,
      allowRead: false,
      allowSensitiveExplicitWrite: policy.writeUserSensitiveExplicit
    },
    prompt: input.prompt,
    publicResearch: false,
    sourceMessageId: input.sourceMessageId ?? null,
    store: createDatabaseUserMemoryStore(input.externalUserId)
  });
  const projectMemory = await handleAskProjectMemory({
    allowRead: false,
    allowWrite: policy.writeProject && policy.writeConversation && (policy.automaticCapture || explicit),
    conversationId: input.conversationId,
    prompt: input.prompt,
    sourceMessageId: input.sourceMessageId ?? null,
    store: createDatabaseProjectMemoryStore(input.externalUserId, input.projectId)
  });
  return { projectSaved: projectMemory.saved, userIntent: userMemory.intent };
}
