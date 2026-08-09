import { auth } from "@clerk/nextjs/server";
import { isConfigurableIntelligenceSourceId } from "@/lib/intelligence-sources";
import {
  configureIntelligenceSource,
  disconnectIntelligenceSource,
  listIntelligenceSources,
  testIntelligenceSourceConnection
} from "@/lib/server/intelligence/intelligence-source-service";
import { IntelligenceContractError } from "@/lib/server/intelligence/intelligence-contract";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function safeConfigurationError(error: unknown) {
  if (error instanceof IntelligenceContractError) return error.message;
  if (!(error instanceof Error)) return "The provider connection could not be configured.";
  const messages: Record<string, string> = {
    API_KEY_REQUIRED: "Enter an OpenRouter API key before saving this connection.",
    API_KEY_TOO_LONG: "The API key is longer than Hassali accepts.",
    MODEL_ID_TOO_LONG: "The selected model ID is too long.",
    SOURCE_NOT_CONFIGURED: "Configure this provider before testing it."
  };
  return messages[error.message] ?? "The provider connection could not be configured.";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(listIntelligenceSources(userId), {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isConfigurableIntelligenceSourceId(body?.sourceId)) {
    return Response.json({ error: "Unknown intelligence source." }, { status: 400 });
  }
  try {
    configureIntelligenceSource({
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : undefined,
      defaultModel: typeof body?.defaultModel === "string" ? body.defaultModel : null,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      endpointUrl: typeof body?.endpointUrl === "string" ? body.endpointUrl : null,
      sourceId: body.sourceId,
      userId
    });
    return Response.json(listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: safeConfigurationError(error) }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isConfigurableIntelligenceSourceId(body?.sourceId) || body.action !== "test") {
    return Response.json({ error: "Invalid connection test request." }, { status: 400 });
  }
  try {
    await testIntelligenceSourceConnection(userId, body.sourceId);
    return Response.json(listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: safeConfigurationError(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const sourceId = new URL(request.url).searchParams.get("sourceId");
  if (!isConfigurableIntelligenceSourceId(sourceId)) {
    return Response.json({ error: "Unknown intelligence source." }, { status: 400 });
  }
  disconnectIntelligenceSource(userId, sourceId);
  return Response.json(listIntelligenceSources(userId), {
    headers: { "Cache-Control": "no-store" }
  });
}
