import {
  clearAllOwnedDerivedMemory,
  clearOwnedConversationMemory,
  clearOwnedProjectMemory,
  editOwnedProjectMemory,
  editOwnedUserMemory,
  forgetOwnedPersonById,
  forgetOwnedProjectMemoryById,
  forgetOwnedUserMemoryById,
  loadOwnedMemorySnapshot,
  updateOwnedMemoryPreferences,
  type PersistedMemoryPreferences
} from "@hassali/database";
import { auth } from "@clerk/nextjs/server";
import { containsForbiddenMemorySecret } from "@/lib/server/user-memory/user-memory";

const noStoreHeaders = { "cache-control": "private, no-store" };
const preferenceKeys = [
  "automaticMemoryEnabled",
  "conversationMemoryEnabled",
  "memoryEnabled",
  "paused",
  "projectMemoryEnabled",
  "sensitiveMemoryAllowed",
  "userMemoryEnabled"
] as const;

function responseError(message: string, status: number) {
  return Response.json({ error: message }, { headers: noStoreHeaders, status });
}

async function ownedUser() {
  return (await auth()).userId;
}

async function snapshot(userId: string) {
  return Response.json(await loadOwnedMemorySnapshot(userId), { headers: noStoreHeaders });
}

export async function GET() {
  const userId = await ownedUser();
  if (!userId) return responseError("Unauthorized", 401);
  try {
    return await snapshot(userId);
  } catch {
    return responseError(
      "Memory settings are unavailable right now. Retry without changing your current settings.",
      503
    );
  }
}

export async function PATCH(request: Request) {
  const userId = await ownedUser();
  if (!userId) return responseError("Unauthorized", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return responseError("Invalid JSON body.", 400);
  try {
    if (body.action === "preferences") {
      const raw = body.preferences;
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return responseError("Memory preferences are required.", 400);
      const patch: Partial<Omit<PersistedMemoryPreferences, "updatedAt">> = {};
      for (const key of preferenceKeys) {
        const value = (raw as Record<string, unknown>)[key];
        if (value !== undefined) {
          if (typeof value !== "boolean") return responseError(`Invalid ${key} preference.`, 400);
          patch[key] = value;
        }
      }
      if (!Object.keys(patch).length)
        return responseError("No memory preference changes were supplied.", 400);
      await updateOwnedMemoryPreferences(userId, patch);
      return await snapshot(userId);
    }

    if (body.action === "edit-user" || body.action === "edit-project") {
      const memoryId = typeof body.memoryId === "string" ? body.memoryId : "";
      const value =
        typeof body.value === "string" ? body.value.replace(/\s+/g, " ").trim().slice(0, 500) : "";
      if (!memoryId || !value)
        return responseError("A memory and corrected value are required.", 400);
      if (containsForbiddenMemorySecret(value))
        return responseError(
          "Passwords, keys, tokens, codes, and private credentials cannot be saved in Memory.",
          400
        );
      if (body.action === "edit-user")
        await editOwnedUserMemory({ externalUserId: userId, memoryId, value });
      else await editOwnedProjectMemory({ externalUserId: userId, memoryId, value });
      return await snapshot(userId);
    }
    return responseError("Unsupported memory update action.", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/NOT_FOUND|NOT_OWNED/.test(code))
      return responseError("That memory was not found for this account.", 404);
    return responseError(
      "The memory change could not be completed. Nothing was reported as changed.",
      503
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await ownedUser();
  if (!userId) return responseError("Unauthorized", 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body))
    return responseError("Invalid JSON body.", 400);
  const action = body.action;
  try {
    let removed = 0;
    if (action === "memory") {
      if (typeof body.memoryId !== "string") return responseError("A memory is required.", 400);
      removed = await forgetOwnedUserMemoryById(userId, body.memoryId);
    } else if (action === "project-memory") {
      if (typeof body.memoryId !== "string")
        return responseError("A project memory is required.", 400);
      removed = await forgetOwnedProjectMemoryById(userId, body.memoryId);
    } else if (action === "person") {
      if (typeof body.personId !== "string") return responseError("A person is required.", 400);
      removed = await forgetOwnedPersonById(userId, body.personId);
    } else if (action === "project") {
      if (typeof body.projectId !== "string") return responseError("A project is required.", 400);
      removed = await clearOwnedProjectMemory(userId, body.projectId);
    } else if (action === "conversation") {
      if (typeof body.conversationId !== "string")
        return responseError("A conversation is required.", 400);
      removed = await clearOwnedConversationMemory(userId, body.conversationId);
    } else if (action === "all") {
      if (body.confirmation !== "CLEAR MY MEMORY")
        return responseError("Clear all memory requires confirmation.", 400);
      removed = await clearAllOwnedDerivedMemory(userId);
    } else {
      return responseError("Unsupported memory removal action.", 400);
    }
    return Response.json(
      { removed, snapshot: await loadOwnedMemorySnapshot(userId) },
      { headers: noStoreHeaders }
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (/NOT_FOUND|NOT_OWNED/.test(code))
      return responseError("That memory was not found for this account.", 404);
    return responseError(
      "Memory removal could not be completed. Existing memory remains unchanged where the transaction failed.",
      503
    );
  }
}
