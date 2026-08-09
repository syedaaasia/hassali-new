import { auth } from "@clerk/nextjs/server";
import { searchProjectsAndChatsForExternalUser } from "@hassali/database";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
  if (query.length > 120) return Response.json({ error: "Search query is too long." }, { status: 400 });

  try {
    const results = await searchProjectsAndChatsForExternalUser(userId, query);
    return Response.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Project search is temporarily unavailable." },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
