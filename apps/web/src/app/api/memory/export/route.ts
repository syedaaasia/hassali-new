import { loadOwnedMemorySnapshot } from "@hassali/database";
import { auth } from "@clerk/nextjs/server";
import { buildMemoryExport } from "@/lib/server/memory-controls/memory-export";

const noStoreHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId)
    return Response.json({ error: "Unauthorized" }, { headers: noStoreHeaders, status: 401 });
  try {
    const snapshot = await loadOwnedMemorySnapshot(userId);
    const payload = buildMemoryExport(snapshot);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        ...noStoreHeaders,
        "content-disposition": `attachment; filename="hassali-memory-${new Date().toISOString().slice(0, 10)}.json"`,
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return Response.json(
      { error: "Memory export is unavailable right now." },
      { headers: noStoreHeaders, status: 503 }
    );
  }
}
