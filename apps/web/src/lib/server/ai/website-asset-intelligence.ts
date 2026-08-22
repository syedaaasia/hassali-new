import {
  analyzeWebsiteCinematicAssets,
  type WebsiteCinematicAssetInput,
  type WebsiteCinematicSequenceCandidate
} from "@/lib/server/ai/website-cinematic-asset-analyzer";
import type { WebsiteMediaAsset } from "@/lib/server/ai/website-media-registry";

export type WebsiteAssetRole =
  | "archive"
  | "cinematic_frame"
  | "hero_candidate"
  | "illustration"
  | "logo"
  | "product"
  | "supporting"
  | "unrelated";

export type WebsiteAssetRecord = {
  aspectRatio: number | null;
  height: number | null;
  path: string;
  reasons: string[];
  role: WebsiteAssetRole;
  semanticTags: string[];
  width: number | null;
};

export type WebsiteAssetIntelligence = {
  archiveStatus: "none" | "raw_zip_upload_layer_blocked";
  archives: string[];
  cinematicSequences: WebsiteCinematicSequenceCandidate[];
  duplicates: Array<{ canonicalPath: string; duplicatePaths: string[] }>;
  heroCandidates: string[];
  records: WebsiteAssetRecord[];
  supportingAssets: string[];
  unrelatedAssets: string[];
  warnings: string[];
};

const imagePattern = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

function normalize(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function terms(value: string) {
  return normalize(value)
    .replace(/\.[a-z0-9]+$/i, "")
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

function contentFingerprint(asset: WebsiteCinematicAssetInput) {
  if (!asset.content || asset.content.length < 24) return null;
  const sample = `${asset.content.slice(0, 96)}|${asset.content.slice(-96)}|${asset.content.length}`;
  let hash = 2166136261;
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${asset.width ?? 0}x${asset.height ?? 0}:${hash >>> 0}`;
}

function semanticTags(path: string, capabilities: string[], visualSubjects: string[]) {
  const pathTerms = new Set(terms(path));
  const candidates = [...capabilities, ...visualSubjects]
    .flatMap((value) => terms(value))
    .filter((value, index, values) => values.indexOf(value) === index);
  return candidates.filter((candidate) => pathTerms.has(candidate));
}

function classifyRole(input: {
  asset: WebsiteCinematicAssetInput;
  explicitlySupplied: boolean;
  sequencePaths: Set<string>;
  semanticMatches: string[];
}): { reasons: string[]; role: WebsiteAssetRole } {
  const path = normalize(input.asset.path);
  const pathTerms = terms(path);
  if (path.startsWith("/") || path.split("/").includes("..")) {
    return { reasons: ["Asset path is not project-relative and was excluded."], role: "unrelated" };
  }
  if (/\.zip$/i.test(path)) return { reasons: ["Archive extraction belongs to the binary upload layer."], role: "archive" };
  if (input.sequencePaths.has(path)) return { reasons: ["Numbered image belongs to a detected cinematic sequence."], role: "cinematic_frame" };
  if (!imagePattern.test(path)) return { reasons: ["Asset is not a supported website image."], role: "unrelated" };
  if (pathTerms.some((term) => /^(?:brand|favicon|logo|mark|wordmark)$/.test(term))) {
    return { reasons: ["Filename indicates brand identity artwork."], role: "logo" };
  }
  if (input.explicitlySupplied) {
    return { reasons: ["The current user explicitly supplied this image for the requested WEBSITE change."], role: "hero_candidate" };
  }
  if (pathTerms.some((term) => /^(?:hero|banner|cover|masthead)$/.test(term))) {
    return { reasons: ["Filename indicates a primary hero image."], role: "hero_candidate" };
  }
  if (pathTerms.some((term) => /^(?:product|item|model|sku|collection)$/.test(term)) || input.semanticMatches.length >= 2) {
    return { reasons: ["Asset filename overlaps product or domain semantics."], role: "product" };
  }
  if (pathTerms.some((term) => /^(?:diagram|illustration|render|drawing|plan)$/.test(term))) {
    return { reasons: ["Filename indicates explanatory illustration."], role: "illustration" };
  }
  if (input.semanticMatches.length) {
    return { reasons: ["Asset filename overlaps the current website domain."], role: "supporting" };
  }
  return { reasons: ["No reliable relationship to the current website was found."], role: "unrelated" };
}

export function analyzeWebsiteAssets(input: {
  assets: WebsiteCinematicAssetInput[];
  capabilities: string[];
  explicitAssetPaths?: string[];
  visualSubjects: string[];
}): WebsiteAssetIntelligence {
  const cinematic = analyzeWebsiteCinematicAssets(input.assets);
  const sequencePaths = new Set(
    cinematic.sequences.flatMap((sequence) => sequence.frames.map((frame) => normalize(frame.path)))
  );
  const records = input.assets.map((asset): WebsiteAssetRecord => {
    const matches = semanticTags(asset.path, input.capabilities, input.visualSubjects);
    const classified = classifyRole({
      asset,
      explicitlySupplied: (input.explicitAssetPaths ?? []).some((path) => normalize(path) === normalize(asset.path)),
      semanticMatches: matches,
      sequencePaths
    });
    return {
      aspectRatio: asset.width && asset.height ? Number((asset.width / asset.height).toFixed(3)) : null,
      height: asset.height ?? null,
      path: asset.path,
      reasons: classified.reasons,
      role: classified.role,
      semanticTags: matches,
      width: asset.width ?? null
    };
  });

  const fingerprintGroups = new Map<string, string[]>();
  input.assets.forEach((asset) => {
    const fingerprint = contentFingerprint(asset);
    if (!fingerprint) return;
    const paths = fingerprintGroups.get(fingerprint) ?? [];
    paths.push(asset.path);
    fingerprintGroups.set(fingerprint, paths);
  });
  const duplicates = [...fingerprintGroups.values()]
    .filter((paths) => paths.length > 1)
    .map((paths) => ({ canonicalPath: paths[0], duplicatePaths: paths.slice(1) }));
  const heroCandidates = records
    .filter((record) => record.role === "hero_candidate" || (record.role === "product" && (record.aspectRatio ?? 0) >= 1.35))
    .map((record) => record.path)
    .slice(0, 4);
  const supportingAssets = records
    .filter((record) => ["illustration", "product", "supporting"].includes(record.role))
    .map((record) => record.path);
  const unrelatedAssets = records.filter((record) => record.role === "unrelated").map((record) => record.path);

  return {
    archiveStatus: cinematic.archives.length ? "raw_zip_upload_layer_blocked" : "none",
    archives: cinematic.archives,
    cinematicSequences: cinematic.sequences,
    duplicates,
    heroCandidates,
    records,
    supportingAssets,
    unrelatedAssets,
    warnings: [
      ...cinematic.warnings,
      ...(duplicates.length ? [`${duplicates.length} repeated asset group(s) were excluded from repeated placement.`] : []),
      ...(unrelatedAssets.length ? [`${unrelatedAssets.length} asset(s) lack enough semantic evidence for automatic placement.`] : [])
    ]
  };
}

function assetSlug(value: string) {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

export function workspaceMediaFromAssetIntelligence(
  intelligence: WebsiteAssetIntelligence,
  businessType: string
): WebsiteMediaAsset[] {
  const duplicatePaths = new Set(intelligence.duplicates.flatMap((group) => group.duplicatePaths));
  const eligible = intelligence.records.filter((record) =>
    ["hero_candidate", "illustration", "logo", "product", "supporting"].includes(record.role) &&
    (!duplicatePaths.has(record.path) || record.role === "hero_candidate")
  );
  const hero = eligible.find((record) => record.role === "hero_candidate") ?? eligible.find((record) => record.role === "product");
  return eligible.slice(0, 7).map((record, index) => {
    const width = record.width ?? (record.aspectRatio && record.aspectRatio < 1 ? 900 : 1200);
    const height = record.height ?? Math.round(width / (record.aspectRatio || 4 / 3));
    const id = `workspace-${assetSlug(record.path)}`;
    return {
      alt: `${businessType} ${record.semanticTags.join(" ") || record.role.replace(/_/g, " ")} visual`,
      aspectRatio: `${width}:${height}`,
      attributionPolicy: {
        display: "editor_only",
        editorWarning: "Confirm that this project-supplied image is cleared for publication.",
        sourceName: "Project workspace"
      },
      decorative: false,
      fallbackAsset: `assets/${id}-fallback.svg`,
      forbiddenDomains: [],
      height,
      id,
      lastVerifiedAt: "project-supplied",
      licenseNote: "Project-supplied asset; publication rights must be confirmed by the project owner.",
      provider: "workspace",
      reliability: "curated",
      role: record.role === "logo" ? "logo" : record.path === hero?.path ? "hero" : index < 6 ? "card" : "team",
      semanticTags: record.semanticTags.length ? record.semanticTags : [businessType.toLowerCase()],
      url: `./${record.path.replace(/^\.\//, "")}`,
      width
    };
  });
}
