import type { PreviewClassification, PreviewMetadata, PreviewRuntimeInput } from "@/lib/server/preview/preview-types";
import type {
  FrameworkId,
  FrameworkPreviewPlan,
  FrameworkPreviewResult
} from "@/lib/server/preview/framework-preview-types";
import type { ExecutablePreviewRuntimeResult } from "@/lib/server/preview/executable-preview-types";
import type { RealPreviewFrame } from "@/lib/server/preview/real-preview-types";
import {
  escapePreviewHtml,
  sanitizePreviewList,
  sanitizePreviewText,
  sanitizeStaticPreviewHtml
} from "@/lib/server/preview/real-preview-sanitizer";

function proposalName(input: PreviewRuntimeInput, fallback: string) {
  return sanitizePreviewText(input.proposal?.appPreview?.appName ?? input.proposal?.summary, fallback);
}

function allFileNames(input: PreviewRuntimeInput) {
  return [
    ...Object.keys(input.generatedFiles ?? {}),
    ...(input.proposal?.changes ?? []).map((change) => change.path ?? "")
  ]
    .filter(Boolean)
    .map((path) => path.replace(/\\/g, "/"));
}

function frame(
  id: string,
  title: string,
  kind: RealPreviewFrame["kind"],
  items: string[],
  extra?: Pick<RealPreviewFrame, "columns" | "rows">
): RealPreviewFrame {
  return {
    id,
    items: sanitizePreviewList(items, ["Preview item"]),
    kind,
    title: sanitizePreviewText(title),
    ...extra
  };
}

function routeItems(input: PreviewRuntimeInput) {
  const files = allFileNames(input);
  const routes = files
    .filter((path) => /(?:app|pages|routes|src\/pages)\//i.test(path))
    .map((path) => path.replace(/\.(?:tsx|jsx|ts|js|vue|svelte|astro)$/i, ""))
    .slice(0, 8);

  return routes.length ? routes : ["/", "/dashboard", "/settings"];
}

function componentItems(input: PreviewRuntimeInput) {
  const files = allFileNames(input);
  const components = files
    .filter((path) => /(?:components|src\/app|src\/components)/i.test(path))
    .map((path) => path.split("/").pop()?.replace(/\.(?:tsx|jsx|ts|js|vue|svelte|astro)$/i, "") ?? path)
    .slice(0, 8);

  return components.length ? components : ["AppShell", "Card", "Table", "Form"];
}

function planFor(frameworkId: FrameworkId, input: PreviewRuntimeInput, metadata: PreviewMetadata): FrameworkPreviewPlan {
  if (frameworkId === "react") {
    return {
      description: "React app rendered as a dashboard-oriented shell with sidebar, cards, table, and chart placeholders.",
      frames: [
        frame("react-shell", "React dashboard shell", "app_shell", ["Sidebar", "Top bar", "Content outlet"]),
        frame("react-cards", "Dashboard cards", "dashboard", ["Revenue", "Customers", "Tasks", "Pipeline"]),
        frame("react-table", "Data table", "table", ["Customers", "Status", "Owner"], {
          columns: ["Record", "Status"],
          rows: [["Customer list", "Mock"], ["Deal pipeline", "Mock"], ["Billing", "Planned"]]
        })
      ],
      title: proposalName(input, "React preview")
    };
  }

  if (frameworkId === "next") {
    return {
      description: "Next.js app rendered as an App Router structure with layouts and page hierarchy.",
      frames: [
        frame("next-routes", "Route tree", "app_shell", routeItems(input)),
        frame("next-layouts", "Layouts", "panel", ["Root layout", "Page shell", "Loading/Error states"]),
        frame("next-pages", "Page hierarchy", "dashboard", sanitizePreviewList(metadata.routes, ["/", "/dashboard", "/pricing"]))
      ],
      title: proposalName(input, "Next.js preview")
    };
  }

  if (frameworkId === "vite") {
    return {
      description: "Vite app rendered as a fast SPA preview shell with component tree.",
      frames: [
        frame("vite-shell", "SPA shell", "app_shell", ["index.html mount", "src/App", "main entry"]),
        frame("vite-components", "Component tree", "component", componentItems(input)),
        frame("vite-state", "Interactive areas", "panel", ["Client state", "Forms", "Cards", "Lists"])
      ],
      title: proposalName(input, "Vite SPA preview")
    };
  }

  if (frameworkId === "tailwind") {
    return {
      description: "Tailwind output rendered as a style-system preview for spacing, colors, radius, and layout rhythm.",
      frames: [
        frame("tailwind-colors", "Color system", "panel", ["Background", "Surface", "Accent", "Muted text"]),
        frame("tailwind-spacing", "Spacing system", "dashboard", ["Section padding", "Grid gaps", "Card padding"]),
        frame("tailwind-shapes", "UI rhythm", "component", ["Rounded cards", "Pill buttons", "Hairline borders"])
      ],
      title: "Tailwind visual system"
    };
  }

  if (frameworkId === "shadcn") {
    return {
      description: "shadcn/ui output rendered as a component inventory with cards, dialogs, forms, and tables.",
      frames: [
        frame("shadcn-inventory", "Component inventory", "component", ["Card", "Dialog", "Form", "Table", "Button"]),
        frame("shadcn-layout", "Dashboard composition", "dashboard", ["Stats cards", "Data table", "Filter controls"]),
        frame("shadcn-states", "States", "panel", ["Default", "Hover", "Disabled", "Loading"])
      ],
      title: "shadcn/ui preview"
    };
  }

  if (frameworkId === "vue" || frameworkId === "nuxt") {
    return {
      description: `${frameworkId === "nuxt" ? "Nuxt" : "Vue"} output rendered as a component hierarchy preview.`,
      frames: [
        frame(`${frameworkId}-routes`, "Routes", "app_shell", routeItems(input)),
        frame(`${frameworkId}-components`, "Components", "component", componentItems(input)),
        frame(`${frameworkId}-state`, "Reactive state", "panel", ["Props", "Computed data", "Events"])
      ],
      title: proposalName(input, `${frameworkId === "nuxt" ? "Nuxt" : "Vue"} preview`)
    };
  }

  if (frameworkId === "svelte" || frameworkId === "sveltekit") {
    return {
      description: `${frameworkId === "sveltekit" ? "SvelteKit" : "Svelte"} output rendered as a reactive component preview.`,
      frames: [
        frame(`${frameworkId}-reactivity`, "Reactive component", "component", ["State blocks", "Events", "Derived UI"]),
        frame(`${frameworkId}-routes`, "Routes", "app_shell", routeItems(input)),
        frame(`${frameworkId}-sections`, "UI sections", "dashboard", componentItems(input))
      ],
      title: proposalName(input, `${frameworkId === "sveltekit" ? "SvelteKit" : "Svelte"} preview`)
    };
  }

  if (frameworkId === "angular") {
    return {
      description: "Angular output rendered as module and component structure.",
      frames: [
        frame("angular-modules", "Modules", "app_shell", ["AppModule", "RoutingModule", "Feature modules"]),
        frame("angular-components", "Components", "component", componentItems(input)),
        frame("angular-services", "Services", "api", ["Data service", "Auth service", "State service"])
      ],
      title: proposalName(input, "Angular preview")
    };
  }

  if (frameworkId === "astro") {
    return {
      description: "Astro output rendered as content and site structure with pages, layouts, and islands.",
      frames: [
        frame("astro-pages", "Pages", "app_shell", routeItems(input)),
        frame("astro-content", "Content collections", "panel", ["Landing pages", "Content sections", "Static assets"]),
        frame("astro-islands", "Interactive islands", "component", componentItems(input))
      ],
      title: proposalName(input, "Astro site preview")
    };
  }

  if (frameworkId === "remix") {
    return {
      description: "Remix output rendered as nested routes with loader/action boundaries.",
      frames: [
        frame("remix-routes", "Nested routes", "app_shell", routeItems(input)),
        frame("remix-data", "Data boundaries", "api", ["Loaders", "Actions", "Forms"]),
        frame("remix-ui", "Route UI", "dashboard", componentItems(input))
      ],
      title: proposalName(input, "Remix preview")
    };
  }

  return {
    description: "Framework output rendered as a structured preview.",
    frames: [
      frame("framework-structure", "Structure", "panel", routeItems(input)),
      frame("framework-components", "Components", "component", componentItems(input))
    ],
    title: proposalName(input, "Framework preview")
  };
}

function safeHtmlFor(plan: FrameworkPreviewPlan) {
  const sections = plan.frames
    .map((previewFrame) => {
      const items = previewFrame.items.map((item) => `<li>${escapePreviewHtml(item)}</li>`).join("");

      return `<section><h2>${escapePreviewHtml(previewFrame.title)}</h2><ul>${items}</ul></section>`;
    })
    .join("");

  return sanitizeStaticPreviewHtml(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body{margin:0;background:#08080b;color:#f4f1e8;font-family:Inter,ui-sans-serif,system-ui;padding:24px}
      main{display:grid;gap:16px}
      section{border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(255,255,255,.045);padding:18px}
      h1{font-size:24px;margin:0 0 14px}
      p{color:#a9a3bd;margin:0 0 18px}
      h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#a9a3bd;margin:0 0 12px}
      ul{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
      li{border:1px solid rgba(96,239,255,.22);border-radius:999px;padding:8px 10px;background:rgba(96,239,255,.06)}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapePreviewHtml(plan.title)}</h1>
      <p>${escapePreviewHtml(plan.description)}</p>
      ${sections}
    </main>
  </body>
</html>`);
}

export function renderFrameworkPreview(
  input: PreviewRuntimeInput,
  classification: PreviewClassification,
  metadata: PreviewMetadata,
  executablePreview: ExecutablePreviewRuntimeResult
): FrameworkPreviewResult | null {
  const frameworkMatch = executablePreview.frameworkMatch;
  const frameworkId = frameworkMatch?.frameworkId;

  if (!frameworkId || frameworkId === "html" || frameworkId === "unknown" || frameworkId === "node_api") {
    return null;
  }

  const plan = planFor(frameworkId, input, metadata);

  return {
    assets: [],
    confidence: Math.max(classification.confidence, executablePreview.confidence),
    description: plan.description,
    frameworkDisplayName: frameworkMatch.displayName,
    frameworkId,
    frameworkSignals: frameworkMatch.signals,
    frames: plan.frames,
    kind:
      frameworkId === "shadcn" || frameworkId === "tailwind"
        ? "component_mock"
        : classification.previewType === "dashboard"
          ? "dashboard_mock"
          : "static_app_mock",
    previewType: classification.previewType,
    renderMode: "structured_cards",
    safeHtml: safeHtmlFor(plan),
    state: "ready",
    title: plan.title,
    warnings: [
      {
        code: "framework_mock_only",
        message: `${frameworkMatch.displayName} preview is deterministic and does not execute framework code.`,
        severity: "info"
      }
    ]
  };
}
