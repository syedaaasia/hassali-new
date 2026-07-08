import { readProjectContractFromWorkspace, summarizeProjectContract } from "@/lib/server/ai/project-contract";

export type WorkspaceContextInput = {
  activeFileContent?: string;
  activePath?: string;
  fileContents?: Record<string, string>;
  fileList?: string[];
  projectName?: string | null;
};

export type WorkspaceProductMode = "ASK" | "CODE" | "WEBSITE";

export type WorkspaceProjectKind = "CODE" | "MIXED" | "UNKNOWN" | "WEBSITE";

export type WorkspaceContractMode = "ASK" | "CODE" | "UNKNOWN" | "WEBSITE";

export type WorkspaceIdentity = {
  appName?: string;
  appType?: string;
  brandName?: string;
  contractPath?: string;
  domain?: string;
  entryPoint?: string;
  framework?: string;
  pages?: string[];
  previewType?: string;
};

export type NormalizedWorkspaceContext = {
  activeFileExcerpt: string;
  activeFileKind: string;
  activePath: string;
  codeAppIdentity: WorkspaceIdentity | null;
  contextTruncated: boolean;
  contextWarnings: string[];
  fileCount: number;
  fileList: string[];
  hasCodeContract: boolean;
  hasCodeFiles: boolean;
  hasHassaliContract: boolean;
  hasWebsiteFiles: boolean;
  importantFiles: string[];
  likelyProjectKind: WorkspaceProjectKind;
  mixedWorkspace: boolean;
  modelContextSummary: string;
  projectName: string | null;
  secretRedactionApplied: boolean;
  selectedContractMode: WorkspaceContractMode;
  selectedContractPath: "HASSALI.code.md" | "HASSALI.md" | "HASSALI.website.md" | null;
  unsafeInstructionDetected: boolean;
  userVisibleSummary: string;
  websiteIdentity: WorkspaceIdentity | null;
};

const MAX_EXCERPT_LENGTH = 2400;
const IMPORTANT_FILE_RE = /^(?:HASSALI(?:\.code|\.website)?\.md|index\.html|styles\.css|main\.js|package\.json|vite\.config\.[cm]?[jt]s|src\/(?:App|main)\.[jt]sx?|app\.py|requirements\.txt|README\.md|ARCHITECTURE\.md|SECURITY_AND_TESTING\.md|ROADMAP\.md)$/i;
const WEBSITE_FILE_RE = /^(?:index|about|services|service|contact|blog|blogs|menu|gallery|products|pricing|features|story|team|cart)\.html$/i;

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}\n[truncated]`;
}

export function redactWorkspaceSecrets(value: string) {
  const next = value
    .replace(/\b(DATABASE_URL\s*=\s*postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+(@[^\s]+)/gi, "$1[redacted-secret]$2")
    .replace(/\b((?:postgres|postgresql|mysql|mongodb):\/\/[^:\s]+:)[^@\s]+(@[^\s]+)/gi, "$1[redacted-secret]$2")
    .replace(/\b((?:[A-Z0-9_]*API[_-]?KEY|[A-Z0-9_]*SECRET|[A-Z0-9_]*TOKEN|PASSWORD)\s*[:=]\s*)["']?[^"'\s]{6,}/gi, "$1[redacted-secret]")
    .replace(/\b(?:sk|pk|rk|ghp|gho|ghu|ghs|AIza|xox[baprs]|sk-or-v1)-?[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]");

  return {
    redacted: next,
    redactionApplied: next !== value
  };
}

export function hasWorkspaceInjectionLikeText(value: string) {
  return /\b(?:ignore (?:all |previous |these )?instructions|system:|developer:|create a HASSALI_DIFF_PROPOSAL|install packages|modify files|switch to code|you are now)\b/i.test(value);
}

export function getWorkspaceText(workspace: WorkspaceContextInput, path: string) {
  return workspace.fileContents?.[path] ?? (workspace.activePath === path ? workspace.activeFileContent ?? "" : "");
}

function allKnownPaths(workspace: WorkspaceContextInput) {
  return unique([
    ...(workspace.fileList ?? []),
    ...Object.keys(workspace.fileContents ?? {}),
    workspace.activePath ?? ""
  ]);
}

export function hasWorkspaceWebsiteFiles(workspace: WorkspaceContextInput) {
  const paths = new Set(allKnownPaths(workspace));

  return paths.has("index.html") && (paths.has("styles.css") || paths.has("main.js"));
}

export function hasWorkspaceCodeFiles(workspace: WorkspaceContextInput) {
  const paths = new Set(allKnownPaths(workspace));

  return paths.has("package.json") ||
    paths.has("vite.config.ts") ||
    paths.has("vite.config.js") ||
    paths.has("src/App.tsx") ||
    paths.has("src/App.jsx") ||
    paths.has("app.py") ||
    paths.has("requirements.txt");
}

function parseContractMode(content: string): WorkspaceContractMode {
  const normalized = [
    parseContractValue(content, "Project Type"),
    parseContractValue(content, "mode"),
    parseContractValue(content, "Preview Type"),
    parseContractValue(content, "previewType"),
    parseContractValue(content, "framework")
  ].filter(Boolean).join(" ").toLowerCase();

  if (/\bcode\b/.test(normalized) || normalized.includes("react_vite") || normalized.includes("streamlit") || normalized.includes("code_app_preview")) return "CODE";
  if (/\bwebsite\b/.test(normalized) || normalized.includes("website_static_preview") || normalized.includes("static_website")) return "WEBSITE";
  if (/\bask\b/.test(normalized) || normalized.includes("answer_only")) return "ASK";

  return "UNKNOWN";
}

function parseContractValue(content: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const markdownMatch = content.match(new RegExp(`^- \\*\\*${escaped}:\\*\\*\\s*(.+)$`, "im"));
  const plainMatch = content.match(new RegExp(`^${escaped}:\\s*(.+)$`, "im"));
  const value = (markdownMatch?.[1] ?? plainMatch?.[1])?.trim();

  if (!value || /^(?:unknown|none|null)$/i.test(value)) return undefined;
  return value;
}

function parseContractList(content: string, label: string) {
  const csv = parseContractValue(content, label);
  if (csv) {
    return csv.split(",").map((item) => item.trim()).filter(Boolean);
  }

  const section = content.match(new RegExp(`##\\s+${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"))?.[1] ?? "";

  return section
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^-\s*/, ""))
    .filter(Boolean);
}

function firstMatch(value: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return undefined;
}

function cleanIdentityName(value: string | undefined) {
  return value
    ?.replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPackageName(packageJson: string) {
  try {
    const parsed = JSON.parse(packageJson) as { name?: unknown };
    return typeof parsed.name === "string" ? parsed.name : undefined;
  } catch {
    return firstMatch(packageJson, [/"name"\s*:\s*"([^"]+)"/]);
  }
}

function inferActiveFileKind(activePath: string) {
  if (!activePath) return "none";
  if (/\.html$/i.test(activePath)) return "html";
  if (/\.css$/i.test(activePath)) return "css";
  if (/\.js$/i.test(activePath)) return "javascript";
  if (/\.tsx?$/i.test(activePath)) return "typescript";
  if (/\.jsx?$/i.test(activePath)) return "javascript";
  if (/\.py$/i.test(activePath)) return "python";
  if (/\.md$/i.test(activePath)) return "markdown";
  if (/\.json$/i.test(activePath)) return "json";
  if (/\.ya?ml$/i.test(activePath)) return "yaml";
  return "text";
}

function inferWebsitePages(paths: string[]) {
  return unique(paths
    .filter((path) => WEBSITE_FILE_RE.test(path))
    .map((path) => path === "index.html" ? "home" : path.replace(/\.html$/i, "")));
}

export function extractCodeAppIdentityFromWorkspace(workspace: WorkspaceContextInput): WorkspaceIdentity | null {
  const codeContract = getWorkspaceText(workspace, "HASSALI.code.md");
  const rootContract = getWorkspaceText(workspace, "HASSALI.md");
  const codeContractMode = parseContractMode(codeContract);
  const rootContractMode = parseContractMode(rootContract);
  const contractPath = codeContract.trim()
    ? "HASSALI.code.md"
    : rootContractMode === "CODE"
      ? "HASSALI.md"
      : null;
  const contract = contractPath === "HASSALI.code.md" ? codeContract : contractPath === "HASSALI.md" ? rootContract : "";
  const appSource = getWorkspaceText(workspace, "src/App.tsx") || getWorkspaceText(workspace, "src/App.jsx");
  const packageJson = getWorkspaceText(workspace, "package.json");
  const appName = cleanIdentityName(
    parseContractValue(contract, "Brand/App/Site Name") ??
    parseContractValue(contract, "Product identity") ??
    parseContractValue(contract, "appName") ??
    parseContractValue(contract, "Name") ??
    firstMatch(appSource, [
      /"appName"\s*:\s*"([^"]+)"/,
      /appName:\s*["'`]([^"'`]+)["'`]/
    ]) ??
    extractPackageName(packageJson)
  );
  const hasCodeEvidence =
    Boolean(contractPath && (codeContractMode === "CODE" || rootContractMode === "CODE")) ||
    /"appName"\s*:|appName\s*:/.test(appSource) ||
    hasWorkspaceCodeFiles(workspace);

  if (!hasCodeEvidence || !appName) return null;

  return {
    appName,
    appType: parseContractValue(contract, "appType"),
    contractPath: contractPath ?? undefined,
    entryPoint: parseContractValue(contract, "entryPoint"),
    framework: parseContractValue(contract, "framework") ?? (/streamlit|app\.py/i.test(contract) ? "python_streamlit" : undefined),
    previewType: parseContractValue(contract, "previewType") ?? parseContractValue(contract, "Preview Type")
  };
}

function extractWebsiteIdentityFromWorkspace(workspace: WorkspaceContextInput, fileList: string[]): WorkspaceIdentity | null {
  const websiteContract = getWorkspaceText(workspace, "HASSALI.website.md");
  const rootContract = getWorkspaceText(workspace, "HASSALI.md");
  const rootContractMode = parseContractMode(rootContract);
  const contractPath = websiteContract.trim()
    ? "HASSALI.website.md"
    : rootContractMode !== "CODE" && rootContract.trim()
      ? "HASSALI.md"
      : null;
  const contract = contractPath === "HASSALI.website.md" ? websiteContract : contractPath === "HASSALI.md" ? rootContract : "";
  const pages = unique([
    ...parseContractList(contract, "requestedPages"),
    ...parseContractList(contract, "pages"),
    ...inferWebsitePages(fileList)
  ]);
  const identity: WorkspaceIdentity = {
    brandName: cleanIdentityName(parseContractValue(contract, "Brand/App/Site Name") ?? parseContractValue(contract, "displayName") ?? parseContractValue(contract, "brand/app/site name")),
    contractPath: contractPath ?? undefined,
    domain: parseContractValue(contract, "Domain/Business") ?? parseContractValue(contract, "domainId"),
    pages,
    previewType: parseContractValue(contract, "previewType") ?? parseContractValue(contract, "Preview Type")
  };

  if (!contractPath && !hasWorkspaceWebsiteFiles(workspace)) return null;
  return identity;
}

function selectContract(input: {
  codeAppIdentity: WorkspaceIdentity | null;
  hasCodeContract: boolean;
  hasHassaliContract: boolean;
  hasWebsiteContract: boolean;
  mode?: WorkspaceProductMode;
  rootContractMode: WorkspaceContractMode;
  websiteIdentity: WorkspaceIdentity | null;
}) {
  if (input.mode === "CODE") {
    if (input.hasCodeContract) return { mode: "CODE" as const, path: "HASSALI.code.md" as const };
    if (input.rootContractMode === "CODE" && input.hasHassaliContract) return { mode: "CODE" as const, path: "HASSALI.md" as const };
    if (input.codeAppIdentity?.contractPath === "HASSALI.md") return { mode: "CODE" as const, path: "HASSALI.md" as const };
    return { mode: "UNKNOWN" as const, path: null };
  }

  if (input.mode === "WEBSITE") {
    if (input.hasWebsiteContract) return { mode: "WEBSITE" as const, path: "HASSALI.website.md" as const };
    if (input.rootContractMode !== "CODE" && input.hasHassaliContract) return { mode: input.rootContractMode === "UNKNOWN" ? "WEBSITE" as const : input.rootContractMode, path: "HASSALI.md" as const };
    return { mode: "UNKNOWN" as const, path: null };
  }

  if (input.websiteIdentity && input.codeAppIdentity) {
    return { mode: "UNKNOWN" as const, path: null };
  }

  if (input.codeAppIdentity?.contractPath === "HASSALI.code.md") return { mode: "CODE" as const, path: "HASSALI.code.md" as const };
  if (input.rootContractMode === "CODE" && input.hasHassaliContract) return { mode: "CODE" as const, path: "HASSALI.md" as const };
  if (input.websiteIdentity?.contractPath === "HASSALI.website.md") return { mode: "WEBSITE" as const, path: "HASSALI.website.md" as const };
  if (input.hasHassaliContract) return { mode: input.rootContractMode === "UNKNOWN" ? "UNKNOWN" as const : input.rootContractMode, path: "HASSALI.md" as const };

  return { mode: "UNKNOWN" as const, path: null };
}

function summaryFor(input: {
  codeAppIdentity: WorkspaceIdentity | null;
  fileList: string[];
  likelyProjectKind: WorkspaceProjectKind;
  projectName: string | null;
  selectedContractPath: string | null;
  websiteIdentity: WorkspaceIdentity | null;
}) {
  const title = input.projectName ?? input.websiteIdentity?.brandName ?? input.codeAppIdentity?.appName ?? "this workspace";
  const important = input.fileList.filter((path) => IMPORTANT_FILE_RE.test(path)).slice(0, 14);

  if (input.likelyProjectKind === "MIXED") {
    return [
      `${title} looks like a mixed workspace: it contains both WEBSITE files and CODE app files.`,
      input.websiteIdentity ? `Website: ${input.websiteIdentity.brandName ?? input.websiteIdentity.domain ?? "website"}${input.websiteIdentity.pages?.length ? ` with pages ${input.websiteIdentity.pages.join(", ")}` : ""}.` : "Website files are present.",
      input.codeAppIdentity ? `CODE app: ${input.codeAppIdentity.appName ?? "app"}${input.codeAppIdentity.framework ? ` using ${input.codeAppIdentity.framework}` : ""}.` : "CODE app files are present.",
      input.selectedContractPath ? `Selected contract: ${input.selectedContractPath}.` : "No single contract is authoritative for every mode.",
      important.length ? `Important files: ${important.join(", ")}.` : `Files: ${input.fileList.slice(0, 10).join(", ") || "none"}.`
    ].join("\n");
  }

  if (input.likelyProjectKind === "WEBSITE") {
    return [
      `${title} looks like a WEBSITE project${input.websiteIdentity?.domain ? ` for ${input.websiteIdentity.domain}` : ""}.`,
      input.websiteIdentity?.pages?.length ? `Main pages: ${input.websiteIdentity.pages.join(", ")}.` : "Main page files are detected from the workspace.",
      important.length ? `Important files: ${important.join(", ")}.` : `Files: ${input.fileList.slice(0, 10).join(", ") || "none"}.`,
      input.selectedContractPath ? `Selected contract: ${input.selectedContractPath}.` : "No project contract was selected."
    ].join("\n");
  }

  if (input.likelyProjectKind === "CODE") {
    return [
      `${title} looks like a CODE project${input.codeAppIdentity?.appName ? `: ${input.codeAppIdentity.appName}` : ""}.`,
      input.codeAppIdentity?.framework ? `Framework: ${input.codeAppIdentity.framework}.` : "Framework is inferred from files.",
      input.codeAppIdentity?.entryPoint ? `Entry point: ${input.codeAppIdentity.entryPoint}.` : important.includes("src/main.tsx") ? "Entry point: src/main.tsx." : "",
      important.length ? `Important files: ${important.join(", ")}.` : `Files: ${input.fileList.slice(0, 10).join(", ") || "none"}.`,
      input.selectedContractPath ? `Selected contract: ${input.selectedContractPath}.` : "No CODE contract was selected."
    ].filter(Boolean).join("\n");
  }

  return [
    `${title} does not have enough recognized WEBSITE or CODE files for a confident project type.`,
    important.length ? `Important files: ${important.join(", ")}.` : `Files: ${input.fileList.slice(0, 10).join(", ") || "none"}.`
  ].join("\n");
}

export function buildWorkspaceContext(input: {
  mode?: WorkspaceProductMode;
  projectName?: string | null;
  prompt?: string;
  workspace?: WorkspaceContextInput | null;
}): NormalizedWorkspaceContext {
  const workspace = input.workspace ?? {};
  const fileList = allKnownPaths(workspace);
  const projectName = workspace.projectName ?? input.projectName ?? null;
  const activePath = workspace.activePath ?? "";
  const activeContent = getWorkspaceText(workspace, activePath);
  const redacted = redactWorkspaceSecrets(activeContent);
  const activeFileExcerpt = truncate(redacted.redacted, MAX_EXCERPT_LENGTH);
  const hasHassaliContract = Boolean(getWorkspaceText(workspace, "HASSALI.md").trim());
  const hasCodeContract = Boolean(getWorkspaceText(workspace, "HASSALI.code.md").trim());
  const hasWebsiteContract = Boolean(getWorkspaceText(workspace, "HASSALI.website.md").trim());
  const rootContractMode = parseContractMode(getWorkspaceText(workspace, "HASSALI.md"));
  const hasWebsiteFiles = hasWorkspaceWebsiteFiles(workspace);
  const hasCodeFiles = hasWorkspaceCodeFiles(workspace);
  const websiteIdentity = extractWebsiteIdentityFromWorkspace(workspace, fileList);
  const codeAppIdentity = extractCodeAppIdentityFromWorkspace(workspace);
  const mixedWorkspace = Boolean((hasWebsiteFiles || websiteIdentity) && (hasCodeFiles || codeAppIdentity));
  const likelyProjectKind: WorkspaceProjectKind = mixedWorkspace
    ? "MIXED"
    : hasWebsiteFiles || websiteIdentity
      ? "WEBSITE"
      : hasCodeFiles || codeAppIdentity
        ? "CODE"
        : "UNKNOWN";
  const selected = selectContract({
    codeAppIdentity,
    hasCodeContract,
    hasHassaliContract,
    hasWebsiteContract,
    mode: input.mode,
    rootContractMode,
    websiteIdentity
  });
  const unsafeInstructionDetected = hasWorkspaceInjectionLikeText(activeContent) ||
    Object.values(workspace.fileContents ?? {}).some((content) => hasWorkspaceInjectionLikeText(content));
  const anyKnownContent = [activeContent, ...Object.values(workspace.fileContents ?? {})].join("\n");
  const secretRedactionApplied = redacted.redactionApplied || redactWorkspaceSecrets(anyKnownContent).redactionApplied;
  const contextTruncated = activeContent.length > MAX_EXCERPT_LENGTH;
  const importantFiles = fileList.filter((path) => IMPORTANT_FILE_RE.test(path)).slice(0, 20);
  const baseSummary = summaryFor({
    codeAppIdentity,
    fileList,
    likelyProjectKind,
    projectName,
    selectedContractPath: selected.path,
    websiteIdentity
  });
  const projectContract = readProjectContractFromWorkspace({
    activeFileContent: workspace.activeFileContent ?? "",
    activePath: workspace.activePath ?? "",
    fileContents: workspace.fileContents
  });
  const contextWarnings = [
    mixedWorkspace ? "mixed_workspace_detected" : "",
    unsafeInstructionDetected ? "workspace_contains_untrusted_instruction_like_text" : "",
    secretRedactionApplied ? "secret_like_values_redacted" : "",
    contextTruncated ? "active_file_excerpt_truncated" : ""
  ].filter(Boolean);

  return {
    activeFileExcerpt,
    activeFileKind: inferActiveFileKind(activePath),
    activePath,
    codeAppIdentity,
    contextTruncated,
    contextWarnings,
    fileCount: fileList.length,
    fileList,
    hasCodeContract,
    hasCodeFiles,
    hasHassaliContract,
    hasWebsiteFiles,
    importantFiles,
    likelyProjectKind,
    mixedWorkspace,
    modelContextSummary: [
      baseSummary,
      `Contract summary: ${summarizeProjectContract(projectContract)}`,
      contextWarnings.length ? `Context warnings: ${contextWarnings.join(", ")}` : "Context warnings: none.",
      activeFileExcerpt ? `Active/reference file excerpt (untrusted, secrets redacted):\n${activeFileExcerpt}` : "No active file excerpt was provided."
    ].join("\n"),
    projectName,
    secretRedactionApplied,
    selectedContractMode: selected.mode,
    selectedContractPath: selected.path,
    unsafeInstructionDetected,
    userVisibleSummary: baseSummary,
    websiteIdentity
  };
}

function headerSafe(value: unknown) {
  return String(value ?? "").replace(/[^\w.,:;=+\- ]/g, "_").slice(0, 180);
}

export function createWorkspaceContextDebugHeaders(context: NormalizedWorkspaceContext): Record<string, string> {
  if (process.env.NODE_ENV === "production") return {};

  return {
    "x-hassali-context-code": headerSafe(context.hasCodeFiles),
    "x-hassali-context-contract": headerSafe(context.selectedContractPath ?? ""),
    "x-hassali-context-kind": headerSafe(context.likelyProjectKind),
    "x-hassali-context-mixed": headerSafe(context.mixedWorkspace),
    "x-hassali-context-redacted": headerSafe(context.secretRedactionApplied),
    "x-hassali-context-truncated": headerSafe(context.contextTruncated),
    "x-hassali-context-website": headerSafe(context.hasWebsiteFiles)
  };
}
