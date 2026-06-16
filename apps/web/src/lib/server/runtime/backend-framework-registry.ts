import type {
  BackendFramework,
  BackendFrameworkMatch,
  BackendRuntimeType
} from "@/lib/server/runtime/backend-runtime-types";

type BackendRegistryEntry = {
  displayName: string;
  framework: BackendFramework;
  patterns: RegExp[];
  runtimeType: BackendRuntimeType;
  terms: string[];
};

function normalizePath(path: string) {
  return path.replace(/\\/g, "/").toLowerCase();
}

function filePaths(files: Record<string, string>) {
  return Object.keys(files).map(normalizePath);
}

function allText(files: Record<string, string>) {
  return Object.entries(files)
    .map(([path, content]) => `${path}\n${content.slice(0, 6000)}`)
    .join("\n")
    .toLowerCase();
}

function score(entry: BackendRegistryEntry, files: Record<string, string>): BackendFrameworkMatch {
  const paths = filePaths(files);
  const text = allText(files);
  const fileSignals = entry.patterns
    .filter((pattern) => paths.some((path) => pattern.test(path)))
    .map((pattern) => `file:${pattern.source}`);
  const termSignals = entry.terms
    .filter((term) => text.includes(term.toLowerCase()))
    .map((term) => `term:${term}`);

  return {
    confidence: Math.min(0.98, fileSignals.length * 0.24 + termSignals.length * 0.16),
    displayName: entry.displayName,
    framework: entry.framework,
    runtimeType: entry.runtimeType,
    signals: [...fileSignals, ...termSignals]
  };
}

const registry: BackendRegistryEntry[] = [
  {
    displayName: "NestJS",
    framework: "nestjs",
    patterns: [/(^|\/)nest-cli\.json$/, /(^|\/)src\/.*\.(?:controller|service|module)\.ts$/],
    runtimeType: "node",
    terms: ["@nestjs/core", "@Controller", "@Injectable", "NestFactory"]
  },
  {
    displayName: "Fastify",
    framework: "fastify",
    patterns: [/(^|\/)(server|app|routes)\/?.*\.(?:js|ts)$/],
    runtimeType: "node",
    terms: ["fastify", "fastify.get", "fastify.post", "register("]
  },
  {
    displayName: "Express",
    framework: "express",
    patterns: [/(^|\/)(server|app|routes|api)\/?.*\.(?:js|ts)$/],
    runtimeType: "node",
    terms: ["express", "app.get(", "router.get(", "express.Router"]
  },
  {
    displayName: "Node.js",
    framework: "node",
    patterns: [/(^|\/)package\.json$/, /\.(?:js|ts)$/],
    runtimeType: "node",
    terms: ["http.createServer", "node:"]
  },
  {
    displayName: "FastAPI",
    framework: "fastapi",
    patterns: [/(^|\/)(main|app|api|routes).*\.py$/, /(^|\/)requirements\.txt$/, /(^|\/)pyproject\.toml$/],
    runtimeType: "python",
    terms: ["fastapi", "APIRouter", "@app.get", "@router.post"]
  },
  {
    displayName: "Django",
    framework: "django",
    patterns: [/(^|\/)manage\.py$/, /(^|\/).*\/settings\.py$/, /(^|\/).*\/urls\.py$/],
    runtimeType: "python",
    terms: ["django", "urlpatterns", "models.Model", "rest_framework"]
  },
  {
    displayName: "Flask",
    framework: "flask",
    patterns: [/(^|\/)(app|main|routes).*\.py$/, /(^|\/)requirements\.txt$/],
    runtimeType: "python",
    terms: ["flask", "Blueprint", "@app.route", "@bp.route"]
  },
  {
    displayName: "Gin",
    framework: "gin",
    patterns: [/(^|\/)go\.mod$/, /\.go$/],
    runtimeType: "go",
    terms: ["github.com/gin-gonic/gin", "gin.Default", "router.GET", "router.POST"]
  },
  {
    displayName: "Fiber",
    framework: "fiber",
    patterns: [/(^|\/)go\.mod$/, /\.go$/],
    runtimeType: "go",
    terms: ["github.com/gofiber/fiber", "fiber.New", "app.Get", "app.Post"]
  },
  {
    displayName: "Spring Boot",
    framework: "spring_boot",
    patterns: [/(^|\/)pom\.xml$/, /(^|\/)build\.gradle(?:\.kts)?$/, /\.java$/],
    runtimeType: "java",
    terms: ["spring-boot", "@RestController", "@RequestMapping", "@SpringBootApplication"]
  },
  {
    displayName: "ASP.NET Core",
    framework: "aspnet_core",
    patterns: [/\.csproj$/, /(^|\/)program\.cs$/, /(^|\/)startup\.cs$/, /\.cs$/],
    runtimeType: "dotnet",
    terms: ["Microsoft.AspNetCore", "MapGet", "[HttpGet", "ControllerBase"]
  },
  {
    displayName: "Laravel",
    framework: "laravel",
    patterns: [/(^|\/)composer\.json$/, /(^|\/)routes\/(?:api|web)\.php$/, /\.php$/],
    runtimeType: "php",
    terms: ["laravel/framework", "Route::get", "Controller", "Illuminate\\"]
  }
];

export function getBackendFrameworkRegistry() {
  return registry;
}

export function detectBackendFramework(files: Record<string, string>): BackendFrameworkMatch {
  const match = registry.map((entry) => score(entry, files)).sort((a, b) => b.confidence - a.confidence)[0];

  if (!match || match.confidence < 0.24) {
    return {
      confidence: 0.2,
      displayName: "Unknown backend",
      framework: "unknown",
      runtimeType: "unknown",
      signals: []
    };
  }

  return match;
}
