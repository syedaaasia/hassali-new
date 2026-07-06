import type { CodeGenerationBrief } from "@/lib/server/ai/generation-brief";

export type CodeAppSourceFile = {
  content: string;
  path: string;
  summary: string;
};

export type ReactProductPreviewMetadata = {
  appName: string;
  copyLines: string[];
  disclaimer: string;
  domain: string;
  metrics: string[];
  productPreviewQuality: {
    distinctLayoutKinds: number;
    hasAppName: boolean;
    hasDomainSections: boolean;
    hasLocalOnlyLimitations: boolean;
    hasMetrics: boolean;
    hasSampleRecords: boolean;
    hasStaticSnapshot: boolean;
    maxLayoutKindShare: number;
    screenGateFailures: string[];
    screenGateWarnings: string[];
    screenLayoutGatePassed: boolean;
    totalScreens: number;
  };
  sampleRecords: Array<{
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  }>;
  sections: string[];
  screenQualityGate: {
    distinctLayoutKinds: number;
    failures: string[];
    maxLayoutKindShare: number;
    passed: boolean;
    totalScreens: number;
    warnings: string[];
  };
  screens: Array<{
    label: string;
    layoutKind: string;
    purpose: string;
    screenId: string;
  }>;
  targetUser: string;
};

export function generateCrmViteSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  const blueprint = buildReactProductBlueprint({
    appName: input.appName,
    prompt: input.prompt
  });
  const appName = blueprint.appName;

  return [
    {
      path: "package.json",
      summary: `Adds Vite React package metadata for ${appName}. No install is executed.`,
      content: `{
  "name": "${slug(appName)}",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "typescript": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest"
  },
  "devDependencies": {}
}
`
    },
    {
      path: "vite.config.ts",
      summary: "Adds a Vite React configuration for future approved runtime preview.",
      content: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
`
    },
    {
      path: "index.html",
      summary: "Adds the Vite app HTML entry point.",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(appName)}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    },
    {
      path: "src/main.tsx",
      summary: "Adds the React entry point.",
      content: `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
    },
    {
      path: "src/App.tsx",
      summary: `Adds the ${appName} product-like React app with tabs, forms, local state, metrics, and workflow views.`,
      content: createReactMiniProductApp(blueprint)
    },
    {
      path: "src/lib/mock-data.ts",
      summary: `Adds Product Intelligence Blueprint sample data for ${appName}.`,
      content: createReactMiniProductMockData(blueprint)
    },
    {
      path: "src/styles.css",
      summary: `Adds the ${appName} responsive visual system and product UI styling.`,
      content: createReactMiniProductStyles(blueprint)
    },
    {
      path: "README.md",
      summary: `Adds run instructions and honest local-only notes for ${appName}.`,
      content: createReactMiniProductReadme(blueprint, input.prompt)
    },
    {
      path: "ARCHITECTURE.md",
      summary: `Documents the Product Intelligence Blueprint and architecture boundaries for ${appName}.`,
      content: createReactMiniProductArchitecture(blueprint, input.prompt)
    },
    {
      path: "DATA_MODEL.md",
      summary: `Documents ${appName} records, state model, and local-only data policy.`,
      content: createReactMiniProductDataModel(blueprint)
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: `Adds safety, testing, and no-secrets guidance for ${appName}.`,
      content: createReactMiniProductSecurity(blueprint)
    },
    {
      path: "HASSALI.md",
      summary: `Adds the CODE contract for the ${appName} React mini-product.`,
      content: createReactMiniProductContract(blueprint)
    }
  ];
}

export function createReactProductPreviewMetadata(input: {
  appName: string;
  prompt: string;
}): ReactProductPreviewMetadata {
  const blueprint = buildReactProductBlueprint(input);

  return {
    appName: blueprint.appName,
    copyLines: blueprint.copyLines,
    disclaimer: blueprint.disclaimer,
    domain: blueprint.domain,
    metrics: blueprint.metricLabels,
    productPreviewQuality: {
      distinctLayoutKinds: blueprint.screenQualityGate.distinctLayoutKinds,
      hasAppName: Boolean(blueprint.appName),
      hasDomainSections: blueprint.sections.length >= 4,
      hasLocalOnlyLimitations: /local|mock|no backend|no provider|not tax advice/i.test(blueprint.disclaimer),
      hasMetrics: blueprint.metricLabels.length >= 4,
      hasSampleRecords: blueprint.records.length >= 3,
      hasStaticSnapshot: true,
      maxLayoutKindShare: blueprint.screenQualityGate.maxLayoutKindShare,
      screenGateFailures: blueprint.screenQualityGate.failures,
      screenGateWarnings: blueprint.screenQualityGate.warnings,
      screenLayoutGatePassed: blueprint.screenQualityGate.passed,
      totalScreens: blueprint.screenQualityGate.totalScreens
    },
    sampleRecords: blueprint.records.slice(0, 4),
    sections: blueprint.sections,
    screenQualityGate: {
      distinctLayoutKinds: blueprint.screenQualityGate.distinctLayoutKinds,
      failures: blueprint.screenQualityGate.failures,
      maxLayoutKindShare: blueprint.screenQualityGate.maxLayoutKindShare,
      passed: blueprint.screenQualityGate.passed,
      totalScreens: blueprint.screenQualityGate.totalScreens,
      warnings: blueprint.screenQualityGate.warnings
    },
    screens: blueprint.screens.map((screen) => ({
      label: screen.label,
      layoutKind: screen.layoutKind,
      purpose: screen.purpose,
      screenId: screen.screenId
    })),
    targetUser: blueprint.targetUser
  };
}

type ReactProductBlueprint = {
  appName: string;
  copyLines: string[];
  disclaimer: string;
  domain: string;
  excitementGate: string;
  jobToBeDone: string;
  localStorageKey: string;
  metricLabels: [string, string, string, string];
  palette: {
    accent: string;
    accent2: string;
    canvas: string;
    ink: string;
    muted: string;
    soft: string;
    surface: string;
  };
  primaryActionLabel: string;
  recordLabel: string;
  records: Array<{
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  }>;
  sections: string[];
  screenQualityGate: ReactScreenQualityGate;
  screens: ReactProductScreen[];
  statusOptions: string[];
  targetUser: string;
  tone: string;
  type: "afforfix" | "generic" | "safe_client_check" | "tax_dedo";
  workflowMap: string[];
};

type ReactScreenLayoutKind =
  | "calendar_or_schedule"
  | "dashboard_overview"
  | "form_and_queue"
  | "kanban_status_board"
  | "package_or_pricing_cards"
  | "payments_revenue"
  | "people_roster"
  | "quality_issues"
  | "records_table"
  | "settings_or_docs_summary";

type ReactProductScreen = {
  actions: string[];
  domainVocabulary: string[];
  emptyState: string;
  fields: string[];
  label: string;
  layoutKind: ReactScreenLayoutKind;
  metrics: string[];
  primaryEntity: string;
  purpose: string;
  sampleRecords: ReactProductBlueprint["records"];
  screenId: string;
  statusOptions: string[];
};

type ReactScreenQualityGate = {
  distinctLayoutKinds: number;
  failures: string[];
  maxLayoutKindShare: number;
  passed: boolean;
  thresholds: {
    distinctLayoutKindsMinimumWhenFourScreens: number;
    maxSingleLayoutKindShareWhenFourScreens: number;
  };
  totalScreens: number;
  warnings: string[];
};

type ReactProductBlueprintDraft = Omit<ReactProductBlueprint, "screenQualityGate">;

function finalizeBlueprint(blueprint: ReactProductBlueprintDraft, prompt: string): ReactProductBlueprint {
  return {
    ...blueprint,
    screenQualityGate: buildScreenQualityGate(blueprint.screens, prompt)
  };
}

function screen(input: Omit<ReactProductScreen, "screenId">): ReactProductScreen {
  return {
    ...input,
    screenId: slug(input.label)
  };
}

function buildScreenQualityGate(screens: ReactProductScreen[], prompt: string): ReactScreenQualityGate {
  const totalScreens = screens.length;
  const layoutCounts = screens.reduce<Record<string, number>>((counts, item) => {
    counts[item.layoutKind] = (counts[item.layoutKind] ?? 0) + 1;
    return counts;
  }, {});
  const distinctLayoutKinds = Object.keys(layoutCounts).length;
  const maxLayoutKindShare = totalScreens
    ? Math.max(...Object.values(layoutCounts)) / totalScreens
    : 0;
  const failures: string[] = [];
  const warnings: string[] = [];

  if (totalScreens >= 4 && distinctLayoutKinds < 3) {
    failures.push(`screen layout variety failed: N=${totalScreens}, D=${distinctLayoutKinds}; D must be >= 3 when N >= 4.`);
  }

  if (totalScreens >= 4 && maxLayoutKindShare > 0.6) {
    failures.push(`screen layout dominance failed: max layout share ${maxLayoutKindShare.toFixed(2)} exceeds 0.60 when N >= 4.`);
  }

  screens.forEach((item) => {
    const label = item.label.toLowerCase();
    const expected =
      /dashboard|overview|summary/.test(label) ? "dashboard_overview" :
      /status board|pipeline|board|filing status/.test(label) ? "kanban_status_board" :
      /payment|invoice|income|revenue|remittance|billing/.test(label) ? "payments_revenue" :
      /package|pricing|service categor/.test(label) ? "package_or_pricing_cards" :
      /client|cleaner|people|customer/.test(label) ? "people_roster" :
      /review|quality|issue|risk/.test(label) ? "quality_issues" :
      /deadline|schedule|calendar/.test(label) ? "calendar_or_schedule" :
      null;

    if (expected && item.layoutKind !== expected) {
      warnings.push(`semantic layout mismatch: ${item.label} uses ${item.layoutKind}; expected ${expected}.`);
    }
  });

  const promptFeatures = [
    "bookings",
    "cleaners",
    "customer requests",
    "job status",
    "service categories",
    "filters",
    "demo records",
    "client records",
    "invoice",
    "tax status",
    "income summary",
    "due payments"
  ].filter((feature) => prompt.toLowerCase().includes(feature));
  const screenText = screens.map((item) => [
    item.label,
    item.purpose,
    item.primaryEntity,
    ...item.actions,
    ...item.domainVocabulary
  ].join(" ")).join(" ").toLowerCase();

  promptFeatures.forEach((feature) => {
    const normalized = feature.replace(/\s+/g, " ");
    if (!screenText.includes(normalized) && !(feature === "filters" && screenText.includes("filter"))) {
      warnings.push(`requested feature may be underrepresented in screens: ${feature}.`);
    }
  });

  return {
    distinctLayoutKinds,
    failures,
    maxLayoutKindShare: Number(maxLayoutKindShare.toFixed(2)),
    passed: failures.length === 0,
    thresholds: {
      distinctLayoutKindsMinimumWhenFourScreens: 3,
      maxSingleLayoutKindShareWhenFourScreens: 0.6
    },
    totalScreens,
    warnings
  };
}

function afforfixScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review today's jobs", "Filter urgent bookings", "Open dispatch notes", "Reset demo records"],
      domainVocabulary: ["cleaning service", "today's jobs", "booking", "quality", "demo records"],
      emptyState: "No jobs match this operational filter.",
      fields: ["job title", "client", "service tier", "status", "cleaner note"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Today's jobs", "Revenue estimate", "Cleaner workload", "Quality issues"],
      primaryEntity: "operations snapshot",
      purpose: "Show the dispatcher the daily cleaning operation at a glance.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add booking", "Assign cleaner", "Filter by status", "Review customer requests"],
      domainVocabulary: ["booking", "client request", "customer requests", "home cleaning", "office cleaning"],
      emptyState: "No bookings match this status.",
      fields: ["booking", "client", "address", "service", "status"],
      label: "Bookings",
      layoutKind: "records_table",
      metrics: ["Bookings", "Confirmed", "Pending", "Cancelled"],
      primaryEntity: "booking",
      purpose: "Track cleaning requests with practical dispatch details.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review client notes", "Check repeat customers", "Flag special instructions"],
      domainVocabulary: ["clients", "homeowners", "customer notes"],
      emptyState: "No clients found for this filter.",
      fields: ["client", "location", "notes", "last service"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["Clients", "Repeat clients", "Notes", "Follow-ups"],
      primaryEntity: "client",
      purpose: "Keep client preferences and notes visible for service quality.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Assign cleaner", "Review workload", "Check availability"],
      domainVocabulary: ["cleaners", "workload", "availability", "ratings"],
      emptyState: "No cleaners match this availability filter.",
      fields: ["cleaner", "workload", "rating", "availability"],
      label: "Cleaners",
      layoutKind: "people_roster",
      metrics: ["Available cleaners", "Busy cleaners", "Average rating", "Open slots"],
      primaryEntity: "cleaner",
      purpose: "Balance cleaner assignments without overloading one person.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Compare packages", "Review inclusions", "Prepare quote"],
      domainVocabulary: ["Basic", "Deep Clean", "Move-in Clean", "service categories"],
      emptyState: "No service packages configured yet.",
      fields: ["package", "duration", "price", "included tasks"],
      label: "Service Packages",
      layoutKind: "package_or_pricing_cards",
      metrics: ["Packages", "Popular tier", "Starting price", "Average duration"],
      primaryEntity: "service package",
      purpose: "Present service tiers as clear marketplace-ready packages.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move booking status", "Spot blocked jobs", "Review completed work"],
      domainVocabulary: ["job status", "pending", "confirmed", "completed", "cancelled"],
      emptyState: "No jobs in this board column.",
      fields: ["job", "status", "cleaner", "client"],
      label: "Job Status Board",
      layoutKind: "kanban_status_board",
      metrics: ["Pending", "Confirmed", "In progress", "Completed"],
      primaryEntity: "job",
      purpose: "Make job movement visible as a status board.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Track unpaid bookings", "Mark paid", "Review revenue estimate"],
      domainVocabulary: ["payments", "paid", "unpaid", "revenue estimate"],
      emptyState: "No payment records match this filter.",
      fields: ["booking", "amount", "payment status", "client"],
      label: "Payments",
      layoutKind: "payments_revenue",
      metrics: ["Revenue estimate", "Paid", "Unpaid", "Refunded"],
      primaryEntity: "payment",
      purpose: "Separate operational completion from payment state.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Log quality issue", "Review ratings", "Queue second pass"],
      domainVocabulary: ["reviews", "quality issues", "second pass", "cleaning checklist"],
      emptyState: "No quality issues are open.",
      fields: ["issue", "client", "severity", "resolution"],
      label: "Reviews / Quality Issues",
      layoutKind: "quality_issues",
      metrics: ["Reviews", "Open issues", "Resolved", "Second-pass jobs"],
      primaryEntity: "quality issue",
      purpose: "Track customer feedback and cleaning quality follow-up.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function taxDedoScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review income", "Check filing readiness", "Open due reminders"],
      domainVocabulary: ["tax filing", "income summary", "Pakistan freelancers", "not tax advice"],
      emptyState: "No finance records are visible yet.",
      fields: ["income", "pending", "client", "deadline"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Monthly income", "Pending amount", "Top client", "Overdue reminders"],
      primaryEntity: "finance snapshot",
      purpose: "Show income, overdue money, and filing readiness in the first view.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add client", "Review risk notes", "Filter active clients"],
      domainVocabulary: ["client records", "freelancer clients", "client ghosting risk"],
      emptyState: "No client records match this filter.",
      fields: ["client", "country", "risk", "last payment"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["Clients", "Risk notes", "Active retainers", "Follow-ups"],
      primaryEntity: "client",
      purpose: "Track freelancer clients and payment reliability.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add invoice", "Mark paid", "Filter pending payments"],
      domainVocabulary: ["invoice", "payment status", "due payments", "receipts"],
      emptyState: "No invoices match this status.",
      fields: ["invoice", "client", "amount", "status"],
      label: "Invoices",
      layoutKind: "payments_revenue",
      metrics: ["Invoices", "Paid", "Pending", "Overdue"],
      primaryEntity: "invoice",
      purpose: "Keep invoice and payment status visible without a backend.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move filing status", "Review missing proof", "Flag review items"],
      domainVocabulary: ["tax status", "filing board", "proof saved", "readiness"],
      emptyState: "No filing items are on the board.",
      fields: ["filing task", "status", "proof", "notes"],
      label: "Tax Filing Status",
      layoutKind: "kanban_status_board",
      metrics: ["Ready", "Needs proof", "Review", "Filed locally"],
      primaryEntity: "filing task",
      purpose: "Represent tax-readiness as a board, not legal advice.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add expense", "Attach receipt note", "Flag formula-safe export"],
      domainVocabulary: ["deductions", "expenses", "receipt proof", "mock estimate"],
      emptyState: "No expense records match this filter.",
      fields: ["expense", "category", "amount", "receipt"],
      label: "Deductions / Expenses",
      layoutKind: "records_table",
      metrics: ["Expenses", "Proof saved", "Missing proof", "Mock deductible total"],
      primaryEntity: "expense",
      purpose: "Track expense proof for later human review.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add deadline", "Mark reminder", "Review overdue follow-up"],
      domainVocabulary: ["deadlines", "due payments", "reminders", "filing due"],
      emptyState: "No upcoming reminders in this view.",
      fields: ["deadline", "owner", "date", "status"],
      label: "Deadlines",
      layoutKind: "calendar_or_schedule",
      metrics: ["Upcoming", "Overdue", "Due this week", "Completed"],
      primaryEntity: "deadline",
      purpose: "Make payment and filing deadlines visible.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review local summary", "Check disclaimer", "Prepare accountant notes"],
      domainVocabulary: ["reports", "tax readiness", "local summaries", "not tax advice"],
      emptyState: "No report summary is ready yet.",
      fields: ["summary", "period", "notes", "disclaimer"],
      label: "Reports",
      layoutKind: "settings_or_docs_summary",
      metrics: ["Reports", "Summaries", "Notes", "Disclaimers"],
      primaryEntity: "report",
      purpose: "Summarize local records for later professional review.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function genericScreens(records: ReactProductBlueprint["records"], statusOptions: string[]): ReactProductScreen[] {
  return [
    screen({
      actions: ["Review overview", "Check metrics", "Open priority items"],
      domainVocabulary: ["dashboard", "records", "metrics"],
      emptyState: "No dashboard records yet.",
      fields: ["metric", "owner", "status"],
      label: "Dashboard",
      layoutKind: "dashboard_overview",
      metrics: ["Active records", "Open value", "Needs review", "Completed"],
      primaryEntity: "overview",
      purpose: "Show the app's main local operating picture.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Add record", "Filter records", "Update status"],
      domainVocabulary: ["records", "table", "status"],
      emptyState: "No records match this filter.",
      fields: ["title", "owner", "amount", "status"],
      label: "Records",
      layoutKind: "records_table",
      metrics: ["Records", "Open", "Done", "Watch"],
      primaryEntity: "record",
      purpose: "Manage the core trackable records.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Move status", "Review queue", "Spot blockers"],
      domainVocabulary: ["workflow", "board", "status"],
      emptyState: "No board items in this column.",
      fields: ["record", "status", "owner"],
      label: "Workflow Board",
      layoutKind: "kanban_status_board",
      metrics: ["Pending", "Active", "Watch", "Completed"],
      primaryEntity: "workflow item",
      purpose: "Show progress as a board instead of another list.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review contacts", "Add note", "Filter people"],
      domainVocabulary: ["clients", "owners", "contacts"],
      emptyState: "No people records visible.",
      fields: ["person", "role", "status", "note"],
      label: "Clients",
      layoutKind: "people_roster",
      metrics: ["People", "Follow-ups", "Active", "Review"],
      primaryEntity: "person",
      purpose: "Keep people and ownership clear.",
      sampleRecords: records,
      statusOptions
    }),
    screen({
      actions: ["Review notes", "Document limitation", "Reset demo"],
      domainVocabulary: ["notes", "local demo", "limitations"],
      emptyState: "No documentation notes yet.",
      fields: ["note", "owner", "status"],
      label: "Settings",
      layoutKind: "settings_or_docs_summary",
      metrics: ["Notes", "Local data", "Safety", "Reset"],
      primaryEntity: "setting",
      purpose: "Explain local-only limits and demo controls.",
      sampleRecords: records,
      statusOptions
    })
  ];
}

function buildReactProductBlueprint(input: {
  appName: string;
  prompt: string;
}): ReactProductBlueprint {
  const prompt = input.prompt.toLowerCase();

  if (/\b(?:anthropic|openai|gemini|claude|ai api|api key|browser api|directly from the browser)\b/i.test(input.prompt)) {
    const records = [
      { amount: 82, category: "Mock review", note: "Looks healthy in local demo data. Real model review requires backend proxy.", owner: "Ayesha Malik", status: "ready", title: "Studio Nova" },
      { amount: 61, category: "Needs follow-up", note: "Missing signed scope. Flagged locally without external provider call.", owner: "Daniel Reed", status: "watch", title: "Atlas Retail" },
      { amount: 44, category: "High caution", note: "Payment terms unclear. Add human review before onboarding.", owner: "Mina Chen", status: "review", title: "Northstar Labs" }
    ];
    const statusOptions = ["ready", "watch", "review", "approved", "blocked"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Safe Client Check Studio",
      copyLines: [
        "Client check workflow, safely mocked in the browser.",
        "Real provider calls need a server-side proxy and protected credentials.",
        "Use this local screen to design the review flow before backend approval."
      ],
      disclaimer: "Local placeholder only. No provider credentials, direct AI calls, backend, auth, cloud sync, public sharing, or payment processing is included.",
      domain: "safe client check workflow",
      excitementGate: "A user sees the client review workflow, risk notes, and backend boundary immediately without exposing secrets.",
      jobToBeDone: "Help the user design a client checking workflow while keeping provider calls behind a future server-side proxy.",
      localStorageKey: "hassali-safe-client-check-demo",
      metricLabels: ["Clients queued", "Watchlist", "Approved locally", "Proxy steps left"],
      palette: {
        accent: "#38bdf8",
        accent2: "#a78bfa",
        canvas: "#07111f",
        ink: "#f8fafc",
        muted: "#90a4b8",
        soft: "#12314d",
        surface: "rgba(14,29,47,0.9)"
      },
      primaryActionLabel: "Add client check",
      recordLabel: "client check",
      records,
      sections: ["Dashboard", "Client Queue", "Risk Notes", "Review Form", "Backend Proxy Plan", "Security Checklist"],
      screens: genericScreens(records, statusOptions),
      statusOptions,
      targetUser: "Freelancers and small teams designing a safe client checking workflow",
      tone: "clear, security-aware, practical",
      type: "safe_client_check",
      workflowMap: ["Add client check", "Update review status", "Record risk note", "Review backend proxy requirements", "Reset demo data"]
    }, input.prompt);
  }

  if (prompt.includes("afforfix") || prompt.includes("cleaning service") || prompt.includes("cleaner")) {
    const records = [
      { amount: 9500, category: "Deep Clean", note: "Client wants pet-safe products and balcony focus.", owner: "Nadia Khan", status: "confirmed", title: "Gulberg apartment reset" },
      { amount: 6200, category: "Basic", note: "Assign cleaner near Clifton route.", owner: "Hamza Mir", status: "pending", title: "Clifton weekly clean" },
      { amount: 14800, category: "Move-in Clean", note: "Quality issue: kitchen cabinets need second pass.", owner: "Maira Ali", status: "in-progress", title: "DHA move-in clean" },
      { amount: 7200, category: "Basic", note: "Payment unpaid. Follow up after completion photos.", owner: "Sameer Shah", status: "completed", title: "Bahria family home" }
    ];
    const statusOptions = ["pending", "confirmed", "in-progress", "completed", "cancelled", "unpaid", "paid", "refunded"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Afforfix Cleaner",
      copyLines: [
        "Today’s jobs without the WhatsApp chaos.",
        "Cleaner workload, payments, and quality issues in one dispatch view.",
        "Local demo only - no live marketplace backend or real payments."
      ],
      disclaimer: "Local operations demo only. No real booking links, cleaner verification, customer notifications, cloud sync, or payment processing are included.",
      domain: "cleaning service marketplace operations",
      excitementGate: "A dispatcher sees today’s jobs, unpaid bookings, cleaner workload, and quality issues in the first screen.",
      jobToBeDone: "Help a cleaning marketplace owner track bookings, clients, cleaners, service tiers, job status, payments, reviews, and quality issues.",
      localStorageKey: "hassali-afforfix-cleaner-demo",
      metricLabels: ["Today's jobs", "Revenue estimate", "Unpaid bookings", "Cleaner workload"],
      palette: {
        accent: "#0891b2",
        accent2: "#14b8a6",
        canvas: "#f5fbff",
        ink: "#10202b",
        muted: "#5c7180",
        soft: "#dff7f4",
        surface: "rgba(255,255,255,0.86)"
      },
      primaryActionLabel: "Add booking",
      recordLabel: "booking",
      records,
      sections: ["Dashboard", "Bookings", "Clients", "Cleaners", "Service Packages", "Job Status Board", "Payments", "Reviews / Quality Issues"],
      screens: afforfixScreens(records, statusOptions),
      statusOptions,
      targetUser: "cleaning marketplace owner, dispatcher, and home-cleaning operations team",
      tone: "clean, trustworthy, operational, marketplace-ready",
      type: "afforfix",
      workflowMap: ["Add booking", "Assign cleaner", "Change booking status", "Filter by status", "Track payment state", "Log quality issue", "Reset demo data"]
    }, input.prompt);
  }

  if (prompt.includes("tax dedo") || prompt.includes("pakistani freelancer") || prompt.includes("pakistan freelancer") || prompt.includes("tax filing") || prompt.includes("accounting") || prompt.includes("invoice/tax") || prompt.includes("remittance") || prompt.includes("receipts")) {
    const records = [
      { amount: 1800, category: "Wise remittance", note: "Upwork milestone, invoice TD-104, billing proof saved before panic.", owner: "Amina Qureshi", status: "paid", title: "Lumen Studio retainer" },
      { amount: 950, category: "Payoneer", note: "Client ghosting risk: billing is 6 days late. Reminder queued for overdue payments.", owner: "Bilal Ahmed", status: "overdue", title: "Nordic SaaS landing page" },
      { amount: 1240, category: "Bank transfer", note: "Direct client invoices and receipt screenshot logged.", owner: "Sara Khan", status: "pending", title: "Toronto UX sprint" },
      { amount: 640, category: "Subscription retainer", note: "Monthly subscriptions-style design support payment marked for review.", owner: "Hamza Malik", status: "watch", title: "Berlin product icons" },
      { amount: 520, category: "Wise remittance", note: "Small service seller campaign assets.", owner: "Omar Farooq", status: "paid", title: "Dubai ecommerce copy" }
    ];
    const statusOptions = ["pending", "paid", "overdue", "watch", "proof saved"];

    return finalizeBlueprint({
      appName: input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Tax Dedo",
      copyLines: [
        "Your paisa dashboard, minus the spreadsheet panic.",
        "Proof saved before panic. Invoices, payments, subscription-style retainers, and remittance damage checked before payday.",
        "Tax readiness, not tax advice."
      ],
      disclaimer: "Illustrative finance organizer only. Tax-readiness estimates are mock signals, not Pakistani tax/legal/accounting advice.",
      domain: "freelancer finance, receipts, remittance, and client tracking",
      excitementGate: "A freelancer sees income, pending money, client risk, proof logs, and remittance comparison in the first 10 seconds.",
      jobToBeDone: "Help Pakistani freelancers track client income, receipts, invoices, payments, subscription-style retainers, billing follow-ups, remittance options, payment reminders, client risk notes, and tax-readiness.",
      localStorageKey: "hassali-tax-dedo-demo",
      metricLabels: ["Monthly income", "Pending amount", "Top client", "Overdue reminders"],
      palette: {
        accent: "#0f9f6e",
        accent2: "#f2b84b",
        canvas: "#f8f3e8",
        ink: "#17221c",
        muted: "#667164",
        soft: "#ddf7e8",
        surface: "rgba(255,255,255,0.82)"
      },
      primaryActionLabel: "Add income",
      recordLabel: "payment",
      records,
      sections: ["Dashboard", "Clients", "Invoices", "Tax Filing Status", "Deductions / Expenses", "Deadlines", "Reports"],
      screens: taxDedoScreens(records, statusOptions),
      statusOptions,
      targetUser: "Pakistani freelancers, remote workers, and small service sellers",
      tone: "practical, slightly desi, friendly, still professional",
      type: "tax_dedo",
      workflowMap: ["Add client record", "Add invoice", "Log expense proof", "Move tax filing status", "Review deadlines", "Read not-tax-advice disclaimer", "Reset demo data"]
    }, input.prompt);
  }

  const fallbackName = input.appName && !/^software app$/i.test(input.appName) ? input.appName : "Local Product Studio";
  const records = [
    { amount: 3200, category: "Priority", note: "Needs confirmation before final handoff.", owner: "Aisha", status: "pending", title: "Client onboarding" },
    { amount: 1800, category: "Operations", note: "Ready for review.", owner: "Bilal", status: "completed", title: "Weekly tracker" },
    { amount: 2400, category: "Follow-up", note: "Waiting on updated details.", owner: "Sara", status: "watch", title: "Proposal review" }
  ];
  const statusOptions = ["pending", "active", "watch", "completed"];

  return finalizeBlueprint({
    appName: fallbackName,
    copyLines: [
      "A local-first operations dashboard for the work you actually track.",
      "Records, statuses, notes, and metrics stay on this device until a backend is approved.",
      "Useful demo workflows without fake cloud claims."
    ],
    disclaimer: "Local demo only. No backend, auth, cloud sync, public sharing, or payment processing is included.",
    domain: "local-first business app",
    excitementGate: "A user sees records, actions, status filters, and metrics immediately instead of a blank scaffold.",
    jobToBeDone: "Help the user track important records, statuses, notes, and summary metrics in a polished local app.",
    localStorageKey: `hassali-${slug(fallbackName)}-demo`,
    metricLabels: ["Active records", "Open value", "Needs review", "Completed"],
    palette: {
      accent: "#6366f1",
      accent2: "#06b6d4",
      canvas: "#f7f7ff",
      ink: "#171827",
      muted: "#687083",
      soft: "#e8e9ff",
      surface: "rgba(255,255,255,0.86)"
    },
    primaryActionLabel: "Add record",
    recordLabel: "record",
    records,
    sections: ["Dashboard", "Records", "Workflow Board", "Clients", "Notes", "Metrics", "Quality Checks", "Settings"],
    screens: genericScreens(records, statusOptions),
    statusOptions,
    targetUser: "small business operator",
    tone: "calm, useful, product-focused",
    type: "generic",
    workflowMap: ["Add record", "Change status", "Filter list", "Review notes", "Reset demo data"]
  }, input.prompt);
}

function createReactMiniProductApp(blueprint: ReactProductBlueprint) {
  const blueprintJson = JSON.stringify(blueprint, null, 2);

  return `import { useEffect, useMemo, useState } from "react";

export default function App() {
  const blueprint = ${blueprintJson};
  type DemoRecord = {
    amount: number;
    category: string;
    note: string;
    owner: string;
    status: string;
    title: string;
  };
  const [activeTab, setActiveTab] = useState(blueprint.sections[0]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [records, setRecords] = useState<DemoRecord[]>(() => loadRecords(blueprint.localStorageKey, blueprint.records as DemoRecord[]));
  const [form, setForm] = useState({
    amount: "",
    category: blueprint.records[0]?.category ?? "General",
    note: "",
    owner: "",
    status: blueprint.statusOptions[0] ?? "pending",
    title: ""
  });

  useEffect(() => {
    saveRecords(blueprint.localStorageKey, records);
  }, [blueprint.localStorageKey, records]);

  const visibleRecords = useMemo(() => {
    return statusFilter === "all" ? records : records.filter((record) => record.status === statusFilter);
  }, [records, statusFilter]);
  const activeScreen = useMemo(() => {
    return blueprint.screens.find((screen) => screen.label === activeTab) ?? blueprint.screens[0];
  }, [activeTab, blueprint.screens]);

  const metrics = useMemo(() => {
    const total = records.reduce((sum, record) => sum + Number(record.amount || 0), 0);
    const pending = records.filter((record) => /pending|overdue|unpaid|watch/i.test(record.status));
    const completed = records.filter((record) => /paid|completed/i.test(record.status));
    const top = [...records].sort((a, b) => b.amount - a.amount)[0];

    return [
      { label: blueprint.metricLabels[0], value: money(total), detail: "mock local total" },
      { label: blueprint.metricLabels[1], value: money(pending.reduce((sum, record) => sum + record.amount, 0)), detail: \`\${pending.length} needs action\` },
      { label: blueprint.metricLabels[2], value: top?.owner ?? "None", detail: top?.title ?? "No records yet" },
      { label: blueprint.metricLabels[3], value: String(completed.length), detail: "locally tracked" }
    ];
  }, [blueprint.metricLabels, records]);

  function addRecord() {
    if (!form.title.trim() || !form.owner.trim()) return;

    const nextRecord = {
      amount: Number(form.amount || 0),
      category: form.category || "General",
      note: form.note || "No note yet.",
      owner: form.owner,
      status: form.status,
      title: form.title
    } satisfies DemoRecord;

    setRecords((current) => [nextRecord, ...current]);
    setForm({
      amount: "",
      category: blueprint.records[0]?.category ?? "General",
      note: "",
      owner: "",
      status: blueprint.statusOptions[0] ?? "pending",
      title: ""
    });
  }

  function updateStatus(index: number, status: string) {
    setRecords((current) => current.map((record, recordIndex) => recordIndex === index ? { ...record, status } : record));
  }

  function resetDemoData() {
    setRecords(blueprint.records as DemoRecord[]);
    setStatusFilter("all");
    setActiveTab(blueprint.sections[0]);
  }

  function screenRecords() {
    return visibleRecords.slice(0, 6);
  }

  function renderScreenContent() {
    const current = activeScreen;
    const rows = screenRecords();

    if (current.layoutKind === "dashboard_overview") {
      return (
        <div className="screen-overview">
          <div className="overview-copy">
            <p className="eyebrow">{current.primaryEntity}</p>
            <h3>{current.purpose}</h3>
            <p>{current.domainVocabulary.join(" / ")}</p>
          </div>
          <div className="mini-metric-grid">
            {current.metrics.map((metric, index) => (
              <article className="mini-metric" key={metric}>
                <span>{metric}</span>
                <strong>{index === 0 ? metrics[0].value : index === 1 ? metrics[1].value : index === 2 ? metrics[2].value : metrics[3].value}</strong>
              </article>
            ))}
          </div>
        </div>
      );
    }

    if (current.layoutKind === "records_table") {
      return (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>{current.fields.slice(0, 4).map((field) => <th key={field}>{field}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((record, index) => (
                <tr key={\`\${record.title}-\${index}\`}>
                  <td>{record.title}</td>
                  <td>{record.owner}</td>
                  <td>{money(record.amount)}</td>
                  <td><span className="status-chip">{record.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (current.layoutKind === "kanban_status_board") {
      return (
        <div className="kanban-board">
          {blueprint.statusOptions.slice(0, 4).map((status) => (
            <article className="kanban-column" key={status}>
              <h4>{status}</h4>
              {records.filter((record) => record.status === status).slice(0, 3).map((record) => (
                <div className="kanban-card" key={record.title}>
                  <strong>{record.title}</strong>
                  <span>{record.owner}</span>
                </div>
              ))}
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "people_roster") {
      return (
        <div className="people-roster">
          {rows.map((record) => (
            <article className="person-card" key={record.title}>
              <div className="avatar">{record.owner.slice(0, 2)}</div>
              <div>
                <strong>{record.owner}</strong>
                <span>{record.title}</span>
                <small>{record.note}</small>
              </div>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "package_or_pricing_cards") {
      return (
        <div className="package-grid">
          {rows.map((record) => (
            <article className="package-card" key={record.title}>
              <span>{record.category}</span>
              <strong>{money(record.amount)}</strong>
              <p>{record.note}</p>
              <button className="ghost" type="button">{current.actions[0]}</button>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "payments_revenue") {
      return (
        <div className="revenue-layout">
          <div className="revenue-total">{metrics[0].value}<span>{current.metrics[0]}</span></div>
          <div className="payment-list">
            {rows.map((record) => <p key={record.title}><strong>{record.owner}</strong><span>{money(record.amount)} - {record.status}</span></p>)}
          </div>
        </div>
      );
    }

    if (current.layoutKind === "quality_issues") {
      return (
        <div className="issue-list">
          {rows.map((record) => (
            <article className="issue-card" key={record.title}>
              <span className="status-chip">{record.status}</span>
              <strong>{record.title}</strong>
              <p>{record.note}</p>
            </article>
          ))}
        </div>
      );
    }

    if (current.layoutKind === "calendar_or_schedule") {
      return (
        <div className="schedule-list">
          {rows.map((record, index) => (
            <article className="schedule-row" key={record.title}>
              <time>Day {index + 1}</time>
              <strong>{record.title}</strong>
              <span>{record.status}</span>
            </article>
          ))}
        </div>
      );
    }

    return (
      <div className="docs-summary">
        <h3>{current.purpose}</h3>
        <ul>{current.actions.map((action) => <li key={action}>{action}</li>)}</ul>
        <p>{blueprint.disclaimer}</p>
      </div>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">{blueprint.appName.slice(0, 2)}</div>
        <div>
          <p className="eyebrow">{blueprint.domain}</p>
          <h1>{blueprint.appName}</h1>
          <p>{blueprint.targetUser}</p>
        </div>
        <nav className="tab-list" aria-label={\`\${blueprint.appName} sections\`}>
          {blueprint.screens.map((section) => (
            <button
              className={section.label === activeTab ? "tab active" : "tab"}
              key={section.screenId}
              onClick={() => setActiveTab(section.label)}
              type="button"
            >
              {section.label}
            </button>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="hero">
          <div>
            <p className="eyebrow">Product Intelligence Blueprint</p>
            <h2>{blueprint.copyLines[0]}</h2>
            <p>{blueprint.jobToBeDone}</p>
          </div>
          <div className="hero-card">
            <strong>First 10 seconds</strong>
            <span>{blueprint.excitementGate}</span>
          </div>
        </header>

        <section className="metrics" aria-label="Dashboard metrics">
          {metrics.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          ))}
        </section>

        <section className="control-grid">
          <article className="panel form-panel">
            <div className="panel-heading">
              <p className="eyebrow">{blueprint.primaryActionLabel}</p>
              <h3>Add a local {blueprint.recordLabel}</h3>
            </div>
            <div className="form-grid">
              <label>
                Title
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Project, booking, or record title" />
              </label>
              <label>
                Owner / client
                <input value={form.owner} onChange={(event) => setForm({ ...form, owner: event.target.value })} placeholder="Client or owner name" />
              </label>
              <label>
                Amount
                <input value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" type="number" />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  {blueprint.statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label className="wide-field">
                Note
                <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Add useful context, reminder, or quality note" />
              </label>
            </div>
            <div className="actions">
              <button onClick={addRecord} type="button">{blueprint.primaryActionLabel}</button>
              <button className="secondary" onClick={resetDemoData} type="button">Reset demo data</button>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <p className="eyebrow">Workflow map</p>
              <h3>What users can actually do</h3>
            </div>
            <div className="workflow-list">
              {blueprint.workflowMap.map((item) => <span key={item}>{item}</span>)}
            </div>
            <p className="disclaimer">{blueprint.disclaimer}</p>
          </article>
        </section>

        <section className={\`panel screen-panel layout-\${activeScreen.layoutKind}\`}>
          <div className="panel-heading split">
            <div>
              <p className="eyebrow">{activeScreen.layoutKind}</p>
              <h3>{activeScreen.label}</h3>
              <p>{activeScreen.purpose}</p>
            </div>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {blueprint.statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>

          {visibleRecords.length === 0 ? (
            <div className="empty-state">
              <strong>No records match this filter.</strong>
              <p>{activeScreen.emptyState}</p>
            </div>
          ) : (
            renderScreenContent()
          )}
        </section>
      </section>
    </main>
  );
}

function loadRecords<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : fallback;
  } catch {
    return fallback;
  }
}

function saveRecords(key: string, records: unknown[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(records));
  } catch {
    // Local demo remains usable even if browser storage is blocked.
  }
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency"
  }).format(value);
}
`
}

function createReactMiniProductMockData(blueprint: ReactProductBlueprint) {
  return `export const productBlueprint = ${JSON.stringify({
    appName: blueprint.appName,
    dataPolicy: "local_or_mock_only",
    domain: blueprint.domain,
    excitementGate: blueprint.excitementGate,
    metrics: blueprint.metricLabels,
    sections: blueprint.sections,
    targetUser: blueprint.targetUser
  }, null, 2)} as const;

export const sampleRecords = ${JSON.stringify(blueprint.records, null, 2)};

export const statusOptions = ${JSON.stringify(blueprint.statusOptions, null, 2)};
`;
}

function createReactMiniProductStyles(blueprint: ReactProductBlueprint) {
  return `:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: ${blueprint.palette.canvas};
  color: ${blueprint.palette.ink};
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 14% 8%, ${blueprint.palette.soft}, transparent 28rem),
    radial-gradient(circle at 88% 14%, rgba(255,255,255,0.76), transparent 24rem),
    ${blueprint.palette.canvas};
}

button, input, select, textarea {
  font: inherit;
}

button {
  border: 0;
  border-radius: 999px;
  background: ${blueprint.palette.accent};
  color: white;
  cursor: pointer;
  font-weight: 850;
  padding: 0.78rem 1rem;
  transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

button:hover {
  box-shadow: 0 16px 36px rgba(0,0,0,0.16);
  transform: translateY(-1px);
}

button.secondary, button.ghost {
  background: rgba(255,255,255,0.72);
  color: ${blueprint.palette.ink};
  border: 1px solid rgba(0,0,0,0.08);
}

.app-shell {
  display: grid;
  grid-template-columns: 18rem minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  align-content: start;
  background: ${blueprint.palette.ink};
  color: white;
  display: grid;
  gap: 1.5rem;
  padding: 1.25rem;
}

.brand-mark {
  align-items: center;
  background: linear-gradient(135deg, ${blueprint.palette.accent}, ${blueprint.palette.accent2});
  border-radius: 20px;
  display: grid;
  font-size: 1rem;
  font-weight: 950;
  height: 3rem;
  justify-items: center;
  width: 3rem;
}

.sidebar h1, .hero h2, .panel h3, .record-card h4 {
  letter-spacing: -0.04em;
  margin: 0;
}

.sidebar p, .hero p, .record-card p, .record-card small, .disclaimer {
  color: ${blueprint.palette.muted};
  line-height: 1.6;
}

.sidebar p {
  color: rgba(255,255,255,0.68);
}

.eyebrow {
  color: ${blueprint.palette.accent2};
  font-size: 0.72rem;
  font-weight: 950;
  letter-spacing: 0.14em;
  margin: 0 0 0.45rem;
  text-transform: uppercase;
}

.tab-list {
  display: grid;
  gap: 0.5rem;
}

.tab {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.72);
  text-align: left;
}

.tab.active, .tab:hover {
  background: rgba(255,255,255,0.12);
  color: white;
}

.workspace {
  display: grid;
  gap: 1rem;
  padding: clamp(1rem, 3vw, 2rem);
}

.hero, .panel, .metric-card, .record-card, .person-card, .package-card, .issue-card, .kanban-column, .schedule-row {
  background: ${blueprint.palette.surface};
  border: 1px solid rgba(0,0,0,0.07);
  border-radius: 28px;
  box-shadow: 0 24px 80px rgba(23, 34, 28, 0.1);
}

.hero {
  align-items: stretch;
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 0.65fr);
  padding: clamp(1.25rem, 3vw, 2rem);
}

.hero h2 {
  font-size: clamp(2.3rem, 6vw, 5.5rem);
  line-height: 0.92;
  max-width: 12ch;
}

.hero-card {
  background: linear-gradient(135deg, ${blueprint.palette.accent}, ${blueprint.palette.accent2});
  border-radius: 24px;
  color: white;
  display: grid;
  gap: 0.85rem;
  padding: 1.25rem;
}

.hero-card strong {
  font-size: 1.4rem;
  letter-spacing: -0.04em;
}

.metrics {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.metric-card {
  display: grid;
  gap: 0.4rem;
  padding: 1rem;
}

.metric-card strong {
  font-size: clamp(1.5rem, 4vw, 2.4rem);
  letter-spacing: -0.05em;
}

.metric-card span, .metric-card small {
  color: ${blueprint.palette.muted};
}

.control-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.2fr) minmax(20rem, 0.8fr);
}

.panel {
  padding: 1rem;
}

.panel-heading {
  margin-bottom: 1rem;
}

.panel-heading.split {
  align-items: center;
  display: flex;
  gap: 1rem;
  justify-content: space-between;
}

.form-grid {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

label {
  color: ${blueprint.palette.muted};
  display: grid;
  gap: 0.35rem;
  font-size: 0.86rem;
  font-weight: 750;
}

input, select, textarea {
  border: 1px solid rgba(0,0,0,0.1);
  border-radius: 16px;
  background: rgba(255,255,255,0.84);
  color: ${blueprint.palette.ink};
  padding: 0.78rem 0.85rem;
}

textarea {
  min-height: 5.5rem;
  resize: vertical;
}

.wide-field {
  grid-column: 1 / -1;
}

.actions, .mini-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1rem;
}

.workflow-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.workflow-list span, .status-chip {
  border-radius: 999px;
  background: ${blueprint.palette.soft};
  color: ${blueprint.palette.ink};
  font-size: 0.78rem;
  font-weight: 850;
  padding: 0.45rem 0.65rem;
}

.record-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.record-card {
  display: grid;
  gap: 0.7rem;
  padding: 1rem;
}

.record-topline {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.record-topline strong {
  font-size: 1.35rem;
}

.screen-panel {
  display: grid;
  gap: 1rem;
}

.screen-overview {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 0.95fr);
}

.overview-copy, .docs-summary, .revenue-total {
  background: linear-gradient(135deg, ${blueprint.palette.soft}, rgba(255,255,255,0.72));
  border-radius: 24px;
  padding: 1.1rem;
}

.mini-metric-grid {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mini-metric {
  background: rgba(255,255,255,0.76);
  border-radius: 20px;
  display: grid;
  gap: 0.35rem;
  padding: 0.9rem;
}

.mini-metric strong, .revenue-total {
  color: ${blueprint.palette.accent};
  font-size: 1.45rem;
  font-weight: 950;
}

.data-table-wrap {
  overflow-x: auto;
}

.data-table {
  border-collapse: collapse;
  min-width: 42rem;
  width: 100%;
}

.data-table th, .data-table td {
  border-bottom: 1px solid rgba(0,0,0,0.08);
  padding: 0.8rem;
  text-align: left;
}

.kanban-board {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kanban-column {
  background: rgba(255,255,255,0.72);
  border-radius: 22px;
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
}

.kanban-card {
  background: ${blueprint.palette.soft};
  border-radius: 16px;
  display: grid;
  gap: 0.25rem;
  padding: 0.75rem;
}

.people-roster, .package-grid, .issue-list, .schedule-list, .payment-list {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.person-card {
  align-items: flex-start;
  display: flex;
  gap: 0.85rem;
  padding: 1rem;
}

.avatar {
  align-items: center;
  background: ${blueprint.palette.accent};
  border-radius: 18px;
  color: white;
  display: grid;
  flex: 0 0 3rem;
  font-weight: 950;
  height: 3rem;
  place-items: center;
}

.person-card div:last-child, .package-card, .issue-card, .schedule-row, .payment-list p {
  display: grid;
  gap: 0.35rem;
}

.package-card, .issue-card, .schedule-row {
  padding: 1rem;
}

.revenue-layout {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(14rem, 0.45fr) minmax(0, 1fr);
}

.revenue-total span {
  color: ${blueprint.palette.ink};
  display: block;
  font-size: 0.9rem;
  font-weight: 750;
  margin-top: 0.35rem;
}

.payment-list p {
  background: rgba(255,255,255,0.72);
  border-radius: 18px;
  margin: 0;
  padding: 0.8rem;
}

.empty-state {
  border: 1px dashed rgba(0,0,0,0.16);
  border-radius: 22px;
  padding: 1.2rem;
}

.disclaimer {
  background: rgba(0,0,0,0.04);
  border-radius: 18px;
  margin-top: 1rem;
  padding: 0.9rem;
}

@media (max-width: 980px) {
  .app-shell, .hero, .control-grid, .metrics, .record-grid, .screen-overview, .kanban-board, .people-roster, .package-grid, .issue-list, .schedule-list, .revenue-layout, .payment-list {
    grid-template-columns: 1fr;
  }

  .sidebar {
    min-height: auto;
  }
}
`;
}

function createReactMiniProductReadme(blueprint: ReactProductBlueprint, prompt: string) {
  return `# ${blueprint.appName}

${blueprint.jobToBeDone}

## Source request
${prompt}

## What this app includes
- Product Intelligence Blueprint-driven React/Vite single-page app
- Sections: ${blueprint.sections.join(", ")}
- Local forms/actions that update state on this device
- Computed dashboard metrics
- Realistic fake sample data
- localStorage persistence with reset demo data

## Run instructions
Hassali does not install packages or start runtime automatically. After approval, use the future approved runtime flow to install and run Vite.

## Honest limitations
${blueprint.disclaimer}

No backend, auth, database, cloud sync, payment processing, public sharing, external API calls, or production authority is included.
`;
}

function createReactMiniProductArchitecture(blueprint: ReactProductBlueprint, prompt: string) {
  return `# ${blueprint.appName} Architecture

## Product Intelligence Blueprint
- Product identity: ${blueprint.appName}
- Target user: ${blueprint.targetUser}
- Job to be done: ${blueprint.jobToBeDone}
- Domain: ${blueprint.domain}
- Tone: ${blueprint.tone}
- First-10-seconds excitement gate: ${blueprint.excitementGate}

## Workflow map
${blueprint.workflowMap.map((item) => `- ${item}`).join("\n")}

## Record/state model
- Record label: ${blueprint.recordLabel}
- Status options: ${blueprint.statusOptions.join(", ")}
- Sample records are realistic but fake.

## Dashboard metrics
${blueprint.metricLabels.map((item) => `- ${item}`).join("\n")}

## Runtime and persistence
- React/Vite frontend
- localStorage for local demo persistence
- Reset demo data action
- No package install or runtime auto-start during approval

## Source request
${prompt}
`;
}

function createReactMiniProductDataModel(blueprint: ReactProductBlueprint) {
  return `# ${blueprint.appName} Data Model

## Product records
${blueprint.recordLabel} fields:
- title
- owner/client
- category
- amount
- status
- note

## Status/state model
${blueprint.statusOptions.map((status) => `- ${status}`).join("\n")}

## Dashboard metrics
${blueprint.metricLabels.map((metric) => `- ${metric}`).join("\n")}

## Sample data policy
All records are realistic but fake sample data. The app stores local demo records in localStorage only.

## Backend boundary
No database, auth, payment processing, public sharing, cloud sync, notifications, or real marketplace/tax authority is included in this phase.
`;
}

function createReactMiniProductSecurity(blueprint: ReactProductBlueprint) {
  return `# ${blueprint.appName} Security And Testing

## Safety boundaries
- No frontend API keys.
- No direct OpenAI, Anthropic, Gemini, payment, auth, or database calls from the browser.
- No real backend, cloud sync, public sharing, or marketplace/payment processing is claimed.
- localStorage is demo-only device-local persistence.
- ${blueprint.disclaimer}

## Testing checklist
- Verify tabs switch sections.
- Add a local record and confirm metrics update.
- Change record statuses and confirm filters work.
- Reset demo data.
- Confirm app remains usable if localStorage is unavailable.
`;
}

function createReactMiniProductContract(blueprint: ReactProductBlueprint) {
  return `# HASSALI.md

mode: CODE
Project Type: CODE
appType: react_single_page_app
framework: react_vite
previewType: code_app_preview
entryPoint: src/main.tsx
runtimePolicy: explicit_user_start_only
mutationPolicy: approval_required
dataPolicy: local_or_mock_only
backend: none

Product Intelligence Blueprint:
- Product identity: ${blueprint.appName}
- Target user: ${blueprint.targetUser}
- Job-to-be-done: ${blueprint.jobToBeDone}
- Sections: ${blueprint.sections.join(", ")}
- Metrics: ${blueprint.metricLabels.join(", ")}
- Local persistence: localStorage key ${blueprint.localStorageKey}
- Safety limitations: ${blueprint.disclaimer}
- User Excitement Gate: PASS - ${blueprint.excitementGate}

Quality Gates:
- Safety & Architecture Gate: PASS
- Product Quality Gate: PASS
- Visual Quality Gate: PASS
- User Excitement Gate: PASS

Contract role: human-readable project notes only; not machine state.
`;
}

export function generateCrmPythonStreamlitSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Hassali CRM";
  const brief = input.brief ?? null;

  return [
    {
      path: "app.py",
      summary: "Adds a Streamlit CRM dashboard scaffold with metrics, tables, and billing charts. No runtime command is executed.",
      content: `import pandas as pd
import streamlit as st

from data.mock_crm_data import activities, customers, invoices, metrics, pipeline


st.set_page_config(page_title="${escapePython(appName)}", page_icon="CRM", layout="wide")

st.sidebar.title("${escapePython(appName)}")
section = st.sidebar.radio(
    "Navigate",
    ["Dashboard", "Customers", "Pipeline", "Billing", "Activity"],
    index=0,
)
st.sidebar.caption("Python / Streamlit scaffold. Runtime requires approved Python flow.")

st.title("${escapePython(appName)}")
st.caption("Mock CRM data only. Auth, database, and payment providers are planned boundaries.")

if section == "Dashboard":
    cols = st.columns(4)
    for col, metric in zip(cols, metrics):
        col.metric(metric["label"], metric["value"], metric["delta"])

    st.subheader("Billing graphical representation")
    invoice_frame = pd.DataFrame(invoices)
    st.bar_chart(invoice_frame.set_index("month")["revenue"])

    st.subheader("Pipeline summary")
    st.dataframe(pd.DataFrame(pipeline), use_container_width=True, hide_index=True)

elif section == "Customers":
    st.subheader("Customer table")
    st.dataframe(pd.DataFrame(customers), use_container_width=True, hide_index=True)

elif section == "Pipeline":
    st.subheader("Pipeline by stage")
    pipeline_frame = pd.DataFrame(pipeline)
    st.bar_chart(pipeline_frame.set_index("stage")["value"])
    st.dataframe(pipeline_frame, use_container_width=True, hide_index=True)

elif section == "Billing":
    st.subheader("Billing and cost table")
    invoice_frame = pd.DataFrame(invoices)
    st.line_chart(invoice_frame.set_index("month")["revenue"])
    st.dataframe(invoice_frame, use_container_width=True, hide_index=True)
    st.info("Payment provider integration is planned. Do not add secrets client-side.")

else:
    st.subheader("Recent activity")
    for item in activities:
        st.write(f"- {item['timestamp']} · {item['type']}: {item['description']} ({item['related_id']})")
`
    },
    {
      path: "requirements.txt",
      summary: "Declares lightweight Python dashboard dependencies for future approved runtime use.",
      content: `streamlit
pandas
`
    },
    {
      path: "data/mock_crm_data.py",
      summary: "Adds mock CRM data for Streamlit dashboard metrics, customers, pipeline, billing, and activity.",
      content: `metrics = [
    {"label": "Active customers", "value": "1,248", "delta": "+8.4%"},
    {"label": "Pipeline value", "value": "$284K", "delta": "+12.1%"},
    {"label": "Monthly recurring billing", "value": "$42.8K", "delta": "+5.6%"},
    {"label": "Open invoices", "value": "37", "delta": "-3"},
]

customers = [
    {"customer_id": "C-1001", "name": "Apex Foods", "email": "ops@apex.example", "phone": "+92 300 1112222", "owner": "Sara", "plan": "Growth", "status": "Active", "value": 18400},
    {"customer_id": "C-1002", "name": "Northline Motors", "email": "sales@northline.example", "phone": "+92 300 3334444", "owner": "Bilal", "plan": "Enterprise", "status": "Negotiation", "value": 42600},
    {"customer_id": "C-1003", "name": "Pearl Clinics", "email": "admin@pearl.example", "phone": "+92 300 5556666", "owner": "Mina", "plan": "Starter", "status": "Onboarding", "value": 7200},
    {"customer_id": "C-1004", "name": "Metro Retail", "email": "team@metro.example", "phone": "+92 300 7778888", "owner": "Hamza", "plan": "Growth", "status": "Active", "value": 23100},
]

pipeline = [
    {"deal_id": "D-2001", "title": "Apex renewal", "stage": "Leads", "status": "New", "customer_id": "C-1001", "deals": 42, "value": 76000},
    {"deal_id": "D-2002", "title": "Northline rollout", "stage": "Qualified", "status": "Qualified", "customer_id": "C-1002", "deals": 21, "value": 94000},
    {"deal_id": "D-2003", "title": "Pearl onboarding", "stage": "Proposal", "status": "Proposal sent", "customer_id": "C-1003", "deals": 13, "value": 68000},
    {"deal_id": "D-2004", "title": "Metro expansion", "stage": "Won", "status": "Won", "customer_id": "C-1004", "deals": 8, "value": 46000},
]

invoices = [
    {"number": "INV-3001", "customer_id": "C-1001", "month": "Jan", "date": "2026-01-31", "amount": 28600, "status": "Paid", "revenue": 28600, "cost": 7400, "open_invoices": 19},
    {"number": "INV-3002", "customer_id": "C-1002", "month": "Feb", "date": "2026-02-28", "amount": 31800, "status": "Open", "revenue": 31800, "cost": 8100, "open_invoices": 22},
    {"number": "INV-3003", "customer_id": "C-1003", "month": "Mar", "date": "2026-03-31", "amount": 35400, "status": "Sent", "revenue": 35400, "cost": 8600, "open_invoices": 17},
    {"number": "INV-3004", "customer_id": "C-1004", "month": "Apr", "date": "2026-04-30", "amount": 42800, "status": "Paid", "revenue": 42800, "cost": 9300, "open_invoices": 13},
]

activities = [
    {"type": "call", "description": "Sara logged a renewal call with Apex Foods.", "timestamp": "2026-04-28T10:15:00Z", "related_id": "C-1001"},
    {"type": "billing", "description": "Billing follow-up scheduled for Northline Motors.", "timestamp": "2026-04-28T12:00:00Z", "related_id": "INV-3002"},
    {"type": "onboarding", "description": "Pearl Clinics completed onboarding checklist.", "timestamp": "2026-04-29T09:20:00Z", "related_id": "C-1003"},
    {"type": "pipeline", "description": "Metro Retail requested pipeline export review.", "timestamp": "2026-04-29T14:35:00Z", "related_id": "D-2004"},
]
`
    },
    {
      path: "README.md",
      summary: "Explains the Python CRM scaffold and approved-runtime boundary.",
      content: `# ${appName}

Python / Streamlit CRM dashboard scaffold generated from:

${input.prompt}

## What is included

- Dashboard metrics
- Customer table
- Pipeline summary
- Billing and cost table
- Graphical revenue and pipeline charts
- Mock data in data/mock_crm_data.py

## Runtime boundary

Hassali does not install packages or start Python automatically. Running Streamlit requires a future approved Python runtime flow.
`
    },
    {
      path: "ARCHITECTURE.md",
      summary: "Creates architecture guidance for the Python CRM app.",
      content: `# ${appName} Architecture

Project Type: CODE
Stack: Python / Streamlit
Domain: CRM System
Preview Type: python_app_preview

The current prompt outranks stale project contracts or previous frontend scaffolds.

## Modules

- Streamlit dashboard shell
- Metrics overview
- Customer table
- Pipeline summary
- Billing and revenue charts
- Mock CRM data module

## Planned boundaries

- Auth is not implemented in this phase.
- Database persistence is not implemented in this phase.
- Payment provider integration is not implemented in this phase.
- Runtime execution requires explicit approval and Python runtime support.
`
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: "Adds safety and verification notes for the Python CRM scaffold.",
      content: `# ${appName} Security And Testing

- Keep credentials and payment provider secrets out of client-visible files.
- Treat mock CRM data as preview-only.
- Add ownership checks before future database writes.
- Do not auto-install packages.
- Do not auto-start Streamlit.
- Verify future Python runtime support through an approved runtime flow.
`
    },
    {
      path: "HASSALI.md",
      summary: "Adds the human-readable project contract for the Python CRM scaffold.",
      content: `# HASSALI.md

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "crm"}
domainId: ${brief?.domainId ?? "crm_software"}
Stack: Python / Streamlit
requestedStack: ${brief?.requestedStack ?? "python"}
preferredFramework: ${brief?.preferredFramework ?? "streamlit"}
Domain: CRM System
Preview Type: python_app_preview
previewStrategy: ${brief?.previewStrategy ?? "python_streamlit_summary_until_runtime_enabled"}
runtimePolicy: explicit_user_start_only

Current prompt outranks stale contract memory.

Files:
- app.py: Streamlit CRM dashboard shell
- requirements.txt: Lightweight Python dependencies
- data/mock_crm_data.py: CRM mock entities and metrics
- README.md: Runtime boundary notes
- ARCHITECTURE.md: Module and architecture notes
- SECURITY_AND_TESTING.md: Safety notes

modulesIncluded: ${(brief?.modules ?? ["dashboard", "customers", "pipeline", "billing", "activity"]).join(", ")}
entitiesIncluded: ${(brief?.entities ?? ["customer", "deal", "invoice", "activity"]).join(", ")}
filePlan:
${(brief?.filePlan ?? []).map((file) => `- ${file.path}: ${file.purpose}`).join("\n") || "- app.py: Streamlit CRM dashboard\n- data/mock_crm_data.py: CRM mock data"}
nonGoals:
${(brief?.nonGoals ?? ["No package install during approval.", "No runtime process auto-start."]).map((note) => `- ${note}`).join("\n")}

Runtime:
- Python runtime is not auto-started.
- Package installation requires future explicit approval.
- Preview should be honest if Python runtime support is unavailable.
`
    }
  ];
}

export function generateMobilePhoneInventoryStreamlitSource(input: {
  appName: string;
  brief?: CodeGenerationBrief | null;
  prompt: string;
}): CodeAppSourceFile[] {
  const appName = input.appName || "Phone Inventory";
  const brief = input.brief ?? null;

  return [
    {
      path: "app.py",
      summary: "Adds a Streamlit inventory management dashboard for a mobile phone shop. No runtime command is executed.",
      content: `import pandas as pd
import streamlit as st

from data.mock_inventory_data import billing, products, repair_tickets, sales, stock, suppliers


st.set_page_config(page_title="${escapePython(appName)}", page_icon="PHONE", layout="wide")

st.sidebar.title("${escapePython(appName)}")
section = st.sidebar.radio(
    "Navigate",
    ["Dashboard", "Products", "Stock", "Sales", "Repairs", "Billing"],
    index=0,
)
st.sidebar.caption("Inventory management software for a mobile phone shop. Runtime requires approved Python flow.")

st.title("${escapePython(appName)}")
st.caption("Mobile phone inventory software with mock data for products, stock, suppliers, sales, repairs, and billing.")

products_frame = pd.DataFrame(products)
stock_frame = pd.DataFrame(stock)
sales_frame = pd.DataFrame(sales)
repair_frame = pd.DataFrame(repair_tickets)
billing_frame = pd.DataFrame(billing)

if section == "Dashboard":
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("Products", len(products_frame), "+12")
    col2.metric("Units in stock", int(stock_frame["quantity"].sum()), "+34")
    col3.metric("Sales amount", f"\${int(sales_frame['amount'].sum()):,}", "+9%")
    col4.metric("Open repairs", int((repair_frame["status"] != "Closed").sum()), "-2")
    st.subheader("Billing graphical representation")
    st.bar_chart(billing_frame.set_index("month")["amount"])
    st.subheader("Low stock watch")
    st.dataframe(stock_frame[stock_frame["quantity"] <= stock_frame["reorder_level"]], use_container_width=True, hide_index=True)

elif section == "Products":
    st.subheader("Product catalog")
    st.dataframe(products_frame, use_container_width=True, hide_index=True)

elif section == "Stock":
    st.subheader("Stock by location")
    st.dataframe(stock_frame, use_container_width=True, hide_index=True)
    st.bar_chart(stock_frame.set_index("location")["quantity"])

elif section == "Sales":
    st.subheader("Sales transactions")
    st.dataframe(sales_frame, use_container_width=True, hide_index=True)

elif section == "Repairs":
    st.subheader("Repair and service tickets")
    st.dataframe(repair_frame, use_container_width=True, hide_index=True)

else:
    st.subheader("Billing")
    st.line_chart(billing_frame.set_index("month")["amount"])
    st.dataframe(billing_frame, use_container_width=True, hide_index=True)
    st.info("Payment provider integration is planned. Do not add secrets client-side.")
`
    },
    {
      path: "requirements.txt",
      summary: "Declares lightweight Python inventory dashboard dependencies for future approved runtime use.",
      content: `streamlit
pandas
`
    },
    {
      path: "data/mock_inventory_data.py",
      summary: "Adds mock mobile phone shop inventory data for products, stock, suppliers, sales, repairs, and billing.",
      content: `products = [
    {"product_id": "P-1001", "brand": "Apple", "model": "iPhone 15", "color": "Black", "storage": "128GB", "price": 799, "category": "smartphone"},
    {"product_id": "P-1002", "brand": "Samsung", "model": "Galaxy S24", "color": "Silver", "storage": "256GB", "price": 849, "category": "smartphone"},
    {"product_id": "P-1003", "brand": "Xiaomi", "model": "Redmi Note", "color": "Blue", "storage": "128GB", "price": 269, "category": "Android phone"},
    {"product_id": "P-1004", "brand": "Anker", "model": "Fast Charger", "color": "White", "storage": "N/A", "price": 29, "category": "accessory"},
]

stock = [
    {"product_id": "P-1001", "quantity": 18, "location": "Main shelf", "reorder_level": 8},
    {"product_id": "P-1002", "quantity": 11, "location": "Premium cabinet", "reorder_level": 6},
    {"product_id": "P-1003", "quantity": 25, "location": "Android shelf", "reorder_level": 10},
    {"product_id": "P-1004", "quantity": 5, "location": "Accessories wall", "reorder_level": 12},
]

suppliers = [
    {"supplier_id": "S-2001", "name": "Metro Devices", "contact": "orders@metrodevices.example", "lead_time": "3 days"},
    {"supplier_id": "S-2002", "name": "Accessory Hub", "contact": "supply@accessoryhub.example", "lead_time": "2 days"},
]

sales = [
    {"sale_id": "SA-3001", "product_id": "P-1001", "quantity": 2, "date": "2026-04-12", "amount": 1598},
    {"sale_id": "SA-3002", "product_id": "P-1002", "quantity": 1, "date": "2026-04-13", "amount": 849},
    {"sale_id": "SA-3003", "product_id": "P-1004", "quantity": 8, "date": "2026-04-14", "amount": 232},
]

repair_tickets = [
    {"ticket_id": "R-4001", "device": "iPhone 14", "issue": "screen replacement", "status": "In progress", "technician": "Amina"},
    {"ticket_id": "R-4002", "device": "Galaxy A54", "issue": "battery check", "status": "Waiting parts", "technician": "Bilal"},
    {"ticket_id": "R-4003", "device": "Redmi Note", "issue": "charging port", "status": "Closed", "technician": "Sara"},
]

billing = [
    {"invoice_id": "B-5001", "month": "Jan", "amount": 4200, "status": "Paid"},
    {"invoice_id": "B-5002", "month": "Feb", "amount": 5200, "status": "Paid"},
    {"invoice_id": "B-5003", "month": "Mar", "amount": 6100, "status": "Open"},
    {"invoice_id": "B-5004", "month": "Apr", "amount": 6900, "status": "Open"},
]
`
    },
    {
      path: "README.md",
      summary: "Explains the mobile phone inventory software scaffold and approved-runtime boundary.",
      content: `# ${appName}

Inventory management software for a mobile phone shop.

Generated from:

${input.prompt}

## Included modules

- Dashboard metrics
- Products
- Stock and reorder tracking
- Suppliers
- Sales
- Repair and service tickets
- Billing charts and tables

## Runtime boundary

Hassali does not install packages or start Python automatically. Running Streamlit requires a future approved Python runtime flow.
`
    },
    {
      path: "ARCHITECTURE.md",
      summary: "Creates architecture guidance for the mobile phone inventory software.",
      content: `# ${appName} Architecture

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "inventory_system"}
domainId: ${brief?.domainId ?? "mobile_phone_shop"}
Stack: Python / Streamlit
Preview Type: python_app_preview

This is inventory management software for a mobile phone shop, not promotional brochure output.

## Modules

- Dashboard
- Products
- Stock
- Sales
- Suppliers
- Repairs / service tickets
- Billing

## Entities

- product
- brand
- stock
- supplier
- sale
- repairTicket
- invoice

## Planned boundaries

- Auth is not implemented in this phase.
- Database persistence is not implemented in this phase.
- Payment provider integration is not implemented in this phase.
- Runtime execution requires explicit approval and Python runtime support.
`
    },
    {
      path: "SECURITY_AND_TESTING.md",
      summary: "Adds safety and verification notes for the inventory scaffold.",
      content: `# ${appName} Security And Testing

- Keep supplier, payment, and customer credentials out of generated files.
- Treat mock inventory data as preview-only.
- Add ownership checks before future database writes.
- Do not auto-install packages.
- Do not auto-start Streamlit.
- Verify future Python runtime support through an approved runtime flow.
`
    },
    {
      path: "HASSALI.md",
      summary: "Adds the human-readable CODE contract for the mobile phone inventory software.",
      content: `# HASSALI.md

mode: CODE
Project Type: CODE
appType: ${brief?.appType ?? "inventory_system"}
domainId: ${brief?.domainId ?? "mobile_phone_shop"}
requestedStack: ${brief?.requestedStack ?? "unknown"}
preferredFramework: ${brief?.preferredFramework ?? "streamlit"}
Stack: Python / Streamlit
Domain: Mobile Phone Shop
Project description: Inventory management software for a mobile phone shop
Preview Type: python_app_preview
previewStrategy: ${brief?.previewStrategy ?? "python_streamlit_summary_until_runtime_enabled"}
runtimePolicy: explicit_user_start_only

Current prompt outranks stale contract memory.

modulesIncluded: ${(brief?.modules ?? ["dashboard", "products", "stock", "sales", "suppliers", "repairs", "billing"]).join(", ")}
entitiesIncluded: ${(brief?.entities ?? ["product", "brand", "stock", "supplier", "sale", "repairTicket", "invoice"]).join(", ")}

filePlan:
${(brief?.filePlan ?? []).map((file) => `- ${file.path}: ${file.purpose}`).join("\n") || "- app.py: Streamlit inventory dashboard\n- data/mock_inventory_data.py: inventory mock data"}

nonGoals:
${(brief?.nonGoals ?? ["No package install during approval.", "No runtime process auto-start.", "No promotional brochure substitution."]).map((note) => `- ${note.replace(/public marketing website/gi, "promotional brochure").replace(/\bwebsite\b/gi, "brochure")}`).join("\n")}

Runtime:
- Python runtime is not auto-started.
- Package installation requires future explicit approval.
- Preview should be summary-only unless Python runtime support is explicitly approved.
`
    }
  ];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hassali-crm";
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapePython(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
