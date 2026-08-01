import { projectFileDataUrl } from "@/lib/project-binary-asset";

export type StaticPreviewCompilationInput = {
  activeHtmlPath: string;
  files: Record<string, string>;
  projectId: string;
};

export type StaticPreviewDiagnostic = {
  code: string;
  message: string;
  path: string | null;
  reference: string | null;
  severity: "blocking" | "warning";
};

export type StaticPreviewCompilationResult = {
  diagnostics: StaticPreviewDiagnostic[];
  referencedFiles: string[];
  srcDoc: string;
  unresolvedFiles: string[];
};

type FileIndex = {
  ambiguousLowerPaths: Set<string>;
  byLowerPath: Map<string, string>;
  files: Record<string, string>;
};

type ResolvedReference =
  | { kind: "external"; value: string }
  | { kind: "invalid"; code: string; message: string }
  | { kind: "local"; fragment: string; path: string; query: string };

const externalReferencePattern = /^(?:https?:|data:|blob:|mailto:|tel:|#|\/\/)/i;
const unsafeSchemePattern = /^(?:file:|javascript:|vbscript:)/i;

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeInlineScript(value: string) {
  return value.replace(/<\/script/gi, "<\\/script");
}

function escapeInlineStyle(value: string) {
  return value.replace(/<\/style/gi, "<\\/style");
}

function decodeReferencePath(value: string) {
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }
  return decoded;
}

function splitSuffix(reference: string) {
  const fragmentIndex = reference.indexOf("#");
  const withoutFragment = fragmentIndex >= 0 ? reference.slice(0, fragmentIndex) : reference;
  const fragment = fragmentIndex >= 0 ? reference.slice(fragmentIndex) : "";
  const queryIndex = withoutFragment.indexOf("?");
  return {
    fragment,
    path: queryIndex >= 0 ? withoutFragment.slice(0, queryIndex) : withoutFragment,
    query: queryIndex >= 0 ? withoutFragment.slice(queryIndex) : ""
  };
}

function normalizeFilePath(value: string) {
  const decoded = decodeReferencePath(value.trim().replace(/\\/g, "/"));
  if (!decoded || decoded.includes("\0") || /^[a-z]:\//i.test(decoded) || decoded.startsWith("//")) return null;
  const segments: string[] = [];
  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") return null;
    segments.push(segment);
  }
  return segments.join("/");
}

function buildFileIndex(inputFiles: Record<string, string>): FileIndex {
  const files: Record<string, string> = {};
  const byLowerPath = new Map<string, string>();
  const ambiguousLowerPaths = new Set<string>();

  for (const [rawPath, content] of Object.entries(inputFiles)) {
    const path = normalizeFilePath(rawPath);
    if (!path) continue;
    files[path] = content;
    const lower = path.toLowerCase();
    const existing = byLowerPath.get(lower);
    if (existing && existing !== path) ambiguousLowerPaths.add(lower);
    else byLowerPath.set(lower, path);
  }

  return { ambiguousLowerPaths, byLowerPath, files };
}

function resolveReference(index: FileIndex, activePath: string, rawReference: string): ResolvedReference {
  const reference = rawReference.trim();
  if (!reference || externalReferencePattern.test(reference)) return { kind: "external", value: reference };
  if (unsafeSchemePattern.test(reference)) {
    return { kind: "invalid", code: "UNSAFE_SCHEME", message: "Unsafe local reference scheme was blocked." };
  }

  const suffix = splitSuffix(reference);
  const decoded = decodeReferencePath(suffix.path.replace(/\\/g, "/"));
  if (decoded === null) {
    return { kind: "invalid", code: "MALFORMED_ENCODING", message: "Malformed encoded local reference was blocked." };
  }
  if (/^[a-z]:\//i.test(decoded) || decoded.startsWith("//") || decoded.includes("\0")) {
    return { kind: "invalid", code: "ABSOLUTE_PATH", message: "Absolute filesystem reference was blocked." };
  }

  const baseSegments = decoded.startsWith("/")
    ? []
    : activePath.split("/").slice(0, -1).filter(Boolean);
  const segments = [...baseSegments];
  for (const segment of decoded.replace(/^\/+/, "").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) {
        return { kind: "invalid", code: "PATH_TRAVERSAL", message: "Reference escapes the virtual project root." };
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const candidate = segments.join("/");
  const lower = candidate.toLowerCase();
  if (index.ambiguousLowerPaths.has(lower)) {
    return { kind: "invalid", code: "CASE_COLLISION", message: "Reference is ambiguous because project paths differ only by case." };
  }
  const path = index.files[candidate] !== undefined ? candidate : index.byLowerPath.get(lower) ?? candidate;
  return { fragment: suffix.fragment, kind: "local", path, query: suffix.query };
}

function mimeFor(path: string) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === "css") return "text/css";
  if (extension === "html" || extension === "htm") return "text/html";
  if (extension === "js" || extension === "mjs") return "text/javascript";
  if (extension === "json" || extension === "webmanifest") return "application/json";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "avif") return "image/avif";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "xml") return "application/xml";
  if (extension === "txt") return "text/plain";
  return "application/octet-stream";
}

function dataUrl(path: string, content: string) {
  const binaryAsset = projectFileDataUrl(content);
  if (binaryAsset) return binaryAsset;
  if (/^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,/i.test(content.trim())) return content.trim();
  return `data:${mimeFor(path)};charset=utf-8,${encodeURIComponent(content)}`;
}

function transparentAssetDataUrl(label: string) {
  return dataUrl(
    "missing.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img"><title>${label.replace(/[<>&]/g, "")}</title><rect width="64" height="64" fill="transparent"/></svg>`
  );
}

export function compileStaticPreview(input: StaticPreviewCompilationInput): StaticPreviewCompilationResult {
  const index = buildFileIndex(input.files);
  const diagnostics: StaticPreviewDiagnostic[] = [];
  const referencedFiles = new Set<string>();
  const unresolvedFiles = new Set<string>();
  const diagnosticKeys = new Set<string>();
  const activeHtmlPath = normalizeFilePath(input.activeHtmlPath || "index.html") ?? "index.html";

  const addDiagnostic = (diagnostic: StaticPreviewDiagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.path ?? ""}:${diagnostic.reference ?? ""}`;
    if (diagnosticKeys.has(key)) return;
    diagnosticKeys.add(key);
    diagnostics.push(diagnostic);
  };

  for (const lower of index.ambiguousLowerPaths) {
    addDiagnostic({
      code: "CASE_COLLISION",
      message: `Virtual project contains paths that differ only by case: ${lower}.`,
      path: null,
      reference: lower,
      severity: "blocking"
    });
  }

  const resolveLocal = (fromPath: string, reference: string, critical: boolean) => {
    const resolved = resolveReference(index, fromPath, reference);
    if (resolved.kind === "external") return resolved.value;
    if (resolved.kind === "invalid") {
      addDiagnostic({ code: resolved.code, message: resolved.message, path: fromPath, reference, severity: "blocking" });
      return critical ? transparentAssetDataUrl("Unavailable local asset") : "";
    }
    if (index.files[resolved.path] === undefined) {
      unresolvedFiles.add(resolved.path);
      addDiagnostic({
        code: critical ? "CRITICAL_ASSET_MISSING" : "LOCAL_REFERENCE_MISSING",
        message: `Local preview reference could not be resolved: ${resolved.path}.`,
        path: fromPath,
        reference,
        severity: critical ? "blocking" : "warning"
      });
      return critical ? transparentAssetDataUrl("Unavailable local asset") : "";
    }
    referencedFiles.add(resolved.path);
    return resolved;
  };

  const rewriteCss = (content: string, cssPath: string, stack: Set<string>): string => {
    if (stack.has(cssPath)) {
      addDiagnostic({ code: "CYCLIC_CSS_IMPORT", message: "Cyclic CSS import was blocked.", path: cssPath, reference: cssPath, severity: "blocking" });
      return "";
    }
    const nextStack = new Set(stack).add(cssPath);
    let rewritten = content.replace(
      /@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?\s*;/gi,
      (_match, _quote: string, reference: string) => {
        const resolved = resolveLocal(cssPath, reference, false);
        if (typeof resolved === "string") return resolved ? `@import url("${resolved}");` : "";
        const imported = rewriteCss(index.files[resolved.path], resolved.path, nextStack);
        return `/* inlined ${resolved.path} */\n${imported}`;
      }
    );
    rewritten = rewritten.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, _quote: string, reference: string) => {
      const resolved = resolveLocal(cssPath, reference, /(?:logo|favicon|fallback)/i.test(reference));
      if (typeof resolved === "string") return resolved ? `url("${resolved}")` : "none";
      const assetContent = rewriteAsset(index.files[resolved.path], resolved.path, nextStack);
      return `url("${dataUrl(resolved.path, assetContent)}${resolved.fragment}")`;
    });
    return rewritten;
  };

  const rewriteSvg = (content: string, svgPath: string, stack: Set<string>): string => content.replace(
    /\b(xlink:href|href)\s*=\s*(["'])([^"']+)\2/gi,
    (match, attribute: string, quote: string, reference: string) => {
      const resolved = resolveLocal(svgPath, reference, false);
      if (typeof resolved === "string") return resolved ? `${attribute}=${quote}${escapeAttribute(resolved)}${quote}` : match;
      const nested = rewriteAsset(index.files[resolved.path], resolved.path, stack);
      return `${attribute}=${quote}${escapeAttribute(`${dataUrl(resolved.path, nested)}${resolved.fragment}`)}${quote}`;
    }
  );

  const rewriteSequenceManifest = (content: string, manifestPath: string) => content.replace(
    /(["'])__HASSALI_SEQUENCE_ASSET__(\.\/?[^"']+)\1/g,
    (match, _quote: string, reference: string) => {
      const resolved = resolveLocal(manifestPath, reference, true);
      if (typeof resolved === "string") return match;
      const assetContent = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
      return JSON.stringify(`${dataUrl(resolved.path, assetContent)}${resolved.fragment}`);
    }
  );

  function rewriteAsset(content: string, path: string, stack: Set<string>): string {
    if (/\.css$/i.test(path)) return rewriteCss(content, path, stack);
    if (/\.svg$/i.test(path)) return rewriteSvg(content, path, stack);
    if (/(?:^|\/)sequence-manifest\.js$/i.test(path)) return rewriteSequenceManifest(content, path);
    return content;
  }

  const html = index.files[activeHtmlPath];
  if (html === undefined) {
    addDiagnostic({ code: "HTML_ENTRY_MISSING", message: `Preview page ${activeHtmlPath} does not exist.`, path: activeHtmlPath, reference: null, severity: "blocking" });
    return {
      diagnostics,
      referencedFiles: [],
      srcDoc: `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:2rem"><h1>Preview page unavailable</h1><p>${escapeAttribute(activeHtmlPath)}</p></body></html>`,
      unresolvedFiles: [activeHtmlPath]
    };
  }
  referencedFiles.add(activeHtmlPath);

  let srcDoc = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const href = tag.match(/\bhref\s*=\s*(["'])([^"']+)\1/i)?.[2];
    const rel = tag.match(/\brel\s*=\s*(["'])([^"']+)\1/i)?.[2]?.toLowerCase() ?? "";
    if (!href) return tag;
    const critical = /(?:icon|manifest)/.test(rel) || /(?:logo|favicon)/i.test(href);
    const resolved = resolveLocal(activeHtmlPath, href, critical);
    if (typeof resolved === "string") return resolved === href ? tag : tag.replace(href, escapeAttribute(resolved));
    const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
    if (rel.includes("stylesheet")) {
      return `<style data-preview-source="${escapeAttribute(resolved.path)}">${escapeInlineStyle(content)}</style>`;
    }
    return tag.replace(href, escapeAttribute(`${dataUrl(resolved.path, content)}${resolved.fragment}`));
  });

  srcDoc = srcDoc.replace(/<script\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)><\/script>/gi, (tag, before: string, _quote: string, reference: string, after: string) => {
    const resolved = resolveLocal(activeHtmlPath, reference, true);
    if (typeof resolved === "string") return resolved === reference ? tag : "";
    const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
    return `<script${before}${after} data-preview-source="${escapeAttribute(resolved.path)}">${escapeInlineScript(content)}</script>`;
  });

  srcDoc = srcDoc.replace(/<a\b[^>]*>/gi, (tag) => {
    const hrefMatch = tag.match(/\bhref\s*=\s*(["'])([^"']+)\1/i);
    if (!hrefMatch) return tag;
    const reference = hrefMatch[2];
    if (unsafeSchemePattern.test(reference)) {
      addDiagnostic({ code: "UNSAFE_LINK", message: "Unsafe preview link was disabled.", path: activeHtmlPath, reference, severity: "blocking" });
      return tag.replace(hrefMatch[0], 'href="#" data-preview-link-blocked="true"');
    }
    if (/^(?:https?:|\/\/)/i.test(reference)) {
      return tag.replace(hrefMatch[0], `${hrefMatch[0]} data-preview-external="true"`);
    }
    if (/^(?:mailto:|tel:|#)/i.test(reference)) return tag;
    const resolved = resolveLocal(activeHtmlPath, reference, false);
    if (typeof resolved === "string") return resolved ? tag : tag.replace(hrefMatch[0], 'href="#" data-preview-link-blocked="true"');
    if (/\.html?$/i.test(resolved.path)) {
      return tag.replace(hrefMatch[0], `href="#" data-preview-page="${escapeAttribute(`${resolved.path}${resolved.fragment}`)}"`);
    }
    const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
    return tag.replace(hrefMatch[0], `href="${escapeAttribute(`${dataUrl(resolved.path, content)}${resolved.fragment}`)}"`);
  });

  srcDoc = srcDoc.replace(/<[^>]+>/g, (tag) => {
    if (/^<(?:a|script|style)\b/i.test(tag) || /^<\/(?:script|style)/i.test(tag)) return tag;
    let next = tag.replace(/\bsrcset\s*=\s*(["'])([^"']+)\1/gi, (_match, quote: string, value: string) => {
      const entries = value.split(",").map((entry) => {
        const [reference, descriptor] = entry.trim().split(/\s+/, 2);
        const resolved = resolveLocal(activeHtmlPath, reference, false);
        if (typeof resolved === "string") return resolved ? `${resolved}${descriptor ? ` ${descriptor}` : ""}` : "";
        const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
        return `${dataUrl(resolved.path, content)}${resolved.fragment}${descriptor ? ` ${descriptor}` : ""}`;
      }).filter(Boolean);
      return entries.length ? `srcset=${quote}${escapeAttribute(entries.join(", "))}${quote}` : "";
    });
    next = next.replace(/\b(src|poster|data-fallback-src|xlink:href)\s*=\s*(["'])([^"']+)\2/gi, (_match, attribute: string, quote: string, reference: string) => {
      const critical = attribute === "data-fallback-src" || /(?:logo|favicon|fallback)/i.test(reference);
      const resolved = resolveLocal(activeHtmlPath, reference, critical);
      if (typeof resolved === "string") return resolved ? `${attribute}=${quote}${escapeAttribute(resolved)}${quote}` : "";
      const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
      return `${attribute}=${quote}${escapeAttribute(`${dataUrl(resolved.path, content)}${resolved.fragment}`)}${quote}`;
    });
    if (/^<meta\b/i.test(next) && /(?:og:image|twitter:image)/i.test(next)) {
      next = next.replace(/\bcontent\s*=\s*(["'])([^"']+)\1/i, (_match, quote: string, reference: string) => {
        const resolved = resolveLocal(activeHtmlPath, reference, true);
        if (typeof resolved === "string") return `content=${quote}${escapeAttribute(resolved)}${quote}`;
        const content = rewriteAsset(index.files[resolved.path], resolved.path, new Set());
        return `content=${quote}${escapeAttribute(`${dataUrl(resolved.path, content)}${resolved.fragment}`)}${quote}`;
      });
    }
    return next;
  });

  const bridge = `<script data-hassali-static-preview-bridge>(()=>{"use strict";const projectId=${escapeInlineScript(JSON.stringify(input.projectId))};document.addEventListener("click",event=>{const target=event.target;const anchor=target&&target.closest?target.closest("a[href]"):null;if(!anchor)return;if(anchor.dataset.previewExternal==="true"||anchor.dataset.previewLinkBlocked==="true"){event.preventDefault();return;}const page=anchor.dataset.previewPage;if(!page)return;event.preventDefault();window.parent.postMessage({type:"HASSALI_STATIC_PREVIEW_NAVIGATE",projectId,path:page},"*");});})();</script>`;
  srcDoc = /<\/body>/i.test(srcDoc) ? srcDoc.replace(/<\/body>/i, `${bridge}</body>`) : `${srcDoc}${bridge}`;

  return {
    diagnostics,
    referencedFiles: [...referencedFiles].sort(),
    srcDoc,
    unresolvedFiles: [...unresolvedFiles].sort()
  };
}

export function resolveStaticPreviewPagePath(input: {
  activeHtmlPath: string;
  files: Record<string, string>;
  href: string;
}) {
  const index = buildFileIndex(input.files);
  const activePath = normalizeFilePath(input.activeHtmlPath || "index.html") ?? "index.html";
  const resolved = resolveReference(index, activePath, input.href);
  if (resolved.kind !== "local" || !/\.html?$/i.test(resolved.path) || index.files[resolved.path] === undefined) return null;
  return resolved.path;
}
