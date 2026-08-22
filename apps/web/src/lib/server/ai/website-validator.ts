import type { WebsitePlan } from "@/lib/server/ai/website-planner";
import { getTaxonomyProfile } from "@/lib/server/ai/industry-taxonomy";
import { extractVisibleWebsiteText } from "@/lib/server/ai/domain-signal-matcher";
import type { WebsiteAssetIntelligence } from "@/lib/server/ai/website-asset-intelligence";
import type { WebsiteCinematicExperience } from "@/lib/server/ai/website-cinematic-sequence-spec";
import { validateWebsiteCinematicOutput } from "@/lib/server/ai/website-cinematic-validator";
import type { WebsiteExperiencePlan } from "@/lib/server/ai/website-experience-composer";
import type { WebsiteExperienceQualityReview } from "@/lib/server/ai/website-experience-quality";

export type WebsiteValidationResult = {
  blockedReasons: string[];
  duplicateSections: string[];
  genericLayoutDetected: boolean;
  passed: boolean;
  placeholderDetected: boolean;
  repairableReasons: string[];
  validationWarnings: string[];
};

const genericTerms = [
  "build faster with our platform",
  "clear services studio",
  "local service",
  "lorem ipsum",
  "[placeholder]",
  "placeholder image",
  "insert content here",
  "replace me",
  "todo"
];

const internalPlanningTerms = [
  "range showcase",
  "quiet proof cards",
  "collection grid",
  "lineup highlights",
  "confidence row",
  "service badges",
  "contact panel",
  "premium category grid",
  "high-contrast rounded button",
  "calm hover lift",
  "proof strategy",
  "visual archetype",
  "section rhythm",
  "thoughtful details",
  "clear next steps",
  "experience built for every screen",
  "plan your next step",
  "present the range and why it matters",
  "proof that makes the next step feel safe"
];

const visitorCopyViolations = [
  /why\s+should\s+i\s+consider\s+this\b/i,
  /\bhelp\s+(?:shoppers|customers|users)\s+(?:explore|understand|compare|move|choose)\b/i,
  /confirm\s+(?:the\s+)?photographer\s+credit(?:\s+before\s+launch)?/i,
  /\b(?:placeholder|sample)\s+image\b/i,
  /\b(?:generator|blueprint|content\s+strategy|selected\s+composition|current\s+prompt)\b/i,
  /\b(?:general-information boundary|no outcome guarantees|secure-intake reminder)\b/i,
  /\b(?:editable technical reference|editable specification area|confirm this detail before launch|add before launch)\b/i,
  /\bdomain-specific\s+(?:output|hero|copy)\b/i,
  /\b(?:screen_light_stage|mechanical_precision|product_pedestal|spatial_brand_world|card_data_journey|architectural_volume|material_orbit|abstract_motion)\b/i
];

const knownMediaProviders = new Set([
  "dicebear",
  "dummyjson",
  "fakestore",
  "local_svg",
  "picsum",
  "robohash",
  "ui_avatars",
  "unsplash",
  "workspace"
]);

const mojibakeSequences = [
  "\u00c2\u00b7",
  "\u00c2\u00a0",
  "\u00c3\u201a",
  "\u00c3\u0192",
  "\u00c3\u00a2\u20ac",
  "\u00e2\u20ac\u2122",
  "\u00e2\u20ac\u0153",
  "\u00e2\u20ac\u009d"
];

function attributeValue(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "i"));
  return match?.[1]?.trim() ?? null;
}

function semanticMediaMismatch(plan: WebsitePlan, publicHtml: string) {
  const domain = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry}`.toLowerCase();
  const html = publicHtml.toLowerCase();
  const mismatches: string[] = [];
  if (/tv|television|electronics/.test(domain) && /mascara|skincare|backpack-sample|sneaker-hero/.test(html)) mismatches.push("beauty or fashion media appears in an electronics website");
  if (/beauty|cosmetic/.test(domain) && /tv-hero|audio-accessory|car-hero|watch-hero/.test(html)) mismatches.push("electronics, vehicle, or watch media appears in a beauty website");
  if (/\b(?:car|automotive|vehicle)\b/.test(domain) && /watch-hero|mascara|backpack-sample|sneaker-hero/.test(html)) mismatches.push("unrelated retail media appears in an automotive website");
  if (/legal|law/.test(domain) && /robohash|api\.dicebear\.com/.test(html)) mismatches.push("playful generated avatars appear in a legal website");
  if (/restaurant|dining/.test(domain) && /watch-hero|tv-hero|mascara|backpack-sample/.test(html)) mismatches.push("unrelated product media appears in a restaurant website");
  return mismatches;
}

function sceneRecipeMismatch(plan: WebsitePlan, recipe: string | null) {
  if (!recipe || recipe === "none") return null;
  const domain = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry}`.toLowerCase();
  const rules: Array<[RegExp, string[]]> = [
    [/\b(?:tv|television|electronics|home cinema)\b/, ["screen_light_stage"]],
    [/\b(?:watch|timepiece|horology)\b/, ["mechanical_precision"]],
    [/\b(?:crm|saas|financial workflow)\b/, ["card_data_journey"]],
    [/\b(?:skincare|skin care|beauty|cosmetic|fragrance)\b/, ["material_orbit", "product_pedestal"]],
    [/\b(?:architecture|architectural)\b/, ["architectural_volume"]]
  ];
  const rule = rules.find(([pattern]) => pattern.test(domain));
  return rule && !rule[1].includes(recipe) ? `Scene recipe ${recipe} is incompatible with ${plan.sourceOfTruthDomain ?? plan.industry}.` : null;
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  values.forEach((value) => {
    const normalized = value.toLowerCase().trim();

    if (seen.has(normalized)) {
      duplicates.add(normalized);
    }

    seen.add(normalized);
  });

  return Array.from(duplicates);
}

function pageToPath(page: string) {
  const normalized = page.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return normalized === "home" ? "index.html" : `${normalized}.html`;
}

export function validateWebsitePlanAndFiles(input: {
  assets?: WebsiteAssetIntelligence;
  availableAssetPaths?: string[];
  cinematic?: WebsiteCinematicExperience;
  experience?: WebsiteExperiencePlan;
  experienceQuality?: WebsiteExperienceQualityReview;
  files: Record<string, string>;
  plan: WebsitePlan;
}): WebsiteValidationResult {
  const sectionIds = input.plan.requiredSections.map((section) => section.id);
  const duplicateSections = duplicateValues(sectionIds);
  const publicHtml = Object.entries(input.files)
    .filter(([path]) => path.endsWith(".html"))
    .map(([, content]) => content)
    .join("\n");
  const publicText = extractVisibleWebsiteText(publicHtml).toLowerCase();
  const profile = getTaxonomyProfile(input.plan.sourceOfTruthDomain ?? input.plan.industry);
  const vocabularyHits = (profile?.websiteVocabulary ?? [])
    .filter((term) => publicText.includes(term.toLowerCase()));
  const hasSpecificVocabulary = vocabularyHits.length >= Math.min(3, Math.max(1, profile?.websiteVocabulary.length ?? 0));
  const rawGenericLayoutDetected =
    sectionIds.join(",") === "hero,features,pricing,footer" ||
    genericTerms.some((term) => publicText.includes(term));
  const genericLayoutDetected = rawGenericLayoutDetected && !hasSpecificVocabulary;
  const remoteImageTags = publicHtml.match(/<img\b[^>]*\bsrc=["']https?:\/\/[^>]+>/gi) ?? [];
  const placeholderDetected = /alt=["'](?:hero|image|placeholder)["']/i.test(publicHtml) ||
    remoteImageTags.some((tag) => /picsum\.photos/i.test(tag) && /\b(?:hero|product|property|vehicle|watch|clinic|restaurant)\b/i.test(tag));
  const exposedPlanningTerms = internalPlanningTerms.filter((term) => publicText.includes(term));
  const visitorCopyViolationCount = visitorCopyViolations.filter((pattern) => pattern.test(publicText)).length;
  const styles = input.files["styles.css"] ?? "";
  const mainScript = input.files["main.js"] ?? "";
  const scripts = Object.entries(input.files).filter(([path]) => path.endsWith(".js")).map(([, content]) => content).join("\n");
  const mediaScript = input.files["media.js"] ?? "";
  const expectedPageFiles = input.plan.pages.map(pageToPath);
  const customProperties = Array.from(styles.matchAll(/(--[a-z0-9-]+)\s*:/gi), (match) => match[1]?.toLowerCase() ?? "").filter(Boolean);
  const duplicateCustomProperties = duplicateValues(customProperties);
  const htmlContents = expectedPageFiles.map((path) => input.files[path] ?? "");
  const titleValues = htmlContents.map((content) => content.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "").filter(Boolean);
  const descriptionValues = htmlContents.map((content) => content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)/i)?.[1]?.trim() ?? "").filter(Boolean);
  const webglEnabled = htmlContents.some((content) => /data-webgl=["']enabled["']/i.test(content));
  const webglPolicyComplete = htmlContents.every((content) => /data-webgl=["'](?:enabled|disabled)["']/i.test(content));
  const nonHomeCanvasFiles = expectedPageFiles.filter((path) => path !== "index.html" && /data-scene-canvas|src=["']\.\/scene\.js/i.test(input.files[path] ?? ""));
  const indexHtml = input.files["index.html"] ?? "";
  const sceneMountCount = (indexHtml.match(/data-scene-canvas/gi) ?? []).length;
  const cinematicMountCount = (indexHtml.match(/data-cinematic-canvas/gi) ?? []).length;
  const totalCanvasCount = sceneMountCount + cinematicMountCount;
  const sceneIds = Array.from(indexHtml.matchAll(/data-scene-id=["']([^"']+)["']/gi), (match) => match[1] ?? "").filter(Boolean);
  const duplicateSceneIds = duplicateValues(sceneIds);
  const duplicateHtmlIds = Object.entries(input.files).flatMap(([path, content]) => {
    if (!path.endsWith(".html")) return [];
    const ids = Array.from(content.matchAll(/(?:^|\s)id=["']([^"']+)["']/gi), (match) => match[1] ?? "").filter(Boolean);
    return duplicateValues(ids).map((id) => `${path}#${id}`);
  });
  const sceneRecipe = indexHtml.match(/data-scene-recipe=["']([^"']+)["']/i)?.[1] ?? null;
  const sceneRequirement = indexHtml.match(/data-3d-requirement=["']([^"']+)["']/i)?.[1] ?? null;
  const sceneFallbackPath = indexHtml.match(/data-scene-fallback[^>]*src=["']\.\/([^"']+)["']/i)?.[1] ?? indexHtml.match(/src=["']\.\/([^"']+)["'][^>]*data-scene-fallback/i)?.[1] ?? null;
  const sceneMaxObjects = Number(indexHtml.match(/data-scene-max-objects=["'](\d+)["']/i)?.[1] ?? "0");
  const requiredSceneMissing = sceneRequirement === "required" && !webglEnabled;
  const disabledScenePresent = (sceneRequirement === "forbidden" || sceneRequirement === "not_requested") && webglEnabled;
  const sceneRecipeIssue = webglEnabled ? sceneRecipeMismatch(input.plan, sceneRecipe) : null;
  const sceneScoped = !webglEnabled || (
    /\.scene-section\s*\{[^}]*position:\s*relative;[^}]*isolation:\s*isolate;[^}]*overflow:\s*clip;/is.test(styles) &&
    /\.scene-viewport\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;[^}]*pointer-events:\s*none;/is.test(styles) &&
    /\.scene-viewport canvas[^}]*pointer-events:\s*none/is.test(styles)
  );
  const sceneContainerSized = !webglEnabled || (/ResizeObserver/.test(scripts) && /getBoundingClientRect\(\)/.test(scripts) && !/position:\s*fixed[^}]*scene/is.test(styles));
  const sceneLifecycleSafe = !webglEnabled || (/sceneInitialized/.test(scripts) && /pagehide/.test(scripts) && /destroy\(\)/.test(scripts) && /teardownRegistry\.delete/.test(scripts) && /dispose\(\)/.test(scripts));
  const sceneRuntimeComplete = !webglEnabled || (/const pause\s*=/.test(scripts) && /const resume\s*=/.test(scripts) && /contextLost/.test(scripts) && /IntersectionObserver/.test(scripts) && /webglcontextrestored/.test(scripts));
  const sceneProgressMapped = !webglEnabled || !/data-scene-scroll-driven=["']true["']/i.test(indexHtml) || (/setProgress|applyProgress/.test(scripts) && /sceneProgress/.test(scripts) && /sceneCameraState/.test(scripts));
  const sceneViewportTag = indexHtml.match(/<[^>]+data-scene-viewport[^>]*>/i)?.[0] ?? "";
  const sceneAccessible = !webglEnabled || (
    /class=["']scene-section["'][\s\S]*?<h2>[\s\S]*?<p>/i.test(indexHtml) &&
    attributeValue(sceneViewportTag, "role") === "img" &&
    Boolean(attributeValue(sceneViewportTag, "aria-label"))
  );
  const sceneHasNoscript = !webglEnabled || /<noscript>[\s\S]*?scene-noscript[\s\S]*?<\/noscript>/i.test(indexHtml);
  const sceneFallbackComplete = !webglEnabled || Boolean(sceneFallbackPath && sceneFallbackPath in input.files && /data-scene-fallback/i.test(indexHtml));
  const sceneReducedMotionComplete = !webglEnabled || (/prefers-reduced-motion:\s*reduce/i.test(styles) && /prefers-reduced-motion:\s*reduce/i.test(scripts) && /is-scene-fallback/.test(scripts));
  const sceneMobilePolicyComplete = !webglEnabled || (/data-scene-mobile-tier=["'](?:fallback|reduced)["']/i.test(indexHtml) && /max-width:/.test(scripts));
  const sceneResourceBudgetValid = !webglEnabled || (sceneMaxObjects > 0 && sceneMaxObjects <= 48 && /maxDevicePixelRatio/.test(scripts) && /maxParticles/.test(scripts));
  const sceneDoesNotCoverControls = !webglEnabled || (/\.scene-viewport\s*\{[^}]*pointer-events:\s*none/is.test(styles) && /\.scene-viewport canvas[^}]*pointer-events:\s*none/is.test(styles));
  const sceneOverflowContained = !webglEnabled || (/html\s*\{[^}]*overflow-x:\s*clip/is.test(styles) && /body\s*\{[^}]*overflow-x:\s*clip/is.test(styles));
  const shallowFooter = htmlContents.some((content) => {
    const footer = content.match(/<footer\b[\s\S]*?<\/footer>/i)?.[0] ?? "";
    return footer.length < 300 || !/<h2\b/i.test(footer) || !/<nav\b|<ul\b/i.test(footer);
  });
  const hasMobileNavigation = htmlContents.every((content) => /data-menu-toggle/i.test(content) && /aria-controls=["']primary-navigation["']/i.test(content));
  const hasHonestForm = !htmlContents.some((content) => /<form\b/i.test(content)) ||
    (/preventDefault\s*\(/.test(mainScript) && /nothing was sent|does not send|stays on this device|keeps them on this device/i.test(mainScript));
  const meaningfulJs = mainScript.length >= 1500 && /data-menu-toggle/.test(mainScript) && /addEventListener/.test(mainScript);
  const hasWebglFallback = !webglEnabled || (/data-scene-fallback/.test(input.files["index.html"] ?? "") && /webglcontextlost/.test(scripts));
  const noWebglDependenciesWhenDisabled = webglEnabled || (!/three@|gsap@|src=["']\.\/scene\.js|data-scene-canvas/i.test(`${publicHtml}\n${scripts}`));
  const remoteMediaIssues = remoteImageTags.flatMap((tag, index) => {
    const issues: string[] = [];
    const src = attributeValue(tag, "src");
    const provider = attributeValue(tag, "data-media-provider") ?? tag.match(/data-media-provider=["']([^"']+)/i)?.[1] ?? null;
    const fallback = attributeValue(tag, "data-fallback-src");
    const alt = attributeValue(tag, "alt");
    const width = attributeValue(tag, "width");
    const height = attributeValue(tag, "height");
    try { if (!src || new URL(src).protocol !== "https:") issues.push(`remote image ${index + 1} has a malformed or non-HTTPS URL`); } catch { issues.push(`remote image ${index + 1} has a malformed URL`); }
    if (!provider || !knownMediaProviders.has(provider)) issues.push(`remote image ${index + 1} has an unknown provider`);
    if (!fallback || !(fallback.replace(/^\.\//, "") in input.files)) issues.push(`remote image ${index + 1} lacks a generated local fallback`);
    if (!width || !height) issues.push(`remote image ${index + 1} lacks stable dimensions`);
    if (!alt) issues.push(`remote image ${index + 1} lacks semantic alt text`);
    return issues;
  });
  const hasOneShotMediaFallback = remoteImageTags.length === 0 || (
    /state\s*===\s*["']remote["']/.test(mediaScript) &&
    /state\s*===\s*["']fallback["']/.test(mediaScript) &&
    /dataset\.mediaFallbackState\s*=\s*["']failed["']/.test(mediaScript)
  );
  const mediaMismatches = semanticMediaMismatch(input.plan, publicHtml);
  const mojibakeFound = mojibakeSequences.filter((sequence) => Object.values(input.files).some((content) => content.includes(sequence)));
  const frameworkPollution = publicHtml.match(/\b(?:css-view-|css-text-|r-(?:alignItems|backgroundColor|position)-|svelte-)[a-z0-9_-]*/gi) ?? [];
  const utf8Declared = htmlContents.every((content) => /<meta\s+charset=["']?UTF-8["']?/i.test(content));
  const emptyFiles = Object.entries(input.files)
    .filter(([, content]) => content.trim().length === 0)
    .map(([path]) => path);
  const missingPageFiles = expectedPageFiles.filter((path) => !(path in input.files));
  const unexpectedHtmlFiles = Object.keys(input.files)
    .filter((path) => path.endsWith(".html") && !expectedPageFiles.includes(path));
  const cinematicValidation = input.cinematic
    ? validateWebsiteCinematicOutput({
        availableAssetPaths: input.availableAssetPaths,
        cinematic: input.cinematic,
        files: input.files
      })
    : { hardBlockers: [], passed: true, repairableFindings: [], warnings: [] };
  const plannedWebglSections = input.experience?.sections.filter((section) => section.engine === "procedural_webgl") ?? [];
  const plannedCinematicSections = input.experience?.sections.filter((section) => section.engine === "frame_sequence") ?? [];
  const plannedHighCostSections = input.experience?.sections.filter((section) => section.performanceCost === "HIGH") ?? [];
  const experienceBudget = input.experience?.budget;
  const sequenceRuntimePresent = /src=["']\.\/sequence\.js/i.test(indexHtml) && "sequence.js" in input.files;
  const sceneRuntimePresent = /src=["']\.\/scene\.js/i.test(indexHtml) && "scene.js" in input.files;
  const mixedRuntimeIndependent = !sceneRuntimePresent || !sequenceRuntimePresent || (
    /__hassaliSceneTeardowns/.test(input.files["scene.js"] ?? "") &&
    /__HASSALI_CINEMATIC_TEARDOWNS__/.test(input.files["sequence.js"] ?? "")
  );
  const mixedReducedMotionComplete = !sceneRuntimePresent || !sequenceRuntimePresent || (
    /prefers-reduced-motion:\s*reduce/i.test(input.files["scene.js"] ?? "") &&
    /prefers-reduced-motion:\s*reduce/i.test(input.files["sequence.js"] ?? "")
  );
  const experienceMountsMatch = !input.experience || (
    sceneMountCount === plannedWebglSections.length &&
    cinematicMountCount === plannedCinematicSections.length
  );
  const explicitAnimationConstraintSatisfied = !input.experience?.explicitConstraints.animationForbidden ||
    (!sequenceRuntimePresent && cinematicMountCount === 0);
  const explicitWebglConstraintSatisfied = !input.experience?.explicitConstraints.webglForbidden ||
    (!sceneRuntimePresent && sceneMountCount === 0);
  const advancedDensityExceeded = Boolean(input.experience && (
    input.experience.advancedDensity > 0.4 ||
    plannedHighCostSections.length > input.experience.budget.maxHighCostSections
  ));
  const canvasBudgetExceeded = Boolean(experienceBudget && totalCanvasCount > experienceBudget.maxActiveCanvases);
  const repairableReasons = [
    duplicateSections.length ? `Duplicate sections detected: ${duplicateSections.join(", ")}.` : "",
    genericLayoutDetected ? "Generic template language or layout detected." : "",
    placeholderDetected ? "Placeholder or remote image reference detected." : "",
    exposedPlanningTerms.length ? `Internal planning language is visible: ${exposedPlanningTerms.join(", ")}.` : "",
    visitorCopyViolationCount ? "Visitor-facing copy contains internal planning or editor-warning language." : "",
    duplicateCustomProperties.length ? `Duplicate CSS custom properties detected: ${duplicateCustomProperties.join(", ")}.` : "",
    !hasMobileNavigation ? "Generated pages are missing the accessible mobile navigation contract." : "",
    !meaningfulJs ? "Generated JavaScript is too shallow to support production interactions." : "",
    shallowFooter ? "Generated footer is too shallow for a production website." : "",
    !hasHonestForm ? "Generated form does not clearly prevent fake static submission success." : "",
    sceneRecipeIssue ?? "",
    !webglPolicyComplete ? "WebGL policy is missing from one or more generated pages." : "",
    nonHomeCanvasFiles.length ? `Scene canvas or scene script leaked onto non-home pages: ${nonHomeCanvasFiles.join(", ")}.` : "",
    remoteMediaIssues.length ? `Remote media contract needs repair: ${remoteMediaIssues.join("; ")}.` : "",
    !hasOneShotMediaFallback ? "Remote media fallback can repeat or does not reach a terminal failure state." : "",
    mojibakeFound.length ? "Known text-encoding corruption appears in generated output." : "",
    frameworkPollution.length ? `Generated framework-class pollution detected: ${Array.from(new Set(frameworkPollution)).join(", ")}.` : "",
    !utf8Declared ? "One or more generated pages do not declare UTF-8." : "",
    duplicateValues(titleValues).length ? "Generated pages contain duplicate title metadata." : "",
    duplicateValues(descriptionValues).length ? "Generated pages contain duplicate meta descriptions." : "",
    unexpectedHtmlFiles.length ? `Generated pages not present in planner page list: ${unexpectedHtmlFiles.join(", ")}.` : "",
    ...cinematicValidation.repairableFindings,
    advancedDensityExceeded ? "Advanced visual density exceeds the section-level performance budget." : "",
    ...((input.experienceQuality?.findings ?? [])
      .filter((finding) => finding.severity === "repairable")
      .map((finding) => `${finding.message} Repair: ${finding.repair}`)),
    input.plan.requiredSections.length < 4 ? "Website plan has too few industry-specific sections." : "",
    !input.plan.designTokenValidationPassed
      ? `Design token validation failed: ${input.plan.designTokens.validation.issues.map((issue) => issue.message).join("; ")}.`
      : ""
  ].filter(Boolean);
  const blockedReasons = [
    requiredSceneMissing ? "The WEBSITE request requires WebGL, but no scene was generated." : "",
    disabledScenePresent ? `The ${sceneRequirement} 3D policy still generated a WebGL scene.` : "",
    !hasWebglFallback ? "WebGL is enabled without a static fallback and context-loss handling." : "",
    !sceneFallbackComplete ? "The generated scene is missing its designed local fallback asset." : "",
    !sceneAccessible ? "The generated scene lacks accessible HTML meaning outside the canvas." : "",
    !sceneHasNoscript ? "The generated scene lacks meaningful no-JavaScript content." : "",
    duplicateSceneIds.length ? `Duplicate scene IDs detected: ${duplicateSceneIds.join(", ")}.` : "",
    duplicateHtmlIds.length ? `Duplicate HTML IDs detected: ${duplicateHtmlIds.join(", ")}.` : "",
    sceneMountCount > 1 ? "The homepage contains duplicate scene canvas mounts." : "",
    !sceneScoped ? "The generated scene is not contained by a local stacking and overflow boundary." : "",
    !sceneContainerSized ? "The generated scene does not size itself from its mount container." : "",
    !sceneLifecycleSafe ? "The generated scene lacks duplicate-init prevention or teardown ownership." : "",
    !sceneRuntimeComplete ? "The generated scene lacks pause, resume, offscreen, or context-restoration behavior." : "",
    !sceneProgressMapped ? "The scroll-driven scene lacks meaningful progress mapping." : "",
    !sceneReducedMotionComplete ? "The generated scene lacks a complete reduced-motion policy." : "",
    !sceneMobilePolicyComplete ? "The generated scene lacks a mobile reduction or fallback policy." : "",
    !sceneResourceBudgetValid ? "The generated scene exceeds or omits its resource budget." : "",
    !sceneDoesNotCoverControls ? "The generated scene can intercept or cover interactive page content." : "",
    !sceneOverflowContained ? "The generated scene lacks page-level overflow containment." : "",
    !noWebglDependenciesWhenDisabled ? "A no-WebGL website still includes scene canvas or WebGL dependencies." : "",
    mediaMismatches.length ? `Media relevance failed: ${mediaMismatches.join("; ")}.` : "",
    emptyFiles.length ? `Empty generated files: ${emptyFiles.join(", ")}.` : "",
    missingPageFiles.length ? `Missing planner page files: ${missingPageFiles.join(", ")}.` : "",
    ...cinematicValidation.hardBlockers
    ,
    !experienceMountsMatch ? "The final project does not match its section-level experience mount plan." : "",
    !mixedRuntimeIndependent ? "Mixed visual engines do not own independent teardown lifecycles." : "",
    !mixedReducedMotionComplete ? "Mixed visual engines do not both honor reduced-motion preferences." : "",
    !explicitAnimationConstraintSatisfied ? "The request forbids animation, but a cinematic runtime or mount remains." : "",
    !explicitWebglConstraintSatisfied ? "The request forbids WebGL, but a scene runtime or mount remains." : "",
    canvasBudgetExceeded ? "The generated page exceeds its active canvas budget." : ""
  ].filter(Boolean);

  return {
    blockedReasons,
    duplicateSections,
    genericLayoutDetected,
    passed: blockedReasons.length === 0,
    placeholderDetected,
    repairableReasons,
    validationWarnings: [
      ...repairableReasons,
      ...(input.plan.optionalSections.length === 0 ? ["No optional sections were available for expansion."] : []),
      ...(remoteImageTags.length > 0 ? [`Website uses ${remoteImageTags.length} declared remote media asset(s) with local fallbacks.`] : []),
      ...(/data-media-reliability=["']prototype["']/i.test(publicHtml) ? ["Prototype product media must be replaced or verified before production launch."] : []),
      ...cinematicValidation.warnings
      ,
      ...(input.assets?.warnings ?? []),
      ...(input.experience?.warnings ?? []),
      ...((input.experienceQuality?.findings ?? [])
        .filter((finding) => finding.severity === "warning")
        .map((finding) => finding.message))
    ]
  };
}
