import {
  forgetOwnedUserMemory,
  listOwnedMemoryPeople,
  listOwnedUserMemories
} from "@hassali/database";
import { auth } from "@clerk/nextjs/server";
import { normalizeMemoryText } from "@/lib/server/user-memory/user-memory";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  try {
    const [memories, people] = await Promise.all([
      listOwnedUserMemories(userId, 100),
      listOwnedMemoryPeople(userId, 80)
    ]);
    return Response.json({ memories, people }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "Durable memory is unavailable right now." },
      { headers: noStoreHeaders, status: 503 }
    );
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  let body: { mode?: unknown; target?: unknown };
  try {
    const parsed: unknown = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as { mode?: unknown; target?: unknown }
      : {};
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { headers: noStoreHeaders, status: 400 });
  }
  const mode = body.mode;
  if (mode !== "all" && mode !== "key" && mode !== "person") {
    return Response.json({ error: "Invalid memory removal mode." }, { headers: noStoreHeaders, status: 400 });
  }
  const target = typeof body.target === "string" ? normalizeMemoryText(body.target).slice(0, 160) : "";
  if (mode !== "all" && !target) {
    return Response.json({ error: "A memory target is required." }, { headers: noStoreHeaders, status: 400 });
  }
  try {
    const removed = await forgetOwnedUserMemory({
      externalUserId: userId,
      mode,
      normalizedTarget: target || undefined
    });
    return Response.json({ removed }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { error: "Durable memory is unavailable right now; nothing was removed." },
      { headers: noStoreHeaders, status: 503 }
    );
  }
}
