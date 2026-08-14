export type WebsiteEditType =
  | "add_carousel"
  | "add_testimonials"
  | "business_name"
  | "color_palette"
  | "component_geometry"
  | "contact_info"
  | "cta_text"
  | "hero_style"
  | "page_edit"
  | "page_replacement"
  | "remove_page"
  | "remove_cinematic"
  | "remove_motion"
  | "remove_webgl"
  | "set_cinematic"
  | "set_webgl"
  | "section_edit"
  | "service_copy"
  | "unknown";

export type WebsiteRequestScope =
  | "ambiguous_edit"
  | "content_edit"
  | "full_generation"
  | "full_replacement"
  | "large_partial_replacement"
  | "page_edit"
  | "section_edit"
  | "style_theme_edit"
  | "targeted_edit";

export type WebsiteEditIntent = {
  clarificationQuestion?: string;
  confidence: number;
  editType: WebsiteEditType;
  extractedValues: {
    address?: string;
    businessName?: string;
    colorIntent?: string;
    email?: string;
    experienceSectionTarget?: string;
    geometryIntent?: "rounded" | "square";
    pageToRemove?: string;
    pageTarget?: string;
    phone?: string;
    prices?: string[];
    primaryCta?: string;
    services?: string[];
    styleIntent?: string;
    sectionTarget?: string;
  };
  mode: "WEBSITE_EDIT";
  originalPrompt: string;
  requestScope: WebsiteRequestScope;
  risks: string[];
  shouldClarify: boolean;
  targetFiles: string[];
  targetPages: string[];
};

const editVerbPattern = /\b(?:change|update|make|use|turn|enable|convert|add|remove|rename|replace|rewrite|rebuild|redesign|improve|polish|edit|darken|lighten)\b/i;
const businessNameFactPattern = /^(?:our\s+(?:(?:business|brand|company|site|website)\s+)?name|(?:my|the)\s+(?:business|brand|company|site|website)\s+name)\s+(?:is|should be)\s+\S/i;

const pagePattern = /\b(?:homepage|home|about(?: us)?|services?|products?|pricing|contact|blog|checkout|cart)(?:\s+page)?\b|\bgallery\s+page\b/i;
const sectionPattern = /\b(?:hero|footer|navigation|navbar|header|testimonials?|faq|cta|call to action|product grid|service grid)\b/i;

export function isFullWebsiteReplacementRequest(prompt: string) {
  const text = prompt.toLowerCase().replace(/\s+/g, " ").trim();

  return (
    /\b(?:replace|rewrite|rebuild|recreate|redo|overhaul)\b[\s\S]{0,100}\b(?:entire|whole|all)\b[\s\S]{0,40}\b(?:website|site|project|project files|files)\b/.test(text) ||
    /\b(?:replace|rewrite|rebuild|recreate|redo|overhaul)\s+(?:(?:my|our|the|this|current|existing)\s+)?(?:(?:entire|whole|complete)\s+)?(?:website|site)\b/.test(text) ||
    /\b(?:website|site)\s+(?:completely\s+)?(?:replace|rewrite|rebuild|recreate|redo|overhaul)(?:d|n)?\b/.test(text) ||
    /\breplace\s+(?:all|every)\s+(?:project\s+)?files\b/.test(text) ||
    /\b(?:start over|start from scratch|rebuild from scratch)\b/.test(text) ||
    /\b(?:create|make|generate)\s+(?:a\s+)?completely new version\b/.test(text) ||
    /\bturn\s+(?:this|the website|the site|my website|my site)\s+into\b/.test(text) ||
    /\boverride\s+(?:the\s+)?previous\s+(?:website|site|project)\b/.test(text)
  );
}

function isFullWebsiteGenerationRequest(prompt: string) {
  return (
    /\b(?:build|create|design|generate)\b[\s\S]{0,80}\b(?:website|site|landing page|web page|store|shop)\b/i.test(prompt) ||
    /\bmake\s+(?:me\s+)?(?:a|an|new)\b[\s\S]{0,80}\b(?:website|site|landing page|web page|store|shop)\b/i.test(prompt)
  );
}

export function classifyWebsiteRequestScope(prompt: string): WebsiteRequestScope {
  const text = prompt.trim();

  if (isFullWebsiteReplacementRequest(text)) return "full_replacement";
  if (isFullWebsiteGenerationRequest(text)) return "full_generation";
  if (/\b(?:replace|rebuild|recreate|redo)\b[\s\S]{0,60}\b(?:only\s+)?(?:the\s+)?(?:home(?:page| page)?|about(?: us)?|services?|products?|pricing|contact|blog|checkout|cart|gallery)(?:\s+page)?\b/i.test(text)) {
    return "large_partial_replacement";
  }
  if (/\b(?:replace|rewrite|update|change|improve|add|remove)\b[\s\S]{0,40}\b(?:hero|footer|navigation|navbar|header|testimonials?|faq|cta|call to action|product grid|service grid)\b/i.test(text)) {
    return "section_edit";
  }
  if (pagePattern.test(text)) return "page_edit";
  if (sectionPattern.test(text)) return "section_edit";
  if (/\b(?:theme|palette|color|colour|dark mode|glassmorphism|luxury|premium|apple style)\b/i.test(text)) return "style_theme_edit";
  if (/\b(?:rewrite|replace|update|fix|add)\b[\s\S]{0,60}\b(?:copy|text|grammar|faq|description|content)\b/i.test(text)) return "content_edit";
  if (businessNameFactPattern.test(text)) return "targeted_edit";
  if (/^(?:fix|improve|update|change|make better|make it better)(?:\s+(?:my|the|this))?\s*(?:website|site|it|this)?[.!?]*$/i.test(text)) {
    return "ambiguous_edit";
  }

  return hasWebsiteEditSignal(text) ? "targeted_edit" : "ambiguous_edit";
}

function normalizePageName(value: string) {
  const normalized = value.toLowerCase().trim();

  if (normalized === "homepage" || normalized === "home page") return "home";
  if (normalized === "blogs") return "blog";

  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pageToPath(page: string) {
  const normalized = normalizePageName(page);

  return normalized === "home" || normalized === "index" ? "index.html" : `${normalized}.html`;
}

function extractQuotedOrTrailingValue(prompt: string, pattern: RegExp) {
  const match = prompt.match(pattern);
  const raw = match?.[1]?.trim();

  return raw?.replace(/^["'`]+|["'`.]+$/g, "").trim();
}

function containsUnsafeBusinessNameCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 || "<>{}[]\\".includes(character);
  });
}

function normalizeBusinessName(value: string | undefined) {
  const normalized = value?.replace(/\s+/g, " ").trim();

  if (
    !normalized ||
    normalized.length > 80 ||
    containsUnsafeBusinessNameCharacter(normalized) ||
    !/[a-z0-9]/i.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function extractServices(prompt: string) {
  const match = prompt.match(/\b(?:change|update|replace|edit)\s+services\s+(?:to|with|as)\s+(.+)$/i);
  const raw = match?.[1]?.trim();

  if (!raw) return [];

  return raw
    .split(/\s*,\s*|\s+and\s+/i)
    .map((service) => service.trim().replace(/^["'`]+|["'`.]+$/g, ""))
    .filter(Boolean);
}

export function hasWebsiteEditSignal(prompt: string) {
  return editVerbPattern.test(prompt) || businessNameFactPattern.test(prompt.trim());
}

export function classifyWebsiteEditIntent(prompt: string): WebsiteEditIntent {
  const lowerPrompt = prompt.toLowerCase();
  const requestScope = classifyWebsiteRequestScope(prompt);
  const explicitHomeTarget = prompt.match(/\b(?:home\s+page|homepage)\b/i);
  const pageTargetMatch = explicitHomeTarget ?? prompt.match(pagePattern);
  const pageTarget = pageTargetMatch?.[0] ? normalizePageName(pageTargetMatch[0].replace(/\s+page$/i, "")) : undefined;
  const sectionTargetMatch = prompt.match(sectionPattern);
  const sectionTarget = sectionTargetMatch?.[0]?.toLowerCase().replace(/\s+/g, "_");
  const phone = extractQuotedOrTrailingValue(prompt, /\b(?:phone|phone number|number)\s+(?:to|as|with)\s+(.+)$/i);
  const email = extractQuotedOrTrailingValue(prompt, /\b(?:email|email address)\s+(?:to|as|with)\s+([^\s]+@[^\s]+)$/i);
  const address = extractQuotedOrTrailingValue(prompt, /\b(?:address|location)\s+(?:to|as|with)\s+(.+)$/i);
  const businessName = normalizeBusinessName(
    extractQuotedOrTrailingValue(
      prompt,
      /\b(?:business name|site name|brand name|rename site)\s+(?:to|as|with)\s+(.+?)(?=\s+(?:and|but)\s+(?:use|make|change|update|add|remove|set|keep)\b|$)/i
    )
  );
  const explicitBusinessName = businessName ?? normalizeBusinessName(extractQuotedOrTrailingValue(
    prompt,
    /\b(?:our\s+(?:(?:business|brand|company|site|website)\s+)?name|(?:my|the)\s+(?:business|brand|company|site|website)\s+name)\s+(?:is|should be)\s+(.+?)(?=\s+(?:and|but)\s+(?:use|make|change|update|add|remove|set|keep)\b|$)/i
  ));
  const primaryCta = extractQuotedOrTrailingValue(prompt, /\b(?:cta|button text|main cta)\s+(?:to|say|as|with)\s+(.+)$/i);
  const pageToRemove = extractQuotedOrTrailingValue(prompt, /\bremove\s+(?:the\s+)?([a-z0-9 -]+?)\s+page\b/i);
  const services = extractServices(prompt);
  const wantsTestimonials = /\b(?:add|include)\b[\s\S]{0,60}\b(?:testimonials|reviews|customer feedback)\b/i.test(prompt);
  const wantsCarousel = /\b(?:add|include|create)\b[\s\S]{0,80}\b(?:carousel|slider)\b/i.test(prompt);
  const removalText = Array.from(
    prompt.matchAll(/\b(?:remove|disable|delete)\b[^.!?;]*/gi),
    (match) => {
      const directive = match[0];
      const preserveIndex = directive.search(/\b(?:(?:but|while|and)\s+)?(?:keep|preserve|retain)\b/i);
      return preserveIndex >= 0 ? directive.slice(0, preserveIndex) : directive;
    }
  ).join(" ");
  const wantsWebglRemoval = /\b(?:webgl|3d(?: effects?| visuals?)?)\b/i.test(removalText);
  const wantsCinematicStatic = /\bmake\b[^.!?;]{0,70}\b(?:cinematic|frame sequence|sequence animation|cinematic hero)\b[^.!?;]{0,35}\b(?:static|off)\b/i.test(prompt);
  const wantsCinematicRemoval = /\b(?:cinematic|frame sequence|sequence animation|cinematic hero)\b/i.test(removalText) ||
    wantsCinematicStatic;
  const wantsMotionRemoval = /\b(?:all animation|all motion|all visual effects)\b/i.test(removalText) ||
    (/\ball\b/i.test(removalText) && wantsWebglRemoval && wantsCinematicRemoval);
  const activationText = prompt.replace(/\b(?:(?:and|but|while)\s+)?(?:keep|preserve|retain)\b[^.!?;]*/gi, "");
  const wantsWebgl = /\b(?:use|add|enable|turn|make|replace|convert)\b[^.!?;]{0,90}\b(?:webgl|interactive 3d|3d explainer|3d section)\b/i.test(activationText) ||
    /\b(?:webgl|interactive 3d)\b[^.!?;]{0,70}\b(?:for|in|on)\b/i.test(activationText);
  const wantsCinematic = /\b(?:use|add|enable|turn|make|replace|convert)\b[^.!?;]{0,90}\b(?:cinematic|frame sequence|image sequence|sequence animation|sequence)\b/i.test(activationText);
  const transitionToWebgl = /\b(?:replace|turn|convert)\b[^.!?;]{0,80}\b(?:cinematic|frame sequence)\b[^.!?;]{0,40}\b(?:with|to|into)\b[^.!?;]{0,40}\b(?:webgl|3d)\b/i.test(prompt);
  const transitionToCinematic = /\b(?:replace|turn|convert)\b[^.!?;]{0,80}\b(?:webgl|3d)\b[^.!?;]{0,40}\b(?:with|to|into)\b[^.!?;]{0,40}\b(?:cinematic|frame sequence)\b/i.test(prompt);
  const experienceSectionTarget =
    /\bsecond section\b/i.test(prompt) ? "second_section" :
    prompt.match(/\b(?:hero|hardware explainer|product explainer|workflow explainer|architecture explainer|material explainer)\b/i)?.[0]
      ?.toLowerCase()
      .replace(/\s+/g, "_");
  const wantsHeroStyle = /\bhero\b[\s\S]{0,80}\b(?:darker|lighter|luxury|premium|warmer|cleaner)\b/i.test(prompt) ||
    /\bmake\s+(?:it|my website|my site|the website|the site)\s+(?:look\s+)?(?:more\s+)?(?:luxury|premium|warmer|cleaner)\b/i.test(prompt);
  const wantsColor = /\b(?:color|colors|palette|accent|blue|white|gold|darker|warmer)\b/i.test(prompt) &&
    !phone &&
    !email &&
    !address &&
    !explicitBusinessName &&
    !primaryCta &&
    !wantsTestimonials;
  const geometryIntent = /\brounded\b/i.test(prompt)
    ? "rounded" as const
    : /\b(?:square|sharp)\b/i.test(prompt)
      ? "square" as const
      : undefined;
  const wantsComponentGeometry = Boolean(
    geometryIntent && /\b(?:gallery|product|service|feature|pricing)?\s*cards?\b/i.test(prompt)
  );

  let editType: WebsiteEditType = "unknown";

  if (wantsMotionRemoval) editType = "remove_motion";
  else if (wantsCinematicRemoval) editType = "remove_cinematic";
  else if (wantsWebglRemoval) editType = "remove_webgl";
  else if (transitionToWebgl) editType = "set_webgl";
  else if (transitionToCinematic) editType = "set_cinematic";
  else if (wantsCinematic) editType = "set_cinematic";
  else if (wantsWebgl) editType = "set_webgl";
  else if (wantsCarousel) editType = "add_carousel";
  else if (phone || email || address || /\bcontact details\b/i.test(prompt)) editType = "contact_info";
  else if (explicitBusinessName) editType = "business_name";
  else if (primaryCta) editType = "cta_text";
  else if (wantsTestimonials) editType = "add_testimonials";
  else if (pageToRemove) editType = "remove_page";
  else if (services.length || /\b(?:add prices|prices to the services|service names)\b/i.test(prompt)) editType = "service_copy";
  else if (wantsHeroStyle) editType = "hero_style";
  else if (wantsColor) editType = "color_palette";
  else if (wantsComponentGeometry) editType = "component_geometry";
  else if (requestScope === "large_partial_replacement" && pageTarget) editType = "page_replacement";
  else if (requestScope === "page_edit" && pageTarget) editType = "page_edit";
  else if (requestScope === "section_edit" && sectionTarget) editType = "section_edit";

  const targetPages =
    editType === "remove_page" && pageToRemove ? [normalizePageName(pageToRemove)] :
    editType === "service_copy" ? ["services", "home"] :
    editType === "set_webgl" || editType === "set_cinematic" ? ["home"] :
    editType === "add_carousel" || editType === "add_testimonials" || editType === "hero_style" || editType === "cta_text" ? ["home"] :
    editType === "page_edit" || editType === "page_replacement" ? [pageTarget ?? "home"] :
    [];
  const targetFiles =
    editType === "remove_webgl" ? ["index.html", "scene.js", "HASSALI.md"] :
    editType === "remove_cinematic" ? ["index.html", "sequence.js", "sequence-manifest.js", "HASSALI.md"] :
    editType === "remove_motion" ? ["index.html", "scene.js", "sequence.js", "sequence-manifest.js", "HASSALI.md"] :
    editType === "set_webgl" ? ["index.html", "scene.js", "HASSALI.md"] :
    editType === "set_cinematic" ? ["index.html", "sequence.js", "sequence-manifest.js", "HASSALI.md"] :
    editType === "add_carousel" ? ["index.html", "styles.css", "main.js"] :
    editType === "hero_style" || editType === "color_palette" ? ["styles.css", "HASSALI.md"] :
    editType === "component_geometry" ? ["styles.css", "DESIGN.md"] :
    editType === "remove_page" && pageToRemove ? [pageToPath(pageToRemove), "HASSALI.md"] :
    editType === "service_copy" ? ["services.html", "index.html", "HASSALI.md"] :
    editType === "add_testimonials" ? ["index.html", "styles.css", "HASSALI.md"] :
    editType === "page_edit" || editType === "page_replacement" ? [pageToPath(pageTarget ?? "home")] :
    editType === "section_edit" ? [sectionTarget === "footer" ? "index.html" : "index.html"] :
    editType === "unknown" ? [] :
    ["index.html", "contact.html", "HASSALI.md"];

  return {
    confidence: editType === "unknown" ? 0.24 : 0.86,
    editType,
    extractedValues: {
      address,
      businessName: explicitBusinessName,
      colorIntent: editType === "color_palette" ? prompt : undefined,
      email,
      experienceSectionTarget,
      geometryIntent,
      pageToRemove: pageToRemove ? normalizePageName(pageToRemove) : undefined,
      pageTarget,
      phone,
      prices: /\bprices?\b/i.test(prompt) ? [prompt] : undefined,
      primaryCta,
      services,
      sectionTarget,
      styleIntent: editType === "hero_style" ? lowerPrompt : undefined
    },
    mode: "WEBSITE_EDIT",
    originalPrompt: prompt,
    requestScope,
    risks: editType === "unknown" ? [`Website request scope was classified as ${requestScope}, but no supported deterministic edit action matched.`] : [],
    shouldClarify: requestScope === "ambiguous_edit",
    clarificationQuestion: requestScope === "ambiguous_edit"
      ? "Which part of the existing website should Hassali edit?"
      : undefined,
    targetFiles,
    targetPages
  };
}
