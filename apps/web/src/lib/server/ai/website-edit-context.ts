import { classifyDomainIntent } from "@/lib/server/ai/industry-taxonomy";

export type WebsiteEditContext = {
  activeMode: "WEBSITE";
  brandName?: string;
  contractPath: "HASSALI.md" | "HASSALI.website.md";
  creativeDirection?: {
    ctaPlacement?: string;
    heroLayout?: string;
    palette?: string;
    proofStrategy?: string;
    sectionRhythm?: string;
    typography?: string;
    visualArchetype?: string;
  };
  displayName?: string;
  domainId?: string;
  exactPageCount?: number;
  existingContact?: {
    address?: string;
    email?: string;
    phone?: string;
  };
  existingCtas: string[];
  files: Record<string, string>;
  hasWebsiteFiles: boolean;
  ignoredContractReason?: string;
  mixedModeConflict: boolean;
  navLinks: Array<{ href: string; label: string }>;
  canonicalPagePaths: string[];
  obsoleteOwnedFiles: string[];
  physicalHtmlFiles: string[];
  requestedPages: string[];
  requiredFiles: string[];
  unknownFiles: string[];
  websiteOwnedFiles: string[];
};

type WorkspaceLike = {
  activeFileContent?: string;
  activePath?: string;
  fileContents?: Record<string, string>;
  fileList?: string[];
};

const ownedWebsitePagePattern = /^(?:index|about|services|service|contact|blog|blogs|menu|gallery|products|pricing|features|story|team|televisions|brands|doctors|booking|shop|fleet)\.html$/i;
const websiteFilePattern = /\.html$|^(?:styles\.css|main\.js|HASSALI\.md|HASSALI\.website\.md)$/i;

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseCsvLine(content: string, key: string) {
  const match = content.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));

  return match?.[1]
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
}

function parseLine(content: string, key: string) {
  const loose = content.match(new RegExp(`^${key}:\\s*(.+)$`, "im"))?.[1]?.trim();
  if (loose) return loose;

  return content.match(new RegExp(`^-\\s*\\*\\*${key}:\\*\\*\\s*(.+)$`, "im"))?.[1]?.trim();
}

function parseContractMode(content: string) {
  const mode = parseLine(content, "mode") ?? parseLine(content, "Project Type") ?? "";
  const previewType = parseLine(content, "Preview Type") ?? parseLine(content, "previewType") ?? "";
  const stack = parseLine(content, "Stack") ?? "";
  const normalized = `${mode} ${previewType} ${stack}`.toLowerCase();

  if (/\bcode\b/.test(normalized) || normalized.includes("python_app_preview") || normalized.includes("streamlit")) return "CODE";
  if (/\bwebsite\b/.test(normalized) || normalized.includes("static") || normalized.includes("srcdoc")) return "WEBSITE";

  return "UNKNOWN";
}

function parseCreativeDirection(content: string): WebsiteEditContext["creativeDirection"] {
  const section = content.split(/##\s+Creative Direction/i)[1] ?? "";

  if (!section) return undefined;

  return {
    ctaPlacement: section.match(/-\s*Primary CTA:\s*(.+)/i)?.[1]?.trim(),
    heroLayout: section.match(/-\s*Hero layout:\s*(.+)/i)?.[1]?.trim(),
    palette: section.match(/-\s*Palette:\s*(.+)/i)?.[1]?.trim(),
    proofStrategy: section.match(/-\s*Proof strategy:\s*(.+)/i)?.[1]?.trim(),
    sectionRhythm: section.match(/-\s*Section rhythm:\s*(.+)/i)?.[1]?.trim(),
    typography: section.match(/-\s*Typography:\s*(.+)/i)?.[1]?.trim(),
    visualArchetype: section.match(/-\s*Visual archetype:\s*(.+)/i)?.[1]?.trim()
  };
}

function extractNavLinks(files: Record<string, string>) {
  const links: Array<{ href: string; label: string }> = [];

  for (const [path, content] of Object.entries(files)) {
    if (!path.endsWith(".html")) continue;

    for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = match[1]?.trim() ?? "";
      const label = (match[2] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (href && label) links.push({ href, label });
    }
  }

  return Array.from(new Map(links.map((link) => [`${link.label}|${link.href}`, link])).values());
}

function extractContact(files: Record<string, string>): WebsiteEditContext["existingContact"] {
  const content = Object.values(files).join("\n");
  const email = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = content.match(/(?:\+\d[\d\s().-]{6,}\d|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/)?.[0];
  const address = content.match(/\b\d{1,6}\s+[A-Za-z0-9 .'-]{3,80}\s+(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd|Drive|Dr)\b/i)?.[0];

  return { address, email, phone };
}

function extractCtas(files: Record<string, string>) {
  const values: string[] = [];

  for (const content of Object.values(files)) {
    for (const match of content.matchAll(/<(?:a|button)\b[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)) {
      const label = (match[1] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      if (label && label.length <= 44) values.push(label);
    }
  }

  return unique(values);
}

function htmlPageName(path: string) {
  return path === "index.html" ? "home" : path.replace(/\.html$/i, "").replace(/s$/, (suffix, offset) =>
    path.slice(0, offset).endsWith("service") ? suffix : suffix
  );
}

function extractHtmlText(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([path]) => path.endsWith(".html"))
    .map(([, content]) => content)
    .join("\n")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveDomainFromWebsiteFiles(files: Record<string, string>) {
  const html = Object.entries(files)
    .filter(([path]) => path.endsWith(".html"))
    .map(([, content]) => content)
    .join("\n");
  const industry = html.match(/\bdata-industry=["']([^"']+)["']/i)?.[1]?.trim();

  if (industry) {
    const normalizedIndustry = industry.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const classified = classifyDomainIntent(industry);

    return classified.domainId ?? normalizedIndustry;
  }

  const text = extractHtmlText(files);
  const classified = classifyDomainIntent(text);

  return classified.confidence >= 0.55 ? classified.domainId ?? undefined : undefined;
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized === "home" || normalized === "index" || normalized === "homepage"
    ? "index.html"
    : `${normalized}.html`;
}

export function buildWebsiteEditContext(workspace: WorkspaceLike): WebsiteEditContext {
  const files: Record<string, string> = {};
  const fileContents = workspace.fileContents ?? {};
  const fileList = workspace.fileList ?? Object.keys(fileContents);

  for (const path of fileList) {
    const content = fileContents[path];

    if (typeof content === "string" && websiteFilePattern.test(path)) {
      files[path] = content;
    }
  }

  if (workspace.activePath && typeof workspace.activeFileContent === "string" && websiteFilePattern.test(workspace.activePath)) {
    files[workspace.activePath] = workspace.activeFileContent;
  }

  const primaryContract = files["HASSALI.md"] ?? "";
  const websiteContract = files["HASSALI.website.md"] ?? "";
  const primaryMode = parseContractMode(primaryContract);
  const websiteMode = parseContractMode(websiteContract);
  const mixedModeConflict = Boolean(primaryContract && primaryMode === "CODE" && Object.keys(files).some((path) => path.endsWith(".html")));
  const contractPath = websiteContract || primaryMode !== "CODE" ? (websiteContract ? "HASSALI.website.md" : "HASSALI.md") : "HASSALI.website.md";
  const contract = websiteContract && websiteMode !== "CODE"
    ? websiteContract
    : primaryMode !== "CODE"
      ? primaryContract
      : "";
  const websiteOnlyFiles = { ...files };

  if (mixedModeConflict) {
    delete websiteOnlyFiles["HASSALI.md"];
  }

  const contractPages = parseCsvLine(contract, "requestedPages");
  const physicalHtmlFiles = Object.keys(websiteOnlyFiles)
    .filter((path) => path.endsWith(".html"))
    .sort((a, b) => a === "index.html" ? -1 : b === "index.html" ? 1 : a.localeCompare(b));
  const fallbackPages = physicalHtmlFiles.filter((path) => ownedWebsitePagePattern.test(path)).map(htmlPageName);
  const requestedPages = unique(contractPages.length ? contractPages : fallbackPages);
  const canonicalPagePaths = requestedPages.map(pageToPath);
  const contractRequiredFiles = parseCsvLine(contract, "requiredFiles");
  const canonicalSupportFiles = ["styles.css", "main.js", contractPath].filter((path) => path === contractPath || Boolean(websiteOnlyFiles[path]) || contractRequiredFiles.includes(path));
  const requiredFiles = unique([...canonicalPagePaths, ...canonicalSupportFiles]);
  const contractOwnedFiles = unique([...canonicalPagePaths, ...contractRequiredFiles, contractPath]);
  const websiteOwnedFiles = unique([
    ...contractOwnedFiles,
    ...physicalHtmlFiles.filter((path) => ownedWebsitePagePattern.test(path)),
    ...["styles.css", "main.js"].filter((path) => Boolean(websiteOnlyFiles[path]))
  ]);
  const obsoleteOwnedFiles = websiteOwnedFiles.filter((path) => path.endsWith(".html") && !canonicalPagePaths.includes(path));
  const unknownFiles = physicalHtmlFiles.filter((path) => !websiteOwnedFiles.includes(path));
  const exactPageCount = Number.parseInt(parseLine(contract, "exactPageCount") ?? "", 10);
  const canonicalFiles = Object.fromEntries(
    Object.entries(websiteOnlyFiles).filter(([path]) => requiredFiles.includes(path))
  );
  const derivedDomainId = deriveDomainFromWebsiteFiles(canonicalFiles);

  return {
    activeMode: "WEBSITE",
    brandName: parseLine(contract, "brand/app/site name"),
    contractPath,
    creativeDirection: parseCreativeDirection(contract),
    displayName: parseLine(contract, "displayName"),
    domainId: parseLine(contract, "domainId") ?? derivedDomainId,
    exactPageCount: Number.isFinite(exactPageCount) ? exactPageCount : requestedPages.length || undefined,
    existingContact: extractContact(canonicalFiles),
    existingCtas: extractCtas(canonicalFiles),
    files: websiteOnlyFiles,
    hasWebsiteFiles: Boolean(websiteOnlyFiles["index.html"] && websiteOnlyFiles["styles.css"]),
    ignoredContractReason: mixedModeConflict ? "HASSALI.md is CODE while productMode is WEBSITE" : undefined,
    mixedModeConflict,
    navLinks: extractNavLinks(canonicalFiles),
    canonicalPagePaths,
    obsoleteOwnedFiles,
    physicalHtmlFiles,
    requestedPages,
    requiredFiles,
    unknownFiles,
    websiteOwnedFiles
  };
}

export function isWebsiteOwnedPath(path: string) {
  return ownedWebsitePagePattern.test(path) || /^(?:styles\.css|main\.js|HASSALI\.md|HASSALI\.website\.md)$/i.test(path);
}
