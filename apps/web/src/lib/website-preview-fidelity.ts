export type WebsitePreviewFailureClass =
  | "MISSING_ASSET"
  | "MISSING_ENTRY_ROUTE"
  | "NONE"
  | "PREVIEW_CONTENT_MISMATCH"
  | "WORKSPACE_MISMATCH";

export type WebsitePreviewFidelityResult = {
  assetPathsVerified: boolean;
  expectedIdentity: string | null;
  failureClass: WebsitePreviewFailureClass;
  failureDetails: string | null;
  filesApplied: boolean;
  generatedRouteVerified: boolean;
  generatedWorkspaceVerified: boolean;
  httpReadiness: "NOT_APPLICABLE_SRC_DOC";
  observedIdentity: string | null;
  previewAttempted: boolean;
  previewContentVerified: boolean;
  previewReady: boolean;
  previewType: "static_website";
  previewUrl: null;
  recoverySteps: string[];
  route: string;
  summary: string;
};

function normalizePath(value: string) {
  const parts: string[] = [];
  value
    .replace(/\\/g, "/")
    .replace(/[?#].*$/, "")
    .replace(/^\/+/, "")
    .split("/")
    .forEach((part) => {
      if (!part || part === ".") return;
      if (part === "..") parts.pop();
      else parts.push(part);
    });
  return parts.join("/");
}

function directory(path: string) {
  const index = path.lastIndexOf("/");
  return index >= 0 ? path.slice(0, index + 1) : "";
}

function isExternalReference(reference: string) {
  return /^(?:#|data:|blob:|mailto:|tel:|https?:\/\/|\/\/)/i.test(reference.trim());
}

function localReferences(path: string, content: string) {
  const references = [
    ...Array.from(content.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi), (match) => match[1] ?? ""),
    ...Array.from(content.matchAll(/\burl\(\s*["']?([^"')]+)["']?\s*\)/gi), (match) => match[1] ?? "")
  ];
  return references
    .map((reference) => reference.trim())
    .filter((reference) => reference && !isExternalReference(reference))
    .map((reference) => normalizePath(`${directory(path)}${reference}`))
    .filter(Boolean);
}

export function extractWebsitePreviewIdentity(html: string) {
  const meta = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']hassali-preview-identity["'])(?=[^>]*\bcontent\s*=\s*["']([^"']+)["'])[^>]*>/i);
  if (meta?.[1]) return meta[1].trim();
  const reverseMeta = html.match(/<meta\b(?=[^>]*\bcontent\s*=\s*["']([^"']+)["'])(?=[^>]*\bname\s*=\s*["']hassali-preview-identity["'])[^>]*>/i);
  if (reverseMeta?.[1]) return reverseMeta[1].trim();
  return html.match(/\bdata-hassali-preview-identity\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() ?? null;
}

export function verifyWebsitePreviewFidelity(input: {
  entryRoute?: string;
  expectedAssetPaths?: string[];
  expectedIdentity?: string | null;
  files: Record<string, string>;
  filesApplied: boolean;
  workspaceMatches: boolean;
}): WebsitePreviewFidelityResult {
  const files = new Map(
    Object.entries(input.files).map(([path, content]) => [normalizePath(path), content])
  );
  const route = normalizePath(input.entryRoute ?? "index.html") || "index.html";
  const entry = files.get(route);
  const expectedIdentity = input.expectedIdentity?.trim() || null;
  const observedIdentity = entry ? extractWebsitePreviewIdentity(entry) : null;
  const generatedRouteVerified = typeof entry === "string";
  const generatedWorkspaceVerified = input.workspaceMatches;
  const expectedAssets = (input.expectedAssetPaths ?? []).map(normalizePath).filter(Boolean);
  const referencedAssets = Array.from(files.entries())
    .filter(([path]) => /\.(?:css|html|js)$/i.test(path))
    .flatMap(([path, content]) => localReferences(path, content));
  const missingAssets = Array.from(new Set([...expectedAssets, ...referencedAssets]))
    .filter((path) => !files.has(path));
  const assetPathsVerified = missingAssets.length === 0;
  const previewContentVerified = Boolean(
    expectedIdentity &&
    observedIdentity &&
    expectedIdentity === observedIdentity
  );
  let failureClass: WebsitePreviewFailureClass = "NONE";
  let failureDetails: string | null = null;

  if (!generatedWorkspaceVerified) {
    failureClass = "WORKSPACE_MISMATCH";
    failureDetails = "The applied project workspace does not match the approved WEBSITE proposal.";
  } else if (!generatedRouteVerified) {
    failureClass = "MISSING_ENTRY_ROUTE";
    failureDetails = `The generated entry route ${route} is missing from the applied workspace.`;
  } else if (!previewContentVerified) {
    failureClass = "PREVIEW_CONTENT_MISMATCH";
    failureDetails = expectedIdentity
      ? `Expected preview content ${expectedIdentity}, but observed ${observedIdentity ?? "no content identity marker"}.`
      : "The approved WEBSITE proposal did not include a content identity marker.";
  } else if (!assetPathsVerified) {
    failureClass = "MISSING_ASSET";
    failureDetails = `The static preview is missing local file references: ${missingAssets.slice(0, 8).join(", ")}.`;
  }

  const previewReady = input.filesApplied &&
    failureClass === "NONE" &&
    generatedWorkspaceVerified &&
    generatedRouteVerified &&
    previewContentVerified &&
    assetPathsVerified;
  return {
    assetPathsVerified,
    expectedIdentity,
    failureClass,
    failureDetails,
    filesApplied: input.filesApplied,
    generatedRouteVerified,
    generatedWorkspaceVerified,
    httpReadiness: "NOT_APPLICABLE_SRC_DOC",
    observedIdentity,
    previewAttempted: true,
    previewContentVerified,
    previewReady,
    previewType: "static_website",
    previewUrl: null,
    recoverySteps: previewReady
      ? []
      : [
          "Reload the approved project files into the static preview.",
          "Regenerate the WEBSITE proposal if the expected content identity or local assets still do not match."
        ],
    route,
    summary: previewReady
      ? "The website files were created and the static srcDoc preview content was verified."
      : "The website files were created, but the static preview could not be verified against the newly generated content."
  };
}
