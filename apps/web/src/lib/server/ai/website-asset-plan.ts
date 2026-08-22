import type { WebsiteAssetIntelligence, WebsiteAssetRecord } from "@/lib/server/ai/website-asset-intelligence";
import type { WebsiteMediaAsset } from "@/lib/server/ai/website-media-registry";
import type { WebsiteCompositionStructure } from "@/lib/server/ai/composition-engine";
import type { ProjectDesignContract } from "@/lib/server/design/direction/project-design-contract";
import type { ImageGenerationRequest } from "@/lib/server/attachments/visual-contract";

export type WebsiteAssetRole =
  | "article_editorial"
  | "background"
  | "campaign_editorial"
  | "comparison"
  | "decorative"
  | "diagram"
  | "founder_team"
  | "gallery"
  | "hero_product"
  | "icon"
  | "ingredient_material"
  | "location"
  | "logo_brand_mark"
  | "no_asset_required"
  | "process"
  | "product_grid"
  | "testimonial_supporting"
  | "texture";

export type WebsiteAssetSource =
  | "curated"
  | "deterministic_local"
  | "existing_project"
  | "generated"
  | "none"
  | "user_upload";

export type WebsitePlannedAsset = {
  altTextIntent: string;
  aspectRatio: string;
  crop: "contain" | "cover" | "none";
  destination: { page: string; section: string };
  fallback: "composition_art" | "none" | "preserve_existing" | "typography";
  generationBrief?: ImageGenerationRequest;
  generationPermitted: boolean;
  id: string;
  kind: "illustration" | "image" | "logo" | "none" | "texture";
  modificationPermitted: boolean;
  provenance: string;
  replacementPermitted: boolean;
  responsive: {
    mobileCrop: "contain" | "cover" | "none";
    preserveSubject: boolean;
    sizes: string;
  };
  role: WebsiteAssetRole;
  source: WebsiteAssetSource;
  sourceAssetId?: string;
  sourcePath?: string;
  status: "planned" | "preserved" | "ready" | "unresolved";
};

export type WebsiteAssetPlan = {
  assets: WebsitePlannedAsset[];
  generationRequests: ImageGenerationRequest[];
  imageStrategy: "asset_led" | "balanced" | "image_light" | "typography_led";
  unresolved: string[];
  warnings: string[];
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function explicitRecord(records: WebsiteAssetRecord[], explicitPaths: Set<string>, role: WebsiteAssetRecord["role"]) {
  return records.find((record) => explicitPaths.has(record.path) && record.role === role);
}

function mediaForPath(media: WebsiteMediaAsset[], path: string | undefined) {
  if (!path) return null;
  const normalized = path.replace(/^\.\//, "");
  return media.find((asset) => asset.url.replace(/^\.\//, "") === normalized) ?? null;
}

function imageStrategy(input: {
  composition: WebsiteCompositionStructure;
  media: WebsiteMediaAsset[];
  prompt: string;
  projectDesignContract?: ProjectDesignContract | null;
}) {
  const referenceImagery = `${input.projectDesignContract?.imagery.direction ?? ""} ${input.projectDesignContract?.imagery.density ?? ""}`.toLowerCase();
  const text = `${input.prompt} ${input.projectDesignContract?.identity.archetype ?? ""}`.toLowerCase();
  const structure = JSON.stringify(input.composition).toLowerCase();
  const explicitlyImageFree = /\b(?:no|without|avoid)\s+(?:a\s+)?(?:hero\s+)?(?:image|images|imagery|photo|photography)\b/.test(`${input.prompt} ${referenceImagery}`);
  if (explicitlyImageFree) return "typography_led" as const;
  if (/photography[- ]first|image[- ]dominant|large .*photograph|full[- ]bleed .*image|product imagery carries|visual weight/.test(referenceImagery)) {
    return "asset_led" as const;
  }
  if (input.media.some((asset) => asset.role === "hero")) return "balanced" as const;
  if (/typography|text-led|editorial minimal|image-light/.test(`${text} ${structure}`)) return "typography_led" as const;
  if (input.media.length === 0 && /editorial|publication|journal|manifesto/.test(`${text} ${structure}`)) return "image_light" as const;
  if (input.media.some((asset) => asset.provider === "workspace")) return "asset_led" as const;
  return "balanced" as const;
}

function generationBrief(input: {
  aspectRatio: string;
  businessType: string;
  designContract?: ProjectDesignContract | null;
  role: WebsiteAssetRole;
  visualSubjects: string[];
}): ImageGenerationRequest {
  const palette = input.designContract
    ? [
        input.designContract.colors.background.value,
        input.designContract.colors.textPrimary.value,
        input.designContract.colors.primaryAction.value
      ]
    : [];
  const subjects = input.visualSubjects.slice(0, 5);
  return {
    aspectRatio: input.aspectRatio,
    mustAvoid: ["rendered words or typography", "unrelated products", "logos", "watermarks", "misleading real-world claims"],
    mustInclude: subjects.length ? subjects : [input.businessType],
    negativeConstraints: ["generic corporate stock photography", "floating product collage", "abstract gradient-only artwork"],
    prompt: [
      `${input.businessType} visual for the ${input.role.replace(/_/g, " ")} of a website.`,
      subjects.length ? `Subject matter: ${subjects.join(", ")}.` : "Stay specific to the stated business and offer.",
      palette.length ? `Use a restrained visual direction compatible with ${palette.join(", ")}.` : "Use a composition-specific, credible visual direction.",
      "Leave intentional negative space where interface copy needs room. Do not render text into the image."
    ].join(" "),
    styleConstraints: ["domain-specific", "composition-aware", "credible", "web-ready"]
  };
}

export function buildWebsiteAssetPlan(input: {
  assets: WebsiteAssetIntelligence;
  businessType: string;
  composition: WebsiteCompositionStructure;
  explicitAssetPaths?: string[];
  media: WebsiteMediaAsset[];
  projectDesignContract?: ProjectDesignContract | null;
  prompt: string;
  visualSubjects: string[];
}): WebsiteAssetPlan {
  const explicitPaths = new Set((input.explicitAssetPaths ?? []).map((path) => path.replace(/^\.\//, "")));
  const strategy = imageStrategy(input);
  const records = input.assets.records.filter((record) => record.role !== "archive" && record.role !== "cinematic_frame");
  const suppliedLogo = explicitRecord(records, explicitPaths, "logo") ?? records.find((record) => record.role === "logo");
  const suppliedHero = explicitRecord(records, explicitPaths, "hero_candidate") ?? explicitRecord(records, explicitPaths, "product");
  const selectedHero = suppliedHero ?? records.find((record) => record.role === "hero_candidate") ?? records.find((record) => record.role === "product");
  const planned: WebsitePlannedAsset[] = [];

  if (suppliedLogo) {
    planned.push({
      altTextIntent: `${input.businessType} brand mark`, aspectRatio: suppliedLogo.aspectRatio ? String(suppliedLogo.aspectRatio) : "1 / 1",
      crop: "contain", destination: { page: "all", section: "site-header" }, fallback: "preserve_existing",
      generationPermitted: false, id: `plan-logo-${slug(suppliedLogo.path)}`, kind: "logo", modificationPermitted: false,
      provenance: explicitPaths.has(suppliedLogo.path) ? "Explicit current user upload" : "Existing project asset",
      replacementPermitted: false, responsive: { mobileCrop: "contain", preserveSubject: true, sizes: "(max-width: 640px) 112px, 152px" },
      role: "logo_brand_mark", source: explicitPaths.has(suppliedLogo.path) ? "user_upload" : "existing_project",
      sourcePath: suppliedLogo.path, status: explicitPaths.has(suppliedLogo.path) ? "ready" : "preserved"
    });
  }

  if (strategy === "typography_led" || strategy === "image_light") {
    planned.push({
      altTextIntent: "No image; the composition is intentionally led by typography and layout.", aspectRatio: "none", crop: "none",
      destination: { page: "home", section: "hero" }, fallback: "typography", generationPermitted: false,
      id: "plan-hero-no-asset", kind: "none", modificationPermitted: false, provenance: "Composition decision",
      replacementPermitted: true, responsive: { mobileCrop: "none", preserveSubject: true, sizes: "none" },
      role: "no_asset_required", source: "none", status: "ready"
    });
  } else {
    const selectedMedia = mediaForPath(input.media, selectedHero?.path) ?? input.media.find((asset) => asset.role === "hero") ?? null;
    const source: WebsiteAssetSource = selectedHero
      ? explicitPaths.has(selectedHero.path) ? "user_upload" : "existing_project"
      : selectedMedia ? selectedMedia.provider === "local_svg" ? "deterministic_local" : "curated" : "generated";
    const brief = source === "generated" ? generationBrief({
      aspectRatio: "3 / 2", businessType: input.businessType, designContract: input.projectDesignContract,
      role: "hero_product", visualSubjects: input.visualSubjects
    }) : undefined;
    planned.push({
      altTextIntent: selectedMedia?.alt ?? `${input.businessType} primary visual`, aspectRatio: selectedMedia?.aspectRatio ?? "3 / 2",
      crop: selectedHero?.role === "product" ? "contain" : "cover", destination: { page: "home", section: "hero" },
      fallback: selectedMedia ? "composition_art" : "typography", generationBrief: brief, generationPermitted: !selectedHero,
      id: selectedHero ? `plan-hero-${slug(selectedHero.path)}` : "plan-hero-primary", kind: "image", modificationPermitted: !selectedHero,
      provenance: selectedHero ? (explicitPaths.has(selectedHero.path) ? "Explicit current user upload" : "Existing project asset") : selectedMedia ? `Curated ${selectedMedia.provider} media` : "Generation requested but not yet executed",
      replacementPermitted: true, responsive: { mobileCrop: selectedHero?.role === "product" ? "contain" : "cover", preserveSubject: true, sizes: "(max-width: 720px) 92vw, 52vw" },
      role: "hero_product", source, sourceAssetId: selectedMedia?.id, sourcePath: selectedHero?.path, status: selectedMedia || selectedHero ? "ready" : "unresolved"
    });
  }

  const supporting = records.filter((record) => ["illustration", "product", "supporting"].includes(record.role) && record.path !== selectedHero?.path).slice(0, 6);
  supporting.forEach((record, index) => planned.push({
    altTextIntent: `${input.businessType} ${record.role.replace(/_/g, " ")} visual`, aspectRatio: record.aspectRatio ? String(record.aspectRatio) : "4 / 3",
    crop: record.role === "product" ? "contain" : "cover", destination: { page: "home", section: `supporting-${index + 1}` },
    fallback: "preserve_existing", generationPermitted: false, id: `plan-support-${slug(record.path)}`, kind: record.role === "illustration" ? "illustration" : "image",
    modificationPermitted: false, provenance: explicitPaths.has(record.path) ? "Explicit current user upload" : "Existing project asset",
    replacementPermitted: true, responsive: { mobileCrop: record.role === "product" ? "contain" : "cover", preserveSubject: true, sizes: "(max-width: 720px) 92vw, 33vw" },
    role: record.role === "product" ? "product_grid" : "campaign_editorial", source: explicitPaths.has(record.path) ? "user_upload" : "existing_project",
    sourcePath: record.path, status: explicitPaths.has(record.path) ? "ready" : "preserved"
  }));

  const generationRequests = planned.flatMap((asset) => asset.generationBrief ? [asset.generationBrief] : []);
  const unresolved = planned.filter((asset) => asset.status === "unresolved").map((asset) => asset.id);
  return {
    assets: planned,
    generationRequests,
    imageStrategy: strategy,
    unresolved,
    warnings: [
      ...input.assets.warnings,
      ...(unresolved.length ? ["A relevant generated asset is planned but remains unresolved until an image provider is available and the action is approved."] : [])
    ]
  };
}

export function summarizeWebsiteAssetPlan(plan: WebsiteAssetPlan) {
  return plan.assets.map((asset) => {
    const verb = asset.role === "no_asset_required"
      ? "Use typography-led hero"
      : asset.source === "user_upload"
        ? "Use uploaded image"
        : asset.status === "preserved"
          ? "Preserve image"
          : asset.status === "unresolved"
            ? "Plan image (generation unavailable)"
            : asset.source === "deterministic_local"
              ? "Use deterministic local visual"
              : "Add image";
    return `${verb}: ${asset.destination.page}/${asset.destination.section}`;
  });
}
