export type ProductReadinessStatus = "degraded" | "healthy" | "unavailable";

export type ProductReadinessComponent = {
  code: "CHECK_FAILED" | "CONFIG_MISSING" | "NOT_CONFIGURED" | "READY";
  id: "app" | "artifacts" | "authentication" | "core_intelligence" | "local_intelligence" | "persistence";
  required: boolean;
  status: ProductReadinessStatus;
};

export type ProductReadiness = {
  checkedAt: string;
  components: ProductReadinessComponent[];
  status: ProductReadinessStatus;
  version: 1;
};

function configured(environment: Record<string, string | undefined>, key: string) {
  return Boolean(environment[key]?.trim());
}

export async function evaluateProductReadiness(input: {
  checkedAt?: Date;
  environment: Record<string, string | undefined>;
  persistenceProbe?: () => Promise<boolean>;
}): Promise<ProductReadiness> {
  const authConfigured = configured(input.environment, "CLERK_SECRET_KEY") && configured(input.environment, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const databaseConfigured = configured(input.environment, "DATABASE_URL");
  let persistenceReady = databaseConfigured;
  if (databaseConfigured && input.persistenceProbe) {
    persistenceReady = await input.persistenceProbe().catch(() => false);
  }
  const cloudConfigured = configured(input.environment, "OPENROUTER_API_KEY");
  const localConfigured = configured(input.environment, "OLLAMA_BASE_URL") || configured(input.environment, "LM_STUDIO_BASE_URL");
  const components: ProductReadinessComponent[] = [
    { code: "READY", id: "app", required: true, status: "healthy" },
    { code: authConfigured ? "READY" : "CONFIG_MISSING", id: "authentication", required: true, status: authConfigured ? "healthy" : "unavailable" },
    { code: !databaseConfigured ? "CONFIG_MISSING" : persistenceReady ? "READY" : "CHECK_FAILED", id: "persistence", required: true, status: persistenceReady ? "healthy" : "unavailable" },
    { code: cloudConfigured ? "READY" : "NOT_CONFIGURED", id: "core_intelligence", required: false, status: cloudConfigured ? "healthy" : "degraded" },
    { code: localConfigured ? "READY" : "NOT_CONFIGURED", id: "local_intelligence", required: false, status: localConfigured ? "healthy" : "degraded" },
    { code: "READY", id: "artifacts", required: false, status: "healthy" }
  ];
  const status = components.some((component) => component.required && component.status === "unavailable")
    ? "unavailable"
    : components.some((component) => component.status !== "healthy") ? "degraded" : "healthy";
  return { checkedAt: (input.checkedAt ?? new Date()).toISOString(), components, status, version: 1 };
}
