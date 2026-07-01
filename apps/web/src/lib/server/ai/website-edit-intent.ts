export type WebsiteEditType =
  | "add_testimonials"
  | "business_name"
  | "color_palette"
  | "contact_info"
  | "cta_text"
  | "hero_style"
  | "remove_page"
  | "service_copy"
  | "unknown";

export type WebsiteEditIntent = {
  clarificationQuestion?: string;
  confidence: number;
  editType: WebsiteEditType;
  extractedValues: {
    address?: string;
    businessName?: string;
    colorIntent?: string;
    email?: string;
    pageToRemove?: string;
    phone?: string;
    prices?: string[];
    primaryCta?: string;
    services?: string[];
    styleIntent?: string;
  };
  mode: "WEBSITE_EDIT";
  originalPrompt: string;
  risks: string[];
  shouldClarify: boolean;
  targetFiles: string[];
  targetPages: string[];
};

const editVerbPattern = /\b(?:change|update|make|add|remove|rename|replace|edit|darken|lighten)\b/i;

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
  return editVerbPattern.test(prompt);
}

export function classifyWebsiteEditIntent(prompt: string): WebsiteEditIntent {
  const lowerPrompt = prompt.toLowerCase();
  const phone = extractQuotedOrTrailingValue(prompt, /\b(?:phone|phone number|number)\s+(?:to|as|with)\s+(.+)$/i);
  const email = extractQuotedOrTrailingValue(prompt, /\b(?:email|email address)\s+(?:to|as|with)\s+([^\s]+@[^\s]+)$/i);
  const address = extractQuotedOrTrailingValue(prompt, /\b(?:address|location)\s+(?:to|as|with)\s+(.+)$/i);
  const businessName = extractQuotedOrTrailingValue(prompt, /\b(?:business name|site name|brand name|rename site)\s+(?:to|as|with)\s+(.+)$/i);
  const primaryCta = extractQuotedOrTrailingValue(prompt, /\b(?:cta|button text|main cta)\s+(?:to|say|as|with)\s+(.+)$/i);
  const pageToRemove = extractQuotedOrTrailingValue(prompt, /\bremove\s+(?:the\s+)?([a-z0-9 -]+?)\s+page\b/i);
  const services = extractServices(prompt);
  const wantsTestimonials = /\b(?:add|include)\b[\s\S]{0,60}\b(?:testimonials|reviews|customer feedback)\b/i.test(prompt);
  const wantsHeroStyle = /\bhero\b[\s\S]{0,80}\b(?:darker|lighter|luxury|premium|warmer|cleaner)\b/i.test(prompt) ||
    /\bmake\s+(?:it|the website)\s+(?:more\s+)?(?:luxury|premium|warmer|cleaner)\b/i.test(prompt);
  const wantsColor = /\b(?:color|colors|palette|accent|blue|white|gold|darker|warmer)\b/i.test(prompt) &&
    !phone &&
    !email &&
    !address &&
    !businessName &&
    !primaryCta &&
    !wantsTestimonials;

  let editType: WebsiteEditType = "unknown";

  if (phone || email || address || /\bcontact details\b/i.test(prompt)) editType = "contact_info";
  else if (businessName) editType = "business_name";
  else if (primaryCta) editType = "cta_text";
  else if (wantsTestimonials) editType = "add_testimonials";
  else if (pageToRemove) editType = "remove_page";
  else if (services.length || /\b(?:add prices|prices to the services|service names)\b/i.test(prompt)) editType = "service_copy";
  else if (wantsHeroStyle) editType = "hero_style";
  else if (wantsColor) editType = "color_palette";

  const targetPages =
    editType === "remove_page" && pageToRemove ? [normalizePageName(pageToRemove)] :
    editType === "service_copy" ? ["services", "home"] :
    editType === "add_testimonials" || editType === "hero_style" || editType === "cta_text" ? ["home"] :
    [];
  const targetFiles =
    editType === "hero_style" || editType === "color_palette" ? ["styles.css", "HASSALI.md"] :
    editType === "remove_page" && pageToRemove ? [pageToPath(pageToRemove), "HASSALI.md"] :
    editType === "service_copy" ? ["services.html", "index.html", "HASSALI.md"] :
    editType === "add_testimonials" ? ["index.html", "styles.css", "HASSALI.md"] :
    editType === "unknown" ? [] :
    ["index.html", "contact.html", "HASSALI.md"];

  return {
    confidence: editType === "unknown" ? 0.24 : 0.86,
    editType,
    extractedValues: {
      address,
      businessName,
      colorIntent: editType === "color_palette" ? prompt : undefined,
      email,
      pageToRemove: pageToRemove ? normalizePageName(pageToRemove) : undefined,
      phone,
      prices: /\bprices?\b/i.test(prompt) ? [prompt] : undefined,
      primaryCta,
      services,
      styleIntent: editType === "hero_style" ? lowerPrompt : undefined
    },
    mode: "WEBSITE_EDIT",
    originalPrompt: prompt,
    risks: editType === "unknown" ? ["Edit intent was not recognized."] : [],
    shouldClarify: editType === "unknown",
    clarificationQuestion: editType === "unknown"
      ? "Which part of the existing website should Hassali edit?"
      : undefined,
    targetFiles,
    targetPages
  };
}
