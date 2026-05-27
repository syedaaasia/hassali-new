type RuntimeContextInput = {
  error?: string | null;
  logs?: string[];
  previewUrl?: string | null;
  status?: string;
};

type WorkspaceContextInput = {
  activeFileContent: string;
  activePath: string;
  fileContents?: Record<string, string>;
  fileList: string[];
};

export type InferredDomain =
  | "car rental"
  | "car showroom"
  | "code/tooling project"
  | "florist"
  | "generic website"
  | "jewellery"
  | "media brand"
  | "podcast"
  | "portfolio"
  | "restaurant"
  | "SaaS"
  | "youtube podcast";

export type PromptIntent =
  | "animation_or_interaction"
  | "ask_question"
  | "bug_fix"
  | "full_generation"
  | "image_fix"
  | "refactor"
  | "runtime_action"
  | "small_style_improvement"
  | "text_rename";

export type EditScope =
  | "css_only"
  | "html_css_js"
  | "js_only"
  | "multi_file"
  | "runtime_only"
  | "selected_file_only";

export type DiagnosticContext = {
  activeFileContent: string;
  activePath: string;
  diagnosis: string;
  editScope: EditScope;
  fileList: string[];
  inferredDomain: InferredDomain;
  keyFiles: {
    indexHtml?: string;
    mainJs?: string;
    packageJson?: string;
    stylesCss?: string;
  };
  projectId: string | null;
  projectName: string | null;
  promptIntent: PromptIntent;
  runtime: {
    latestError?: string;
    previewRunning: boolean;
    previewUrlAvailable: boolean;
    recentLogs?: string[];
    status: string;
  };
};

function lower(value: string) {
  return value.toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function pickFileContent(workspace: WorkspaceContextInput, path: string) {
  if (workspace.fileContents?.[path]) {
    return workspace.fileContents[path];
  }

  return workspace.activePath === path ? workspace.activeFileContent : undefined;
}

function createKeyFiles(workspace: WorkspaceContextInput) {
  return {
    indexHtml: pickFileContent(workspace, "index.html"),
    mainJs: pickFileContent(workspace, "main.js"),
    packageJson: pickFileContent(workspace, "package.json"),
    stylesCss: pickFileContent(workspace, "styles.css")
  };
}

function inferDomain(input: {
  fileList: string[];
  keyFiles: DiagnosticContext["keyFiles"];
  projectName: string | null;
  prompt: string;
}): InferredDomain {
  const projectText = lower(
    [
      input.prompt,
      input.projectName ?? "",
      input.fileList.join(" "),
      input.keyFiles.indexHtml ?? "",
      input.keyFiles.stylesCss ?? "",
      input.keyFiles.mainJs ?? "",
      input.keyFiles.packageJson ?? ""
    ].join("\n")
  );

  if (includesAny(projectText, ["jewellery", "jewelry", "diamond", "ring", "bracelet", "necklace", "gold", "gemstone"])) {
    return "jewellery";
  }

  if (includesAny(projectText, ["florist", "flower", "bouquet", "bloom", "petal", "rose"])) {
    return "florist";
  }

  if (includesAny(projectText, ["youtube podcast", "youtube show", "video podcast"])) {
    return "youtube podcast";
  }

  if (includesAny(projectText, ["podcast", "episode", "host", "listen now", "spotify", "apple podcast", "microphone"])) {
    return "podcast";
  }

  if (includesAny(projectText, ["media brand", "newsletter", "publication", "content studio", "creator site", "sponsor"])) {
    return "media brand";
  }

  if (
    includesAny(projectText, [
      "car showroom",
      "dealership",
      "test drive"
    ])
  ) {
    return "car showroom";
  }

  if (
    includesAny(projectText, [
      "auto rental",
      "car rental",
      "cars",
      "chauffeur",
      "fleet",
      "luxury car",
      "sedan",
      "showroom",
      "suv",
      "vehicle",
      "automotive"
    ])
  ) {
    return "car rental";
  }

  if (includesAny(projectText, ["restaurant", "menu", "chef", "dining", "reservation", "cuisine"])) {
    return "restaurant";
  }

  if (includesAny(projectText, ["portfolio", "case study", "resume", "selected work", "projects"])) {
    return "portfolio";
  }

  if (includesAny(projectText, ["saas", "dashboard", "analytics", "platform", "workflow", "api"])) {
    return "SaaS";
  }

  if (input.keyFiles.packageJson || input.fileList.some((path) => path.endsWith(".ts") || path.endsWith(".tsx"))) {
    return "code/tooling project";
  }

  return "generic website";
}

function inferPromptIntent(prompt: string): PromptIntent {
  const promptText = lower(prompt);

  if (includesAny(promptText, ["restart preview", "reload preview", "stop preview", "start preview"])) {
    return "runtime_action";
  }

  if (includesAny(promptText, ["rename", "replace text", "change text", "from ", " to "])) {
    return "text_rename";
  }

  if (includesAny(promptText, ["image", "photo", "picture", "broken img", "missing image"])) {
    return "image_fix";
  }

  if (includesAny(promptText, ["animation", "animate", "motion", "transition", "hover", "interactive", "micro interaction"])) {
    return "animation_or_interaction";
  }

  if (includesAny(promptText, ["bug", "error", "broken", "fix issue", "not working"])) {
    return "bug_fix";
  }

  if (includesAny(promptText, ["refactor", "cleanup", "clean up", "restructure code"])) {
    return "refactor";
  }

  if (
    includesAny(promptText, ["create", "build", "generate", "new website", "landing page", "from scratch", "make a site", "design"]) &&
    includesAny(promptText, ["website", "landing", "html", "css", "javascript", "site", "page", "pages"])
  ) {
    return "full_generation";
  }

  if (includesAny(promptText, ["make better", "improve", "premium", "modern", "fix style", "style", "design"])) {
    return "small_style_improvement";
  }

  if (promptText.endsWith("?") || includesAny(promptText, ["what is", "how do", "why", "explain"])) {
    return "ask_question";
  }

  return "small_style_improvement";
}

function inferEditScope(input: {
  fileList: string[];
  intent: PromptIntent;
  keyFiles: DiagnosticContext["keyFiles"];
}): EditScope {
  if (input.intent === "runtime_action") {
    return "runtime_only";
  }

  if (input.intent === "animation_or_interaction") {
    return input.keyFiles.mainJs ? "html_css_js" : "css_only";
  }

  if (input.intent === "small_style_improvement" || input.intent === "image_fix") {
    return input.keyFiles.stylesCss ? "css_only" : "html_css_js";
  }

  if (input.intent === "text_rename") {
    return "selected_file_only";
  }

  if (input.intent === "bug_fix" || input.intent === "refactor") {
    return "multi_file";
  }

  if (input.intent === "full_generation") {
    return input.fileList.length > 0 && input.keyFiles.indexHtml ? "html_css_js" : "multi_file";
  }

  return "selected_file_only";
}

function createDiagnosis(input: {
  domain: InferredDomain;
  editScope: EditScope;
  intent: PromptIntent;
}) {
  if (input.intent === "animation_or_interaction") {
    return `Detected an existing ${input.domain} project. The user asked for animation, so this should be a targeted visual polish pass using CSS transitions and small JavaScript reveal behavior. Avoid full regeneration.`;
  }

  if (input.intent === "small_style_improvement") {
    return `Detected an existing ${input.domain} project. The request is a style improvement, so preserve the current structure and make the smallest safe visual changes in ${input.editScope}.`;
  }

  if (input.intent === "full_generation") {
    return `Detected a ${input.domain} request that may need broader generation. Prefer preserving existing files when present, and only create or replace the minimal HTML, CSS, and JavaScript needed.`;
  }

  if (input.intent === "runtime_action") {
    return `Detected a runtime operation request. Use only approved preview runtime actions and do not modify files unless explicitly needed.`;
  }

  return `Detected an existing ${input.domain} project. Treat the request as ${input.intent} with ${input.editScope} scope and avoid unrelated rewrites.`;
}

export function buildDiagnosticContext(input: {
  projectId: string | null;
  projectName?: string | null;
  prompt: string;
  runtime?: RuntimeContextInput;
  workspace: WorkspaceContextInput;
}): DiagnosticContext {
  const keyFiles = createKeyFiles(input.workspace);
  const inferredDomain = inferDomain({
    fileList: input.workspace.fileList,
    keyFiles,
    projectName: input.projectName ?? null,
    prompt: input.prompt
  });
  const promptIntent = inferPromptIntent(input.prompt);
  const editScope = inferEditScope({
    fileList: input.workspace.fileList,
    intent: promptIntent,
    keyFiles
  });
  const runtimeStatus = input.runtime?.status ?? "unknown";

  return {
    activeFileContent: input.workspace.activeFileContent,
    activePath: input.workspace.activePath,
    diagnosis: createDiagnosis({
      domain: inferredDomain,
      editScope,
      intent: promptIntent
    }),
    editScope,
    fileList: input.workspace.fileList,
    inferredDomain,
    keyFiles,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    promptIntent,
    runtime: {
      latestError: input.runtime?.error ?? undefined,
      previewRunning: runtimeStatus === "running",
      previewUrlAvailable: Boolean(input.runtime?.previewUrl),
      recentLogs: input.runtime?.logs?.slice(-20),
      status: runtimeStatus
    }
  };
}

export function formatDiagnosticContext(context: DiagnosticContext) {
  return [
    `Diagnosis: ${context.diagnosis}`,
    `Domain: ${context.inferredDomain}`,
    `Prompt intent: ${context.promptIntent}`,
    `Edit scope: ${context.editScope}`,
    `Active file: ${context.activePath || "none"}`,
    `Files: ${context.fileList.join(", ") || "none"}`,
    `Runtime: ${context.runtime.status}`,
    context.runtime.latestError ? `Runtime error: ${context.runtime.latestError}` : null,
    context.keyFiles.indexHtml ? `index.html:\n${context.keyFiles.indexHtml.slice(0, 12000)}` : null,
    context.keyFiles.stylesCss ? `styles.css:\n${context.keyFiles.stylesCss.slice(0, 12000)}` : null,
    context.keyFiles.mainJs ? `main.js:\n${context.keyFiles.mainJs.slice(0, 8000)}` : null,
    context.keyFiles.packageJson ? `package.json:\n${context.keyFiles.packageJson.slice(0, 4000)}` : null
  ]
    .filter(Boolean)
    .join("\n\n");
}
