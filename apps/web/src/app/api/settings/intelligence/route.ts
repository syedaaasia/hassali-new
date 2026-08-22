import { auth } from "@clerk/nextjs/server";
import { isConfigurableIntelligenceSourceId } from "@/lib/intelligence-sources";
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
import { intelligenceSettingsErrorResponse } from "@/lib/server/intelligence/intelligence-settings-http";
import {
  boundedJsonFailure,
  productionRequestLimits,
  readBoundedJson
} from "@/lib/server/production-hardening/request-guard";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function handledSettingsError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message }, ok: false }, {
    headers: { "Cache-Control": "no-store" },
    status
  });
}

async function withSettingsApiErrors(
  action: "load" | "mutation",
  operation: () => Promise<Response>
) {
  try {
    return await operation();
  } catch (error) {
    return intelligenceSettingsErrorResponse(error, action);
  }
}

export async function GET() {
  return withSettingsApiErrors("load", async () => {
    const { userId } = await auth();
    if (!userId) return handledSettingsError("UNAUTHORIZED", "Unauthorized", 401);
    return Response.json(await listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  });
}

export async function PUT(request: Request) {
  return withSettingsApiErrors("mutation", async () => {
    const { userId } = await auth();
    if (!userId) return handledSettingsError("UNAUTHORIZED", "Unauthorized", 401);
    if (!sameOrigin(request)) return handledSettingsError("INVALID_ORIGIN", "Invalid request origin.", 403);
    const parsedBody = await readBoundedJson<Record<string, unknown>>(
      request,
      productionRequestLimits.settingsJsonBytes
    );
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;
    if (!isConfigurableIntelligenceSourceId(body?.sourceId)) {
      return handledSettingsError("UNKNOWN_SOURCE", "Unknown intelligence source.", 400);
    }
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
  });
}

export async function PATCH(request: Request) {
  return withSettingsApiErrors("mutation", async () => {
    const { userId } = await auth();
    if (!userId) return handledSettingsError("UNAUTHORIZED", "Unauthorized", 401);
    if (!sameOrigin(request)) return handledSettingsError("INVALID_ORIGIN", "Invalid request origin.", 403);
    const parsedBody = await readBoundedJson<Record<string, unknown>>(
      request,
      productionRequestLimits.settingsJsonBytes
    );
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;
    if (isIntelligenceRoutingPrivacy(body?.privacy)) {
      await setIntelligenceRoutingPrivacy(userId, body.privacy);
    } else {
      const budget = body?.budget && typeof body.budget === "object"
        ? body.budget as Record<string, unknown>
        : null;
      if (!budget || !isIntelligenceBudgetMode(budget.mode)) {
        return handledSettingsError("UNKNOWN_PREFERENCE", "Unknown intelligence preference.", 400);
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
  });
}

export async function POST(request: Request) {
  return withSettingsApiErrors("mutation", async () => {
    const { userId } = await auth();
    if (!userId) return handledSettingsError("UNAUTHORIZED", "Unauthorized", 401);
    if (!sameOrigin(request)) return handledSettingsError("INVALID_ORIGIN", "Invalid request origin.", 403);
    const parsedBody = await readBoundedJson<Record<string, unknown>>(
      request,
      productionRequestLimits.settingsJsonBytes
    );
    if (!parsedBody.ok) return boundedJsonFailure(parsedBody);
    const body = parsedBody.value;
    if (!isConfigurableIntelligenceSourceId(body?.sourceId) || body.action !== "test") {
      return handledSettingsError("INVALID_TEST_REQUEST", "Invalid connection test request.", 400);
    }
    await testIntelligenceSourceConnection(userId, body.sourceId);
    return Response.json(await listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  });
}

export async function DELETE(request: Request) {
  return withSettingsApiErrors("mutation", async () => {
    const { userId } = await auth();
    if (!userId) return handledSettingsError("UNAUTHORIZED", "Unauthorized", 401);
    if (!sameOrigin(request)) return handledSettingsError("INVALID_ORIGIN", "Invalid request origin.", 403);
    const sourceId = new URL(request.url).searchParams.get("sourceId");
    if (!isConfigurableIntelligenceSourceId(sourceId)) {
      return handledSettingsError("UNKNOWN_SOURCE", "Unknown intelligence source.", 400);
    }
    await disconnectIntelligenceSource(userId, sourceId);
    return Response.json(await listIntelligenceSources(userId), {
      headers: { "Cache-Control": "no-store" }
    });
  });
}
