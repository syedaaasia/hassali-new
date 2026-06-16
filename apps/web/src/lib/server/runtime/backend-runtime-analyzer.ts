import type {
  BackendArchitectureStyle,
  BackendFrameworkMatch,
  BackendRuntimeAnalysis
} from "@/lib/server/runtime/backend-runtime-types";

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function allText(files: Record<string, string>) {
  return Object.values(files).join("\n").slice(0, 300_000);
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 18);
}

function pathsMatching(files: Record<string, string>, pattern: RegExp) {
  return unique(Object.keys(files).filter((filePath) => pattern.test(normalizePath(filePath))));
}

function terms(text: string, candidates: string[]) {
  const lower = text.toLowerCase();

  return unique(candidates.filter((candidate) => lower.includes(candidate.toLowerCase())));
}

function endpointMatches(text: string) {
  const patterns = [
    /\b(?:app|router|fastify)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/gi,
    /@(Get|Post|Put|Patch|Delete|HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete)(?:Mapping)?\(["'`]?([^"'`)]*)/gi,
    /@(app|router|bp)\.(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/gi,
    /Route::(get|post|put|patch|delete)\(["'`]([^"'`]+)["'`]/gi,
    /\b(?:r|router|app)\.(GET|POST|PUT|PATCH|DELETE)\(["'`]([^"'`]+)["'`]/g
  ];
  const endpoints: string[] = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const method = (match[1] ?? match[2] ?? "ROUTE").replace(/^Http/i, "").toUpperCase();
      const route = match[2] ?? match[3] ?? "/";
      endpoints.push(`${method} ${route || "/"}`);
    }
  }

  return unique(endpoints);
}

function databaseHints(text: string, files: Record<string, string>) {
  return unique([
    ...terms(text, ["postgres", "postgresql", "mysql", "sqlite", "mongodb", "redis", "prisma", "typeorm", "sequelize", "sqlalchemy", "mongoose", "entityframework", "eloquent"]),
    ...pathsMatching(files, /(?:schema|migration|database|prisma|models?)\.(?:prisma|sql|ts|js|py|go|java|cs|php)$/i)
  ]);
}

function architectureStyle(input: {
  controllers: string[];
  repositories: string[];
  routes: string[];
  services: string[];
}): BackendArchitectureStyle {
  if (input.controllers.length && input.services.length && input.repositories.length) {
    return "controller_service_repository";
  }

  if (input.controllers.length && input.services.length) {
    return "service_oriented";
  }

  if (input.controllers.length || input.routes.length) {
    return "rest_api";
  }

  return "unknown";
}

export function analyzeBackendRuntime(input: {
  files: Record<string, string>;
  match: BackendFrameworkMatch;
}): BackendRuntimeAnalysis {
  const text = allText(input.files);
  const routes = unique([
    ...pathsMatching(input.files, /(?:^|\/)(routes|api|controllers?)\/.*\.(?:ts|js|py|go|java|cs|php)$/i),
    ...endpointMatches(text)
  ]);
  const controllers = pathsMatching(input.files, /(?:controller|controllers?)\.(?:ts|js|py|go|java|cs|php)$/i);
  const services = pathsMatching(input.files, /(?:service|services?)\.(?:ts|js|py|go|java|cs|php)$/i);
  const repositories = pathsMatching(input.files, /(?:repository|repositories|repo)\.(?:ts|js|py|go|java|cs|php)$/i);
  const models = pathsMatching(input.files, /(?:model|models|entity|entities)\.(?:ts|js|py|go|java|cs|php)$/i);
  const schemas = pathsMatching(input.files, /(?:schema|schemas|dto|migration|prisma)\.(?:ts|js|py|go|java|cs|php|prisma|sql)$/i);
  const middleware = unique([
    ...pathsMatching(input.files, /(?:middleware|middlewares|guard|guards|interceptor|filter)\.(?:ts|js|py|go|java|cs|php)$/i),
    ...terms(text, ["middleware", "UseAuthentication", "UseAuthorization", "@UseGuards", "Depends("])
  ]);
  const validators = unique([
    ...pathsMatching(input.files, /(?:validator|validators|request|requests|dto)\.(?:ts|js|py|go|java|cs|php)$/i),
    ...terms(text, ["zod", "joi", "pydantic", "class-validator", "FluentValidation", "FormRequest"])
  ]);
  const authentication = terms(text, ["jwt", "passport", "nextauth", "oauth", "session", "bearer", "spring security", "sanctum", "identity"]);
  const authorization = terms(text, ["role", "permission", "policy", "guard", "authorize", "rbac", "claims"]);
  const queues = terms(text, ["bullmq", "queue", "celery", "rq", "sidekiq", "rabbitmq", "sqs", "hangfire", "laravel queue"]);
  const workers = pathsMatching(input.files, /(?:worker|workers|consumer|job|jobs)\.(?:ts|js|py|go|java|cs|php)$/i);
  const cronJobs = unique([
    ...pathsMatching(input.files, /(?:cron|schedule|scheduler|scheduled)\.(?:ts|js|py|go|java|cs|php)$/i),
    ...terms(text, ["cron", "@Scheduled", "schedule:", "APScheduler"])
  ]);
  const events = unique([
    ...pathsMatching(input.files, /(?:event|events|listener|listeners|subscriber)\.(?:ts|js|py|go|java|cs|php)$/i),
    ...terms(text, ["EventEmitter", "@EventPattern", "dispatch(", "emit("])
  ]);
  const webhooks = unique([
    ...routes.filter((route) => route.toLowerCase().includes("webhook")),
    ...terms(text, ["webhook", "stripe.webhooks", "github webhook"])
  ]);
  const databases = databaseHints(text, input.files);
  const style = architectureStyle({ controllers, repositories, routes, services });

  return {
    architectureStyle: style,
    authenticationType: authentication[0] ?? null,
    authorization,
    controllers,
    cronJobs,
    databases,
    databaseCount: databases.length,
    endpointCount: endpointMatches(text).length,
    endpoints: endpointMatches(text),
    events,
    framework: input.match.framework,
    middleware,
    models,
    queues,
    queueType: queues[0] ?? null,
    repositories,
    routeCount: routes.length,
    routes,
    schemas,
    serviceCount: services.length,
    services,
    validators,
    webhooks,
    workers
  };
}
