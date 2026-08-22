export type CuratedAssetLicense = "allowed" | "attribution_required" | "disallowed" | "unknown";
export type CuratedAssetOrientation = "landscape" | "portrait" | "square" | "unknown";
export type CuratedAssetProvenance = "generated" | "hassali_curated" | "project_existing" | "user_upload";

export type CuratedAssetRecord = {
  active: boolean;
  aspectRatio?: number;
  attribution?: string;
  colorHints?: string[];
  domain: string;
  id: string;
  license: CuratedAssetLicense;
  orientation: CuratedAssetOrientation;
  people?: boolean;
  productionEvidence?: boolean;
  publicPath: string;
  quality: number;
  roles: string[];
  style: string[];
  subjects: string[];
};

export type AssetSelectionRequest = {
  aspectRatio?: number;
  colorHints?: string[];
  domain: string;
  orientation?: CuratedAssetOrientation;
  people?: boolean;
  productionEvidence?: boolean;
  role: string;
  style?: string[];
  subjects?: string[];
};

export type ResolvedExperienceMedia = {
  id: string;
  license: CuratedAssetLicense | "user_supplied";
  provenance: CuratedAssetProvenance;
  score: number;
  url: string;
};

export interface GeneratedMediaProvider {
  generate(input: {
    aspectRatio?: number;
    domain: string;
    purpose: string;
    role: string;
    style: string[];
    subjects: string[];
  }): Promise<{ id: string; url: string } | null>;
}

export const DEFAULT_HASSALI_ASSET_ORIGIN = "https://assets.hassali.site";

function tokens(values: string[] | undefined) {
  return new Set((values ?? []).flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/)).filter(Boolean));
}

function overlap(left: string[] | undefined, right: string[] | undefined) {
  const leftTokens = tokens(left);
  return [...tokens(right)].filter((value) => leftTokens.has(value)).length;
}

function safeOrigin(origin: string) {
  const parsed = new URL(origin);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("The curated asset origin must be a credential-free HTTPS origin.");
  }
  return parsed.origin;
}

function safePublicPath(value: string) {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..") || /^[a-z]+:/i.test(normalized)) {
    throw new Error(`Unsafe curated asset path: ${value || "unknown"}.`);
  }
  return normalized;
}

export function resolveCuratedAssetUrl(publicPath: string, origin = DEFAULT_HASSALI_ASSET_ORIGIN) {
  return `${safeOrigin(origin)}/${safePublicPath(publicPath)}`;
}

export function rankCuratedAssets(records: CuratedAssetRecord[], request: AssetSelectionRequest) {
  const requestedDomain = request.domain.toLowerCase();
  return records
    .filter((record) => record.active)
    .filter((record) => record.license === "allowed" || record.license === "attribution_required")
    .filter((record) => record.domain.toLowerCase() === requestedDomain || record.domain === "general")
    .filter((record) => record.roles.includes(request.role))
    .filter((record) => request.people === undefined || record.people === request.people)
    .filter((record) => !request.productionEvidence || record.productionEvidence)
    .map((record) => {
      let score = Math.max(0, Math.min(100, record.quality));
      if (record.domain.toLowerCase() === requestedDomain) score += 100;
      if (record.roles.includes(request.role)) score += 45;
      score += overlap(record.subjects, request.subjects) * 12;
      score += overlap(record.style, request.style) * 7;
      score += overlap(record.colorHints, request.colorHints) * 3;
      if (request.orientation && record.orientation === request.orientation) score += 10;
      if (request.aspectRatio && record.aspectRatio) {
        score += Math.max(0, 12 - Math.abs(record.aspectRatio - request.aspectRatio) * 12);
      }
      return { record, score };
    })
    .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id));
}

export function createHassaliCuratedAssetProvider(input: {
  origin?: string;
  records: CuratedAssetRecord[];
}) {
  const origin = safeOrigin(input.origin ?? DEFAULT_HASSALI_ASSET_ORIGIN);
  const records = [...input.records];
  return {
    id: "hassali_curated" as const,
    list() {
      return [...records];
    },
    select(request: AssetSelectionRequest): ResolvedExperienceMedia | null {
      const selected = rankCuratedAssets(records, request)[0];
      if (!selected) return null;
      return {
        id: selected.record.id,
        license: selected.record.license,
        provenance: "hassali_curated",
        score: selected.score,
        url: resolveCuratedAssetUrl(selected.record.publicPath, origin)
      };
    }
  };
}

export async function resolveExperienceMedia(input: {
  curatedProvider?: ReturnType<typeof createHassaliCuratedAssetProvider>;
  existingProjectAssets?: Array<ResolvedExperienceMedia & { role: string }>;
  generatedProvider?: GeneratedMediaProvider;
  optional: boolean;
  request: AssetSelectionRequest;
  requestedUserAssetIds?: string[];
  userAssets?: Array<ResolvedExperienceMedia & { role: string }>;
}): Promise<ResolvedExperienceMedia | null> {
  const explicitlyRequested = new Set(input.requestedUserAssetIds ?? []);
  const userAsset = (input.userAssets ?? []).find((asset) => explicitlyRequested.has(asset.id) && asset.role === input.request.role);
  if (userAsset) return { ...userAsset, license: "user_supplied", provenance: "user_upload" };

  const curated = input.curatedProvider?.select(input.request) ?? null;
  if (curated) return curated;

  const existing = (input.existingProjectAssets ?? []).find((asset) => asset.role === input.request.role);
  if (existing) return { ...existing, provenance: "project_existing" };

  if (input.generatedProvider) {
    const generated = await input.generatedProvider.generate({
      aspectRatio: input.request.aspectRatio,
      domain: input.request.domain,
      purpose: `Website ${input.request.role}`,
      role: input.request.role,
      style: input.request.style ?? [],
      subjects: input.request.subjects ?? []
    });
    if (generated) {
      return { id: generated.id, license: "allowed", provenance: "generated", score: 0, url: generated.url };
    }
  }

  if (input.optional) return null;
  throw new Error("No suitable licensed media is available for the required role.");
}
