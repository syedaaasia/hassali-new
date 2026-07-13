import { normalizeSafeProjectPath } from "@/lib/utils/path";

export type WebsiteValidationProfile =
  | "clarification_only"
  | "content_only"
  | "full_site_generation"
  | "full_site_replacement"
  | "narrow_page"
  | "narrow_section"
  | "style_only";

export type WebsiteVirtualAction = {
  action: string;
  path?: string;
  proposedContent?: string;
};

export type WebsiteVirtualFile = {
  active: boolean;
  content: string;
  path: string;
  source: "current_workspace" | "preserved" | "proposal_create" | "proposal_update";
  websiteOwned: boolean;
};

export type WebsiteGraphEdge = {
  from: string;
  kind: "asset" | "fragment" | "page" | "script" | "stylesheet";
  rawReference: string;
  target: string;
};

export type WebsiteGraphIssue = {
  from: string;
  kind: "missing_fragment" | "missing_target" | "unsafe_reference";
  rawReference: string;
  target: string | null;
};

export type WebsiteVirtualFilesystem = {
  actions: WebsiteVirtualAction[];
  activeAssetFiles: string[];
  activeHtmlFiles: string[];
  activeSupportFiles: string[];
  after: Map<string, WebsiteVirtualFile>;
  before: Map<string, WebsiteVirtualFile>;
  canonicalDomain: string | null;
  canonicalOwnedFiles: string[];
  canonicalPageFiles: string[];
  conflicts: string[];
  created: string[];
  deleted: string[];
  graph: {
    assets: string[];
    edges: WebsiteGraphEdge[];
    issues: WebsiteGraphIssue[];
    pages: string[];
    sharedFiles: string[];
  };
  preserved: string[];
  profile: WebsiteValidationProfile;
  projectId: string | null;
  protected: string[];
  requestScope: string;
  updated: string[];
};

export type WebsiteVirtualReferenceRepair = {
  from: string;
  originalTarget: string;
  repairedTarget: string;
};

const externalReferencePattern = /^(?:https?:|mailto:|tel:|data:|blob:)/i;

function key(path: string) {
  return path.toLowerCase();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeWebsitePath(value: unknown) {
  if (typeof value !== "string") return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.trim());
  } catch {
    return null;
  }
  const raw = decoded.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!raw || raw.startsWith("/") || /^[a-z]:/i.test(raw)) return null;
  return normalizeSafeProjectPath(raw);
}

export function resolveWebsiteReference(reference: string, fromPath: string) {
  const raw = reference.trim();
  if (!raw) return { external: false, fragment: null, target: null, unsafe: false };
  if (externalReferencePattern.test(raw)) return { external: true, fragment: null, target: null, unsafe: false };
  if (/^javascript:/i.test(raw)) return { external: false, fragment: null, target: null, unsafe: true };

  const hashIndex = raw.indexOf("#");
  const fragment = hashIndex >= 0 ? raw.slice(hashIndex + 1) || null : null;
  const withoutHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  if (!withoutQuery) {
    return { external: false, fragment, target: normalizeWebsitePath(fromPath), unsafe: false };
  }

  const fromParts = fromPath.replace(/\\/g, "/").split("/");
  fromParts.pop();
  const parts = [...fromParts, ...withoutQuery.replace(/\\/g, "/").split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (resolved.length === 0) return { external: false, fragment, target: null, unsafe: true };
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  const target = normalizeWebsitePath(resolved.join("/") || "index.html");
  return { external: false, fragment, target, unsafe: !target };
}

function referencesFor(path: string, content: string) {
  const refs: Array<{ kind: WebsiteGraphEdge["kind"]; value: string }> = [];
  if (path.endsWith(".html")) {
    for (const match of content.matchAll(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) refs.push({ kind: "stylesheet", value: match[1] ?? "" });
    for (const match of content.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)) refs.push({ kind: "script", value: match[1] ?? "" });
    for (const match of content.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) refs.push({ kind: "page", value: match[1] ?? "" });
    for (const match of content.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) refs.push({ kind: "asset", value: match[1] ?? "" });
    for (const match of content.matchAll(/<(?:img|source)\b[^>]*\bsrcset=["']([^"']+)["'][^>]*>/gi)) {
      for (const candidate of (match[1] ?? "").split(",")) {
        refs.push({ kind: "asset", value: candidate.trim().split(/\s+/)[0] ?? "" });
      }
    }
  }
  if (path.endsWith(".css")) {
    for (const match of content.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.push({ kind: "asset", value: match[1] ?? "" });
  }
  return refs.filter((ref) => ref.value.trim());
}

function hasFragment(content: string, fragment: string) {
  const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\bid=["']${escaped}["']`, "i").test(content);
}

function buildGraph(files: Map<string, WebsiteVirtualFile>, activePaths: string[]) {
  const edges: WebsiteGraphEdge[] = [];
  const issues: WebsiteGraphIssue[] = [];
  const active = new Set(activePaths.map(key));
  for (const path of activePaths) {
    const file = files.get(key(path));
    if (!file) continue;
    for (const reference of referencesFor(file.path, file.content)) {
      const resolved = resolveWebsiteReference(reference.value, file.path);
      if (resolved.external) continue;
      if (resolved.unsafe || !resolved.target) {
        issues.push({ from: file.path, kind: "unsafe_reference", rawReference: reference.value, target: null });
        continue;
      }
      const edgeKind = resolved.fragment && resolved.target === file.path ? "fragment" : reference.kind;
      edges.push({ from: file.path, kind: edgeKind, rawReference: reference.value, target: resolved.target });
      const targetFile = files.get(key(resolved.target));
      if (!targetFile || !active.has(key(resolved.target))) {
        issues.push({ from: file.path, kind: "missing_target", rawReference: reference.value, target: resolved.target });
      } else if (resolved.fragment && !hasFragment(targetFile.content, resolved.fragment)) {
        issues.push({ from: file.path, kind: "missing_fragment", rawReference: reference.value, target: resolved.target });
      }
    }
  }
  const uniqueEdges = [...new Map(edges.map((edge) => [`${key(edge.from)}|${edge.kind}|${key(edge.target)}|${edge.rawReference}`, edge])).values()];
  const uniqueIssues = [...new Map(issues.map((issue) => [`${key(issue.from)}|${issue.kind}|${key(issue.target ?? "")}|${issue.rawReference}`, issue])).values()];
  return {
    assets: activePaths.filter((path) => !/\.(?:html?|css|js|md)$/i.test(path)),
    edges: uniqueEdges,
    issues: uniqueIssues,
    pages: activePaths.filter((path) => path.endsWith(".html")),
    sharedFiles: activePaths.filter((path) => /\.(?:css|js|md)$/i.test(path))
  };
}

export function validationProfileForWebsiteScope(scope: string): WebsiteValidationProfile {
  if (scope === "full_generation") return "full_site_generation";
  if (scope === "full_replacement") return "full_site_replacement";
  if (scope === "large_partial_replacement" || scope === "page_edit") return "narrow_page";
  if (scope === "section_edit") return "narrow_section";
  if (scope === "style_theme_edit") return "style_only";
  if (scope === "content_edit") return "content_only";
  return "clarification_only";
}

export function buildWebsiteVirtualFilesystem(input: {
  actions: WebsiteVirtualAction[];
  canonicalDomain?: string | null;
  canonicalOwnedFiles: string[];
  canonicalPageFiles: string[];
  currentFiles: Record<string, string>;
  profile?: WebsiteValidationProfile;
  projectId?: string | null;
  requestScope: string;
}): WebsiteVirtualFilesystem {
  const conflicts: string[] = [];
  const owned = new Set(input.canonicalOwnedFiles.map((path) => normalizeWebsitePath(path)).filter((path): path is string => Boolean(path)).map(key));
  const pages = input.canonicalPageFiles.map((path) => normalizeWebsitePath(path)).filter((path): path is string => Boolean(path));
  const before = new Map<string, WebsiteVirtualFile>();
  for (const [rawPath, content] of Object.entries(input.currentFiles)) {
    const path = normalizeWebsitePath(rawPath);
    if (!path) continue;
    before.set(key(path), { active: owned.has(key(path)), content, path, source: "current_workspace", websiteOwned: owned.has(key(path)) });
  }
  const after = new Map([...before].map(([fileKey, file]) => [fileKey, { ...file, source: file.active ? "preserved" as const : file.source }]));
  const created: string[] = [];
  const updated: string[] = [];
  const deleted: string[] = [];
  for (const action of input.actions) {
    const path = normalizeWebsitePath(action.path);
    if (!path) {
      conflicts.push(`Unsafe or missing proposal path: ${String(action.path ?? "unknown")}`);
      continue;
    }
    if (action.action === "delete_file") {
      if (!owned.has(key(path))) {
        conflicts.push(`Protected or unowned file cannot be deleted by WEBSITE: ${path}`);
        continue;
      }
      after.delete(key(path));
      deleted.push(path);
      continue;
    }
    if (!["create", "modify", "update", "write_file"].includes(action.action) || typeof action.proposedContent !== "string") continue;
    const existed = after.has(key(path));
    after.set(key(path), {
      active: owned.has(key(path)),
      content: action.proposedContent,
      path,
      source: existed ? "proposal_update" : "proposal_create",
      websiteOwned: owned.has(key(path))
    });
    (existed ? updated : created).push(path);
  }
  const activePaths = [...owned]
    .map((ownedKey) => after.get(ownedKey)?.path)
    .filter((path): path is string => Boolean(path));
  for (const file of after.values()) file.active = activePaths.some((path) => key(path) === key(file.path));
  const protectedFiles = [...after.values()].filter((file) => !file.websiteOwned).map((file) => file.path);
  const activeSupportFiles = activePaths.filter((path) => /^(?:styles\.css|main\.js|HASSALI(?:\.website)?\.md)$/i.test(path));
  const activeAssetFiles = activePaths.filter((path) => !path.endsWith(".html") && !activeSupportFiles.includes(path));
  const graph = buildGraph(after, [...pages, ...activeSupportFiles, ...activeAssetFiles].filter((path) => after.has(key(path))));
  return {
    actions: input.actions,
    activeAssetFiles,
    activeHtmlFiles: pages.filter((path) => after.has(key(path))),
    activeSupportFiles,
    after,
    before,
    canonicalDomain: input.canonicalDomain ?? null,
    canonicalOwnedFiles: [...owned].map((ownedKey) => after.get(ownedKey)?.path ?? before.get(ownedKey)?.path).filter((path): path is string => Boolean(path)),
    canonicalPageFiles: pages,
    conflicts,
    created,
    deleted,
    graph,
    preserved: activePaths.filter((path) => !created.includes(path) && !updated.includes(path)),
    profile: input.profile ?? validationProfileForWebsiteScope(input.requestScope),
    projectId: input.projectId ?? null,
    protected: protectedFiles,
    requestScope: input.requestScope,
    updated
  };
}

export function virtualFilesystemFiles(filesystem: WebsiteVirtualFilesystem) {
  const active = new Set([
    ...filesystem.canonicalPageFiles,
    ...filesystem.activeSupportFiles,
    ...filesystem.activeAssetFiles
  ].map(key));
  return [...filesystem.after.values()]
    .filter((file) => active.has(key(file.path)))
    .map((file) => ({ content: file.content, path: file.path }));
}

export function repairWebsiteVirtualReferenceTypos(filesystem: WebsiteVirtualFilesystem) {
  const mutableActions = filesystem.actions.map((action) => ({ ...action }));
  const activePaths = [...filesystem.after.values()].filter((file) => file.active).map((file) => file.path);
  const repairs: WebsiteVirtualReferenceRepair[] = [];

  for (const issue of filesystem.graph.issues) {
    if (issue.kind !== "missing_target" || !issue.target) continue;
    const originalTarget = issue.target;
    const action = mutableActions.find((candidate) =>
      normalizeWebsitePath(candidate.path)?.toLowerCase() === issue.from.toLowerCase() &&
      typeof candidate.proposedContent === "string"
    );
    if (!action?.proposedContent) continue;

    const targetExtension = originalTarget.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "";
    const candidates = activePaths
      .filter((path) => (path.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? "") === targetExtension)
      .map((path) => ({ distance: editDistance(originalTarget.toLowerCase(), path.toLowerCase()), path }))
      .filter((candidate) => candidate.distance <= 2)
      .sort((left, right) => left.distance - right.distance || left.path.localeCompare(right.path));
    if (candidates.length !== 1) continue;

    const repairedTarget = candidates[0]?.path;
    if (!repairedTarget) continue;
    const quotedReference = new RegExp(`(["'])${escapeRegExp(issue.rawReference)}\\1`, "g");
    const nextContent = action.proposedContent.replace(quotedReference, `$1${repairedTarget}$1`);
    if (nextContent === action.proposedContent) continue;
    action.proposedContent = nextContent;
    repairs.push({ from: issue.from, originalTarget, repairedTarget });
  }

  return { actions: mutableActions, repairs };
}
