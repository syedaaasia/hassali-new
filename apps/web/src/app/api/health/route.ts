import { probeDatabaseConnection } from "@hassali/database";
import { evaluateProductReadiness } from "@/lib/server/production-hardening/product-readiness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const readiness = await evaluateProductReadiness({
    environment: process.env,
    persistenceProbe: async () => {
      await probeDatabaseConnection();
      return true;
    }
  });
  return Response.json(readiness, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    status: readiness.status === "unavailable" ? 503 : 200
  });
}
