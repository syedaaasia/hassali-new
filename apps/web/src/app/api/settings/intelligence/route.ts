import { auth } from "@clerk/nextjs/server";
import { isConfigurableIntelligenceSourceId } from "@/lib/intelligence-sources";
import { getCurrentDatabaseUser } from "@/lib/server/clerk-database-user";
import {
  configureIntelligenceSource,
  disconnectIntelligenceSource,
  isIntelligenceBudgetMode,
  isIntelligenceRoutingPrivacy,
  listIntelligenceSources,
  setIntelligenceBudgetPolicy,
  setIntelligenceRoutingPrivacy,
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
    BUDGET_LIMIT_INVALID: "Budget limits must be valid non-negative USD amounts.",
    SOURCE_NOT_CONFIGURED: "Configure this provider before testing it."
  };
  return messages[error.message] ?? "The provider connection could not be configured.";
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await getCurrentDatabaseUser();
  return Response.json(await listIntelligenceSources(userId), {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  await getCurrentDatabaseUser();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isConfigurableIntelligenceSourceId(body?.sourceId)) {
    return Response.json({ error: "Unknown intelligence source." }, { status: 400 });
  }
  try {
    await configureIntelligenceSource({
      apiKey: typeof body?.apiKey === "string" ? body.apiKey : undefined,
      defaultModel: typeof body?.defaultModel === "string" ? body.defaultModel : null,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      endpointUrl: typeof body?.endpointUrl === "string" ? body.endpointUrl : null,
      sourceId: body.sourceId,
      userId
    });
    return Response.json(await listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json({ error: safeConfigurationError(error) }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  await getCurrentDatabaseUser();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  try {
    if (isIntelligenceRoutingPrivacy(body?.privacy)) {
      await setIntelligenceRoutingPrivacy(userId, body.privacy);
    } else {
      const budget = body?.budget && typeof body.budget === "object"
        ? body.budget as Record<string, unknown>
        : null;
      if (!budget || !isIntelligenceBudgetMode(budget.mode)) {
        return Response.json({ error: "Unknown intelligence preference." }, { status: 400 });
      }
      await setIntelligenceBudgetPolicy({
        byokMonthlyWarningLimitUsd: budget.byokMonthlyWarningLimitUsd,
        managedMonthlyLimitUsd: budget.managedMonthlyLimitUsd,
        managedPerRequestLimitUsd: budget.managedPerRequestLimitUsd,
        mode: budget.mode,
        userId
      });
    }
    return Response.json(await listIntelligenceSources(userId), {
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
  await getCurrentDatabaseUser();
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!isConfigurableIntelligenceSourceId(body?.sourceId) || body.action !== "test") {
    return Response.json({ error: "Invalid connection test request." }, { status: 400 });
  }
  try {
    await testIntelligenceSourceConnection(userId, body.sourceId);
    return Response.json(await listIntelligenceSources(userId), {
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
  await getCurrentDatabaseUser();
  const sourceId = new URL(request.url).searchParams.get("sourceId");
  if (!isConfigurableIntelligenceSourceId(sourceId)) {
    return Response.json({ error: "Unknown intelligence source." }, { status: 400 });
  }
  await disconnectIntelligenceSource(userId, sourceId);
  return Response.json(await listIntelligenceSources(userId), {
    headers: { "Cache-Control": "no-store" }
  });
}
