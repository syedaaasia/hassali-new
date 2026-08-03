import {
  type CodeIntentContract,
  type WebsiteIntentContract
} from "@/lib/server/ai/industry-taxonomy";
import type { GeneratorContract } from "@/lib/server/ai/generator-contract";
import { classifyWebsiteRequestScope } from "@/lib/server/ai/website-edit-intent";

export type WebsiteGenerationRequestScope = "full_generation" | "full_replacement";

export type WebsiteGenerationContractIssue = {
  code: "GEN001" | "GEN002" | "STRUCT001";
  message: string;
};

export type WebsiteGenerationContractAssertion = {
  generatedFileCount: number;
  issues: WebsiteGenerationContractIssue[];
  normalizedActionCount: number;
  passed: boolean;
  repairInputCount: number;
  requiredFiles: string[];
  validatorInputCount: number;
};

export type WebsiteGenerationBrief = WebsiteIntentContract & {
  contentTone: string;
  conversionGoal: string;
  footerContract: {
    contactLanguage: string;
    proofLanguage: string;
  };
  hassaliMetadata: {
    correctedTypos: WebsiteIntentContract["correctedTypos"];
    ctaPatterns: string[];
    displayName: string;
    domainId: WebsiteIntentContract["domainId"];
    exactPageCount: number | null;
    expectedVocabulary: string[];
    generatorBriefSummary: string;
    mode: "WEBSITE";
    previewPolicy: "static srcDoc only";
    requestedPages: string[];
    requiredFiles: string[];
    runtimePolicy: "no runtime for static websites";
    safetyNotes: string[];
    trustSignals: string[];
  };
  navigationContract: Array<{
    href: string;
    label: string;
    page: string;
  }>;
  proofElements: string[];
  requestScope: WebsiteGenerationRequestScope;
  ctaPatterns: string[];
};

export type CodeGenerationBrief = CodeIntentContract & {
  filePlan: Array<{
    path: string;
    purpose: string;
  }>;
  hassaliMetadata: {
    appType: string;
    domainId: CodeIntentContract["domainId"];
    entitiesIncluded: string[];
    filePlan: Array<{
      path: string;
      purpose: string;
    }>;
    mode: "CODE";
    modulesIncluded: string[];
    nonGoals: string[];
    preferredFramework: CodeIntentContract["preferredFramework"];
    previewStrategy: CodeIntentContract["previewStrategy"];
    requestedStack: CodeIntentContract["requestedStack"];
    runtimePolicy: "explicit_user_start_only";
    safetyNotes: string[];
  };
  installPolicy: "no_auto_install";
  nonGoals: string[];
  productBrief: CodeProductBrief;
};

export type CodeProductBrief = {
  complexity: "complex" | "moderate" | "simple";
  coreActions: string[];
  expectedDataModel: string[];
  expectedScreens: string[];
  explicitConstraints: string[];
  nonGoals: string[];
  optionalFeatures: string[];
  primaryEntity: string;
  productType: string;
  requiredFeatures: string[];
  userGoal: string;
};

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim();

  if (normalized === "home" || normalized === "index") return "index.html";
  if (normalized === "blogs") return "blog.html";

  return `${normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"}.html`;
}

function pageLabel(page: string) {
  if (page === "home") return "Home";
  if (page === "blogs" || page === "blog") return "Blog";

  return titleCase(page);
}

function conversionGoalFor(contract: WebsiteIntentContract) {
  if (contract.domainId === "upholstery") return "turn furniture restoration interest into estimate requests";
  if (contract.domainId === "mobile_phone_shop") return "help shoppers compare phones, accessories, repairs, and support";
  if (contract.domainId === "toy_store") return "help families browse toys, age groups, gift picks, delivery, returns, and checkout confidence";
  if (contract.domainId === "car_rental") return "turn visitors into rental reservations and fleet inquiries";
  if (contract.domainId === "seafood_restaurant") return "drive menu exploration, reservations, and dining inquiries";

  return "turn visitors into clear, domain-specific inquiries";
}

function contentToneFor(contract: WebsiteIntentContract) {
  if (contract.visualStyleHints.length) return contract.visualStyleHints.slice(0, 3).join(", ");

  return "calm, specific, premium, and practical";
}

export function buildWebsiteGenerationBrief(contract: WebsiteIntentContract): WebsiteGenerationBrief {
  const requestedPages = contract.requestedPages.length ? contract.requestedPages : ["home", "about", "contact"];
  const requiredFiles = contract.requiredFiles.length
    ? contract.requiredFiles
    : [...requestedPages.map(pageToPath), "styles.css", "main.js", "HASSALI.md"];
  const ctaPatterns = contract.ctas.length ? contract.ctas : ["Contact us"];
  const proofElements = contract.trustSignals.length
    ? contract.trustSignals
    : contract.expectedVocabulary.slice(0, 3);
  const navigationContract = requestedPages.map((page) => ({
    href: `./${pageToPath(page)}`,
    label: pageLabel(page),
    page: page === "blogs" ? "blog" : page
  }));
  const conversionGoal = conversionGoalFor(contract);
  const classifiedScope = classifyWebsiteRequestScope(contract.originalPrompt);
  const requestScope: WebsiteGenerationRequestScope = classifiedScope === "full_replacement"
    ? "full_replacement"
    : "full_generation";

  return {
    ...contract,
    contentTone: contentToneFor(contract),
    conversionGoal,
    ctaPatterns,
    footerContract: {
      contactLanguage: ctaPatterns[0] ?? "Contact us",
      proofLanguage: proofElements[0] ?? contract.displayName
    },
    hassaliMetadata: {
      correctedTypos: contract.correctedTypos,
      ctaPatterns,
      displayName: contract.displayName,
      domainId: contract.domainId,
      exactPageCount: contract.exactPageCount,
      expectedVocabulary: contract.expectedVocabulary,
      generatorBriefSummary: `${contract.displayName} website with ${requestedPages.map(pageLabel).join(", ")} pages derived from the current prompt contract.`,
      mode: "WEBSITE",
      previewPolicy: "static srcDoc only",
      requestedPages,
      requiredFiles,
      runtimePolicy: "no runtime for static websites",
      safetyNotes: [
        "Current prompt contract outranks stale HASSALI.md or previous project files.",
        "Generate exactly the requested HTML pages and no unrequested public pages.",
        "Do not emit placeholder, generic, unknown, or conflicting-domain copy."
      ],
      trustSignals: proofElements
    },
    navigationContract,
    proofElements,
    requestScope,
    requestedPages,
    requiredFiles
  };
}

function samePaths(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  return leftSet.size === rightSet.size && [...leftSet].every((path) => rightSet.has(path));
}

export function assertWebsiteGenerationContract(input: {
  brief: WebsiteGenerationBrief;
  generatedFiles: Record<string, string>;
  generatorContract?: GeneratorContract;
  normalizedFiles: Record<string, string>;
}): WebsiteGenerationContractAssertion {
  const generatedPaths = Object.keys(input.generatedFiles);
  const normalizedPaths = Object.keys(input.normalizedFiles);
  const requiredFiles = input.brief.requiredFiles;

  if (generatedPaths.length === 0 || normalizedPaths.length === 0) {
    return {
      generatedFileCount: generatedPaths.length,
      issues: [{
        code: "GEN001",
        message: "The WEBSITE generator returned zero file changes before validation."
      }],
      normalizedActionCount: normalizedPaths.length,
      passed: false,
      repairInputCount: normalizedPaths.length,
      requiredFiles,
      validatorInputCount: normalizedPaths.length
    };
  }

  const issues: WebsiteGenerationContractIssue[] = [];
  const contractFiles = input.generatorContract?.requiredFileStrategy ?? requiredFiles;

  if (!samePaths(requiredFiles, contractFiles)) {
    issues.push({
      code: "GEN002",
      message: "The canonical WEBSITE required-file list diverged from the generator contract."
    });
  }

  for (const path of requiredFiles) {
    if (!(path in input.normalizedFiles)) {
      issues.push({
        code: "STRUCT001",
        message: `Missing prompt-required file: ${path}.`
      });
    }
  }

  return {
    generatedFileCount: generatedPaths.length,
    issues,
    normalizedActionCount: normalizedPaths.length,
    passed: issues.length === 0,
    repairInputCount: normalizedPaths.length,
    requiredFiles,
    validatorInputCount: normalizedPaths.length
  };
}

function buildCodeProductBrief(contract: CodeIntentContract): CodeProductBrief {
  const prompt = contract.originalPrompt.toLowerCase();
  const explicitConstraints = Array.from(
    contract.originalPrompt.matchAll(/\b(?:do not|don't|dont|without|no)\s+([^.!?\n]{2,100})/gi)
  ).map((match) => match[1].trim());
  const base = {
    explicitConstraints,
    optionalFeatures: [] as string[]
  };

  const taskProductRequested = /\b(?:todo|to-do|task list|task manager)\b/i.test(prompt);
  const advancedTaskSignals = [
    /\bkanban\b/i.test(prompt) ? "kanban board" : null,
    /\bboards?\b/i.test(prompt) ? "project boards" : null,
    /\bassignees?\b/i.test(prompt) ? "assignees" : null,
    /\bdue dates?\b/i.test(prompt) ? "due dates" : null,
    /\bcollaborat(?:e|ion|ive)\b/i.test(prompt) ? "collaboration" : null,
    /\bteams?\b/i.test(prompt) ? "team members" : null
  ].filter(Boolean) as string[];

  if (taskProductRequested && advancedTaskSignals.length > 0) {
    return {
      ...base,
      complexity: "complex",
      coreActions: ["create task", "assign task", "move task across board", "track due date"],
      expectedDataModel: ["task: id, title, status, assignee, due date", "board: id, name, columns"],
      expectedScreens: ["project board", "tasks", "team"],
      nonGoals: ["CRM sales pipeline", "invoices", "inventory", "unrequested accounting"],
      optionalFeatures: ["local persistence"],
      primaryEntity: "task",
      productType: "task_management",
      requiredFeatures: Array.from(new Set(["task creation", ...advancedTaskSignals])),
      userGoal: "Coordinate tasks across boards, owners, and due dates without unrelated business modules."
    };
  }

  if (taskProductRequested) {
    return {
      ...base,
      complexity: "simple",
      coreActions: ["create task", "complete or reopen task", "delete task"],
      expectedDataModel: ["task: id, title, completed"],
      expectedScreens: ["tasks"],
      nonGoals: ["CRM", "clients", "invoices", "payments", "business metrics", "workflow board", "admin settings"],
      optionalFeatures: ["active/completed filter", "local persistence"],
      primaryEntity: "task",
      productType: "todo_app",
      requiredFeatures: ["task input", "task list", "completion toggle", "delete action"],
      userGoal: "Capture small tasks and mark them complete without business-dashboard overhead."
    };
  }

  if (/\bcalculator\b/i.test(prompt) && /\b(?:scientific|trigonometry|trigonometric|sin|cos|tan|logarithm|history|graphing)\b/i.test(prompt)) {
    return {
      ...base,
      complexity: "moderate",
      coreActions: ["enter a value", "apply arithmetic or trigonometric operation", "review calculation history", "clear result"],
      expectedDataModel: ["calculation: expression, result, timestamp"],
      expectedScreens: ["scientific calculator", "calculation history"],
      nonGoals: ["CRM", "clients", "invoices", "inventory", "business dashboard"],
      primaryEntity: "calculation",
      productType: "scientific_calculator",
      requiredFeatures: ["numeric input", "basic arithmetic", "sin/cos/tan", "square root", "calculation history"],
      userGoal: "Perform arithmetic and common scientific calculations with visible history."
    };
  }

  if (/\bcalculator\b/i.test(prompt)) {
    return {
      ...base,
      complexity: "simple",
      coreActions: ["enter values", "choose an arithmetic operation", "clear the result"],
      expectedDataModel: ["calculation: expression, result"],
      expectedScreens: ["calculator"],
      nonGoals: ["CRM", "clients", "invoices", "business dashboard", "analytics"],
      primaryEntity: "calculation",
      productType: "calculator",
      requiredFeatures: ["numeric keypad", "basic arithmetic", "clear action", "result display"],
      userGoal: "Perform basic arithmetic quickly in a focused interface."
    };
  }

  if (/\b(?:pomodoro|focus timer|work timer)\b/i.test(prompt)) {
    return {
      ...base,
      complexity: "simple",
      coreActions: ["start timer", "pause timer", "reset timer"],
      expectedDataModel: ["timer: duration, remaining seconds, running state"],
      expectedScreens: ["focus timer"],
      nonGoals: ["CRM", "clients", "billing", "business metrics", "admin settings"],
      primaryEntity: "focus session",
      productType: "pomodoro_timer",
      requiredFeatures: ["25-minute timer", "start", "pause", "reset"],
      userGoal: "Run a focused work interval with clear timer controls."
    };
  }

  if (
    /\b(?:finance|financial|money)\b/i.test(prompt) &&
    /\b(?:dashboard|tracker|app|tool)\b/i.test(prompt) &&
    /\b(?:income|expense|balance|cash flow|transaction)\b/i.test(prompt)
  ) {
    return {
      ...base,
      complexity: "moderate",
      coreActions: ["add income", "add expense", "review monthly balance", "filter transactions"],
      expectedDataModel: ["transaction: id, description, amount, type, category, date, status"],
      expectedScreens: ["dashboard", "income", "expenses", "monthly overview", "transactions"],
      nonGoals: ["CRM", "sales pipeline", "inventory", "tax filing authority", "bank integration"],
      primaryEntity: "transaction",
      productType: "finance_dashboard",
      requiredFeatures: ["income total", "expense total", "monthly balance", "transaction form", "transaction list"],
      userGoal: "Track local income and expenses and understand the current monthly balance."
    };
  }

  if (/\b(?:expense tracker|spending tracker|track expenses)\b/i.test(prompt)) {
    return {
      ...base,
      complexity: "simple",
      coreActions: ["add expense", "review total", "delete expense"],
      expectedDataModel: ["expense: id, description, amount, category"],
      expectedScreens: ["expenses"],
      nonGoals: ["CRM", "sales pipeline", "inventory", "client management"],
      primaryEntity: "expense",
      productType: "expense_tracker",
      requiredFeatures: ["expense form", "expense list", "running total", "delete action"],
      userGoal: "Record everyday expenses and see the current total."
    };
  }

  if (/\b(?:restaurant ordering|food ordering|menu ordering|order food)\b/i.test(prompt)) {
    return {
      ...base,
      complexity: "moderate",
      coreActions: ["browse menu", "add item to order", "change quantity", "review total"],
      expectedDataModel: ["menu item: id, name, price", "order line: item id, quantity"],
      expectedScreens: ["menu", "current order"],
      nonGoals: ["CRM", "inventory purchasing", "supplier dashboard", "unrequested delivery backend"],
      primaryEntity: "order",
      productType: "restaurant_ordering",
      requiredFeatures: ["menu", "add-to-order action", "quantity controls", "order total"],
      userGoal: "Build and review a restaurant order from a clear menu."
    };
  }

  if (contract.appType === "crm" || /\bcrm\b|customer relationship|sales pipeline/i.test(prompt)) {
    return {
      ...base,
      complexity: "complex",
      coreActions: ["manage contacts", "track deals", "record interactions", "manage client-linked billing"],
      expectedDataModel: ["contact", "company", "deal", "activity", "invoice"],
      expectedScreens: contract.screens,
      nonGoals: ["inventory-first stock management", "unrelated supplier purchasing"],
      primaryEntity: "contact",
      productType: "crm",
      requiredFeatures: contract.modules,
      userGoal: "Manage customer relationships and move opportunities through a sales pipeline."
    };
  }

  if (contract.appType === "inventory_system") {
    return {
      ...base,
      complexity: "complex",
      coreActions: ["manage products", "update stock", "record sales and purchases", "review low-stock alerts"],
      expectedDataModel: contract.entities,
      expectedScreens: contract.screens,
      nonGoals: ["CRM-first sales pipeline", "unrequested customer relationship workflows"],
      primaryEntity: "product",
      productType: "inventory_system",
      requiredFeatures: contract.modules,
      userGoal: "Track products, stock movement, suppliers, and related operational records."
    };
  }

  return {
    ...base,
    complexity: contract.modules.length >= 5 ? "complex" : "moderate",
    coreActions: contract.requestedFeatures.length ? contract.requestedFeatures : ["create record", "review records"],
    expectedDataModel: contract.entities.length ? contract.entities : ["domain record"],
    expectedScreens: contract.screens,
    nonGoals: ["unrequested CRM", "unrequested inventory", "unrequested billing", "generic business metrics"],
    primaryEntity: contract.entities[0] ?? "record",
    productType: contract.appType,
    requiredFeatures: contract.requestedFeatures,
    userGoal: `Support the requested ${contract.appType.replace(/_/g, " ")} workflow without adding unrelated product domains.`
  };
}

function codeFilePlan(contract: CodeIntentContract, productBrief: CodeProductBrief) {
  const wantsInventory = contract.appType === "inventory_system" || contract.modules.some((moduleName) => ["products", "stock", "sales", "suppliers", "repairs"].includes(moduleName));
  const pythonFiles = wantsInventory
    ? [
        ["app.py", "Streamlit inventory dashboard with products, stock, sales, repairs, and billing screens."],
        ["requirements.txt", "Lightweight Python dependencies for future approved runtime use."],
        ["data/mock_inventory_data.py", "Domain-plausible mobile phone inventory, supplier, sale, repair, and billing mock data."],
        ["README.md", "Operator-facing setup and runtime boundary notes."],
        ["ARCHITECTURE.md", "Software architecture, entities, modules, and safety boundaries."],
        ["SECURITY_AND_TESTING.md", "Security and test notes for future implementation."],
        ["HASSALI.md", "Human-readable CODE contract generated from the current prompt."]
      ]
    : [
        ["app.py", "Streamlit CRM dashboard with metrics, customers, pipeline, billing, and activity screens."],
        ["requirements.txt", "Lightweight Python dependencies for future approved runtime use."],
        ["data/mock_crm_data.py", "CRM mock data for customers, deals, invoices, and activity."],
        ["README.md", "Operator-facing setup and runtime boundary notes."],
        ["ARCHITECTURE.md", "Software architecture, entities, modules, and safety boundaries."],
        ["SECURITY_AND_TESTING.md", "Security and test notes for future implementation."],
        ["HASSALI.md", "Human-readable CODE contract generated from the current prompt."]
      ];
  const reactFiles = productBrief.complexity === "simple"
    ? [
        ["package.json", "Vite React package metadata. No install is executed."],
        ["vite.config.ts", "Vite React configuration for future approved runtime preview."],
        ["index.html", "Vite app entry shell, not a public marketing website."],
        ["src/main.tsx", "React entry point."],
        ["src/App.tsx", `Focused ${productBrief.productType.replace(/_/g, " ")} interaction.`],
        ["src/styles.css", "Focused responsive application styles."],
        ["HASSALI.md", "Human-readable CODE contract generated from the current prompt."]
      ]
    : [
    ["package.json", "Vite React package metadata. No install is executed."],
    ["vite.config.ts", "Vite React configuration for future approved runtime preview."],
    ["index.html", "Vite app entry shell, not a public marketing website."],
    ["src/main.tsx", "React entry point."],
    ["src/App.tsx", "Application composition."],
    ["src/styles.css", "Application styles."],
    ["src/lib/mock-data.ts", "Domain-plausible mock data."],
    ["ARCHITECTURE.md", "Software architecture notes."],
    ["DATA_MODEL.md", "Data model notes."],
    ["SECURITY_AND_TESTING.md", "Security and testing notes."],
    ["HASSALI.md", "Human-readable CODE contract generated from the current prompt."]
      ];
  const rows = contract.preferredFramework === "streamlit" || contract.requestedStack === "python"
    ? pythonFiles
    : reactFiles;

  return rows.map(([path, purpose]) => ({ path, purpose }));
}

export function buildCodeGenerationBrief(contract: CodeIntentContract): CodeGenerationBrief {
  const productBrief = buildCodeProductBrief(contract);
  const filePlan = codeFilePlan(contract, productBrief);
  const selectedStreamlit = contract.preferredFramework === "streamlit" || contract.requestedStack === "python";
  const nonGoals = [
    ...productBrief.nonGoals,
    "No package install during proposal approval.",
    "No runtime process auto-start.",
    "No secrets in generated client-visible files.",
    "No public marketing website substitution for CODE mode."
  ];

  return {
    ...contract,
    filePlan,
    hassaliMetadata: {
      appType: contract.appType,
      domainId: contract.domainId,
      entitiesIncluded: contract.entities,
      filePlan,
      mode: "CODE",
      modulesIncluded: contract.modules,
      nonGoals,
      preferredFramework: selectedStreamlit ? "streamlit" : contract.preferredFramework,
      previewStrategy: selectedStreamlit
        ? "python_streamlit_summary_until_runtime_enabled"
        : contract.previewStrategy,
      requestedStack: contract.requestedStack,
      runtimePolicy: "explicit_user_start_only",
      safetyNotes: [
        "Current prompt contract outranks stale HASSALI.md or previous project files.",
        "Generated files must match the requested stack and app type.",
        "Runtime and package installation require explicit future approval."
      ]
    },
    installPolicy: "no_auto_install",
    nonGoals,
    productBrief,
    preferredFramework: selectedStreamlit ? "streamlit" : contract.preferredFramework,
    previewStrategy: selectedStreamlit
      ? "python_streamlit_summary_until_runtime_enabled"
      : contract.previewStrategy
  };
}
