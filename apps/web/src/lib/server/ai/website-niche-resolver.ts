import {
  WEBSITE_INDUSTRY_CATALOG,
  type UniversalIndustryNode,
  type WebsiteBusinessModel
} from "@/lib/server/ai/website-industry-catalog";

export type WebsiteSemanticResolution = {
  audiences: string[];
  brandName: string | null;
  businessModels: WebsiteBusinessModel[];
  canonicalConfidence: number;
  canonicalDomain: string | null;
  capabilities: string[];
  category: string | null;
  ctas: string[];
  industry: string | null;
  niche: string | null;
  primaryIndustryNodeId: string | null;
  products: string[];
  rawBusinessPhrase: string | null;
  secondaryIndustryNodeIds: string[];
  sector: string | null;
  semanticConfidence: number;
  semanticDomain: string;
  services: string[];
  source: "canonical_taxonomy" | "dynamic_niche" | "generic_fallback" | "named_business";
  subNiche: string | null;
  suggestedPages: string[];
  suggestedSections: string[];
  trustSignals: string[];
  visualSubjects: string[];
};

type CanonicalEvidence = {
  capabilities?: string[];
  confidence: number;
  displayName: string;
  domainId: string;
};

type SemanticConcept = {
  audiences?: string[];
  capabilities: string[];
  products?: string[];
  services?: string[];
  signals: string[];
  visualSubjects: string[];
};

const genericBusinessWords = new Set([
  "a", "an", "business", "called", "company", "completely", "create", "design", "fictional", "for",
  "generate", "make", "me", "my", "new", "premium", "responsive", "site", "the", "website"
]);

const nicheModifiers = new Set([
  "ai", "artisan", "boutique", "carbon", "custom", "electric", "ergonomic", "handmade", "industrial",
  "luxury", "mobile", "organic", "powered", "premium", "smart", "solar", "specialty", "synthetic", "vertical", "vegan"
]);

const weakCatalogSignals = new Set(["app", "business", "company", "equipment", "service", "services", "shop", "store"]);

const concepts: SemanticConcept[] = [
  { signals: ["gaming computer", "gaming computers", "gaming pc", "gaming pcs", "custom pc", "workstation"], capabilities: ["gaming", "computer_hardware", "performance_hardware", "modular_hardware", "customization"], products: ["gaming systems", "graphics hardware", "processors", "cooling", "memory", "storage", "chassis", "monitors", "peripherals"], services: ["system configuration", "component compatibility guidance", "upgrades"], audiences: ["gamers", "streamers", "creators", "performance-focused buyers"], visualSubjects: ["layered computer chassis", "graphics and cooling modules", "performance hardware architecture"] },
  { signals: ["keyboard", "keyboards", "keycap", "switches"], capabilities: ["computer_accessories", "hardware", "customization", "typing", "modular_hardware"], products: ["keyboards", "switches", "keycaps", "layouts", "plates", "cases", "cables"], services: ["custom assembly", "switch and layout guidance"], audiences: ["typists", "gamers", "developers", "keyboard enthusiasts"], visualSubjects: ["key grid", "switch layers", "keycap profiles", "modular keyboard plate"] },
  { signals: ["cybersecurity", "cyber security", "network security", "quantum security"], capabilities: ["cybersecurity", "defensive_security", "risk", "identity", "monitoring"], products: ["security assessments", "monitoring systems", "identity controls"], services: ["security consulting", "risk assessment", "incident preparation"], visualSubjects: ["security boundaries", "network topology", "protected signal paths"] },
  { signals: ["drone", "drones", "uav", "aerial"], capabilities: ["drone", "aviation", "imaging", "technical_product"], products: ["airframes", "cameras", "flight controllers", "batteries", "payload systems"], services: ["aerial imaging", "inspection", "mapping", "flight support"], visualSubjects: ["airframe geometry", "camera gimbal", "flight path", "modular payload"] },
  { signals: ["robot", "robotics", "automation", "automated"], capabilities: ["robotics", "automation", "sensors", "control_systems"], products: ["robotic systems", "sensors", "controllers", "automation modules"], services: ["systems integration", "commissioning", "maintenance"], visualSubjects: ["robot joints", "sensor arrays", "automation paths"] },
  { signals: ["coffee", "roastery", "roasting", "espresso"], capabilities: ["coffee", "beverage", "craft", "origin", "roasting"], products: ["coffee beans", "single origins", "blends", "roast profiles", "brewing equipment"], services: ["roasting", "wholesale supply", "brew guidance"], audiences: ["home brewers", "cafes", "coffee enthusiasts"], visualSubjects: ["coffee bean forms", "roasting drum", "origin layers", "brew geometry"] },
  { signals: ["bakery", "bread", "pastry", "vegan bakery"], capabilities: ["bakery", "food", "craft", "menu"], products: ["breads", "pastries", "cakes", "seasonal bakes"], services: ["pre-orders", "catering", "local pickup"], visualSubjects: ["baked forms", "ingredient layers", "oven warmth"] },
  { signals: ["restaurant", "catering", "caterer", "dining"], capabilities: ["food", "hospitality", "menu", "service"], products: ["dishes", "menus", "seasonal selections"], services: ["dining", "reservations", "catering", "events"], visualSubjects: ["table composition", "ingredient forms", "hospitality flow"] },
  { signals: ["jewelry", "jewellery", "ring", "necklace", "gemstone"], capabilities: ["jewelry", "luxury_product", "craft", "materials"], products: ["rings", "necklaces", "bracelets", "earrings", "gemstones"], services: ["custom design", "sizing", "care guidance"], visualSubjects: ["jewel facets", "metal arcs", "stone settings"] },
  { signals: ["textile", "textiles", "fabric", "fabrics", "woven material"], capabilities: ["textiles", "materials", "fabric", "craft", "product_showcase"], products: ["fabrics", "woven materials", "technical textiles", "finishes", "material collections"], services: ["material development", "custom production", "textile guidance"], visualSubjects: ["fabric folds", "woven structures", "material layers"] },
  { signals: ["baby clothing", "apparel", "clothing", "garment", "fashion"], capabilities: ["fashion", "textiles", "materials", "sizing", "product_showcase"], products: ["clothing", "collections", "fabrics", "sizes", "accessories"], services: ["fit guidance", "custom orders"], visualSubjects: ["fabric folds", "garment silhouettes", "material layers"] },
  { signals: ["furniture", "desk", "chair", "table", "cabinet"], capabilities: ["furniture", "product_design", "materials", "craft"], products: ["tables", "chairs", "desks", "storage", "material options"], services: ["custom design", "delivery planning", "installation"], visualSubjects: ["furniture planes", "joinery details", "material slabs"] },
  { signals: ["florist", "flower", "flowers", "bouquet"], capabilities: ["floristry", "craft", "occasion", "delivery"], products: ["bouquets", "seasonal flowers", "event arrangements", "gift selections"], services: ["event florals", "delivery", "custom arrangements"], visualSubjects: ["petal clusters", "stem rhythm", "botanical layers"] },
  { signals: ["musical instrument", "musical instruments", "guitar", "piano", "drum", "music store"], capabilities: ["musical_instruments", "acoustics", "craft", "retail"], products: ["instruments", "accessories", "amplification", "cases"], services: ["setup", "repair", "lessons", "buying guidance"], visualSubjects: ["instrument silhouettes", "strings and sound waves", "acoustic forms"] },
  { signals: ["dental", "dentist", "dentistry"], capabilities: ["dental", "healthcare", "care", "appointments"], products: ["treatment information", "preventive-care guidance"], services: ["checkups", "preventive care", "restorative care", "consultation"], audiences: ["patients", "families"], visualSubjects: ["calm clinical space", "care pathway", "dental forms"] },
  { signals: ["physical therapy", "physiotherapy", "rehabilitation", "sports rehabilitation"], capabilities: ["therapy", "rehabilitation", "movement", "healthcare"], products: ["care programs", "recovery plans"], services: ["assessment", "therapy", "movement rehabilitation"], visualSubjects: ["movement paths", "joint mechanics", "recovery stages"] },
  { signals: ["veterinary", "vet clinic", "animal hospital"], capabilities: ["veterinary", "animal_care", "healthcare"], products: ["wellness plans", "care resources"], services: ["consultation", "preventive care", "diagnostics"], visualSubjects: ["animal silhouettes", "care pathways", "calm clinical forms"] },
  { signals: ["medical laboratory", "diagnostic laboratory", "lab testing"], capabilities: ["laboratory", "diagnostics", "precision", "healthcare"], products: ["test panels", "diagnostic reports"], services: ["sample testing", "laboratory analysis", "reporting"], visualSubjects: ["sample arrays", "diagnostic layers", "precision grids"] },
  { signals: ["legal", "law firm", "lawyer", "attorney"], capabilities: ["legal", "professional_practice", "advisory", "confidentiality"], products: ["practice areas", "legal resources"], services: ["consultation", "contract review", "dispute guidance"], visualSubjects: ["structured documents", "measured editorial hierarchy"] },
  { signals: ["accounting", "accountant", "bookkeeping", "tax"], capabilities: ["accounting", "finance", "records", "compliance"], products: ["reports", "tax records", "management accounts"], services: ["bookkeeping", "tax preparation", "payroll", "financial reporting"], visualSubjects: ["ledger structure", "financial flow", "reporting layers"] },
  { signals: ["architecture", "architect", "architecture studio"], capabilities: ["architecture", "spatial", "materials", "planning"], products: ["project studies", "design concepts", "plans"], services: ["architecture", "space planning", "project consultation"], visualSubjects: ["building massing", "floor plates", "structural frames"] },
  { signals: ["interior design", "interior designer"], capabilities: ["interior_design", "spatial", "materials", "design"], products: ["material palettes", "room concepts", "space plans"], services: ["interior design", "space planning", "styling"], visualSubjects: ["room volumes", "material planes", "furniture layouts"] },
  { signals: ["photography", "photographer", "cinematography", "photo studio"], capabilities: ["photography", "media", "storytelling", "portfolio"], products: ["galleries", "films", "project stories"], services: ["photography", "cinematography", "editing", "production"], visualSubjects: ["camera frames", "image sequence", "light and lens geometry"] },
  { signals: ["machinery", "industrial equipment", "construction equipment"], capabilities: ["industrial", "equipment", "engineering", "technical_product"], products: ["machines", "equipment", "attachments", "components"], services: ["installation", "maintenance", "technical support"], visualSubjects: ["machine assemblies", "mechanical layers", "structural frames"] },
  { signals: ["solar", "renewable energy", "photovoltaic"], capabilities: ["solar", "renewable_energy", "installation", "power"], products: ["solar panels", "inverters", "mounting systems", "energy storage"], services: ["site assessment", "installation", "maintenance"], visualSubjects: ["solar arrays", "energy flow", "storage modules"] },
  { signals: ["metal fabrication", "fabrication", "metalwork"], capabilities: ["fabrication", "manufacturing", "materials", "custom_build"], products: ["fabricated parts", "frames", "enclosures", "assemblies"], services: ["cutting", "forming", "welding", "custom fabrication"], visualSubjects: ["sheet-metal folds", "welded frames", "assembly layers"] },
  { signals: ["packaging", "packaging manufacturer"], capabilities: ["packaging", "manufacturing", "materials", "production"], products: ["boxes", "containers", "protective packaging", "printed packaging"], services: ["packaging design", "production", "wholesale supply"], visualSubjects: ["folded structures", "material sheets", "packaging systems"] },
  { signals: ["pet grooming", "grooming salon"], capabilities: ["pet_care", "grooming", "local_service", "booking"], products: ["care packages", "grooming options"], services: ["washing", "grooming", "coat care", "appointments"], visualSubjects: ["care sequence", "coat texture", "gentle service steps"] },
  { signals: ["laundry", "dry cleaning"], capabilities: ["laundry", "care", "local_service", "delivery"], products: ["care plans", "service options"], services: ["washing", "dry cleaning", "pressing", "pickup and delivery"], visualSubjects: ["fabric flow", "care stages", "clean folds"] },
  { signals: ["landscaping", "landscape service"], capabilities: ["landscaping", "outdoor_space", "maintenance", "local_service"], products: ["garden plans", "planting palettes"], services: ["landscape design", "installation", "maintenance"], visualSubjects: ["garden layers", "planting grids", "site contours"] },
  { signals: ["vehicle repair", "car repair", "bicycle repair", "bike repair"], capabilities: ["repair", "diagnostics", "maintenance", "local_service"], products: ["service packages", "replacement parts"], services: ["inspection", "diagnostics", "repair", "maintenance"], visualSubjects: ["component breakdown", "diagnostic path", "workshop tools"] },
  { signals: ["real estate", "property brokerage", "property leasing", "commercial leasing"], capabilities: ["real_estate", "property", "listings", "brokerage"], products: ["properties", "listings", "developments"], services: ["brokerage", "viewings", "leasing", "property guidance"], visualSubjects: ["property volumes", "location layers", "site plans"] },
  { signals: ["language school", "technical training", "online learning", "training provider"], capabilities: ["education", "learning", "curriculum", "progress"], products: ["courses", "learning paths", "classes", "resources"], services: ["teaching", "training", "assessment"], visualSubjects: ["learning paths", "lesson modules", "progress steps"] },
  { signals: ["hydroponic", "greenhouse", "vertical farming"], capabilities: ["agriculture", "controlled_environment", "sensors", "automation"], products: ["growing systems", "sensors", "irrigation equipment", "control systems"], services: ["system design", "installation", "monitoring"], visualSubjects: ["growing rows", "water channels", "sensor networks"] },
  { signals: ["carbon accounting", "emissions accounting"], capabilities: ["carbon_measurement", "accounting", "climate_technology", "reporting"], products: ["emissions dashboards", "carbon ledgers", "reports"], services: ["measurement", "reporting", "implementation guidance"], visualSubjects: ["emissions flow", "carbon ledger", "reporting cards"] },
  { signals: ["creator analytics", "creator economy"], capabilities: ["creator_economy", "analytics", "data", "software"], products: ["audience dashboards", "content metrics", "campaign reports"], services: ["analytics", "reporting", "platform integration"], visualSubjects: ["audience signals", "content metrics", "data cards"] },
  { signals: ["spatial computing", "immersive computing", "xr studio"], capabilities: ["spatial_computing", "software", "interactive", "3d"], products: ["spatial experiences", "interactive prototypes", "3D interfaces"], services: ["experience design", "prototyping", "software development"], visualSubjects: ["spatial interfaces", "layered volumes", "interactive planes"] },
  { signals: ["cold storage", "cold chain"], capabilities: ["cold_chain", "storage", "logistics", "temperature_control"], products: ["cold rooms", "refrigeration systems", "storage capacity"], services: ["storage", "temperature monitoring", "distribution"], visualSubjects: ["insulated volumes", "temperature flow", "storage grids"] },
  { signals: ["3d printing", "additive manufacturing"], capabilities: ["3d_printing", "manufacturing", "prototyping", "custom_build"], products: ["printed parts", "prototypes", "material options"], services: ["3D printing", "prototyping", "design preparation"], visualSubjects: ["layered print paths", "material deposition", "part geometry"] },
  { signals: ["aquarium", "aquatic"], capabilities: ["aquarium_design", "water_systems", "spatial", "care"], products: ["aquariums", "lighting", "filtration", "aquatic displays"], services: ["design", "installation", "maintenance"], visualSubjects: ["water volumes", "aquatic layers", "filter circulation"] },
  { signals: ["acoustic panel", "acoustic treatment", "sound panel"], capabilities: ["acoustics", "manufacturing", "materials", "interior_product"], products: ["acoustic panels", "baffles", "material finishes", "mounting systems"], services: ["acoustic planning", "custom manufacturing", "installation"], visualSubjects: ["sound-wave relief", "panel arrays", "material depth"] }
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9+./#\s]/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim() ?? "").filter(Boolean)));
}

function titleCase(value: string) {
  return value
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .replace(/\bCrm\b/g, "CRM")
    .replace(/\bIt\b/g, "IT")
    .replace(/\bSaas\b/g, "SaaS")
    .replace(/\b3d\b/gi, "3D");
}

function phrasePattern(value: string) {
  return new RegExp(`(?:^|\\b)${normalize(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?:\\b|$)`, "i");
}

function hasSignal(text: string, signal: string) {
  return phrasePattern(signal).test(text);
}

function cleanPhrase(value: string) {
  return value
    .replace(/\b(?:in|using|with)\s+(?:interactive\s+)?(?:3d|webgl|three(?:\.js)?|threejs)[\s\S]*$/i, "")
    .replace(/\b(?:with|using|including|featuring|that|which)\b[\s\S]*$/i, "")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)[-\s]+pages?\b/gi, "")
    .replace(/\b(?:landing\s+page|website|site)\b/gi, "")
    .replace(/^(?:me\s+)?(?:a|an|the|my)\s+/i, "")
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\s]+|[,.:;\s]+$/g, "")
    .trim();
}

function extractBusinessPhrase(prompt: string) {
  const named = prompt.match(/\b(?:called|named)\s+([a-z0-9][a-z0-9 '&.+/-]{2,90}?)(?=\s+(?:with|using|in)\b|[,.!?]|$)/i)?.[1];
  if (named) return { brandName: cleanPhrase(named), phrase: cleanPhrase(named), source: "named_business" as const };

  const patterns = [
    /\b(?:website|site|landing\s+page)\s+for\s+(?:my\s+|a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9 '&.+/-]{1,90})/i,
    /\b(?:build|create|design|generate|make)\s+(?:me\s+)?(?:a\s+|an\s+|the\s+)?([a-z0-9][a-z0-9 '&.+/-]{1,90}?)\s+(?:website|site|landing\s+page)\b/i,
    /\b(?:for\s+(?:my\s+|a\s+|an\s+|the\s+)?)?([a-z0-9][a-z0-9 '&.+/-]{1,70}?)\s+(?:business|company|shop|store|studio|practice|firm|consultancy|manufacturer|provider|salon|workshop|roastery|bakery|restaurant|laboratory|brokerage)\b/i
  ];
  for (const pattern of patterns) {
    const phrase = cleanPhrase(prompt.match(pattern)?.[1] ?? "");
    const useful = phrase.split(/\s+/).map(normalize).filter((word) => Boolean(word) && !genericBusinessWords.has(word));
    if (useful.length) return { brandName: null, phrase: phrase.trim(), source: "dynamic_niche" as const };
  }
  return { brandName: null, phrase: null, source: "generic_fallback" as const };
}

function scoreNode(text: string, nodeValue: UniversalIndustryNode) {
  const scoreList = (signals: string[], weight: number) => signals.reduce((score, signal) => {
    if (!hasSignal(text, signal)) return score;
    const words = normalize(signal).split(/\s+/).length;
    const weakness = weakCatalogSignals.has(normalize(signal)) ? 0.3 : 1;
    return score + (weight + Math.max(0, words - 1)) * weakness;
  }, 0);
  return scoreList(nodeValue.aliases, 5) + scoreList(nodeValue.productSignals, 4) + scoreList(nodeValue.serviceSignals, 4) + scoreList(nodeValue.relatedTerms, 2) + scoreList(nodeValue.capabilities, 1);
}

function matchingConcepts(text: string) {
  return concepts
    .map((concept) => ({ concept, score: concept.signals.reduce((sum, signal) => sum + (hasSignal(text, signal) ? 2 + normalize(signal).split(/\s+/).length : 0), 0) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.concept);
}

function businessModels(text: string, primary: UniversalIndustryNode | null) {
  const values: WebsiteBusinessModel[] = [];
  const add = (model: WebsiteBusinessModel, pattern: RegExp) => { if (pattern.test(text)) values.push(model); };
  add("manufacturing", /\b(?:manufacturer|manufacturing|factory|fabrication|producer|roastery)\b/);
  add("custom_build", /\b(?:custom|made[-\s]to[-\s]order|bespoke|artisan)\b/);
  add("retail", /\b(?:shop|store|retail|boutique|ecommerce)\b/);
  if (/\broastery\b/.test(text)) values.push("retail");
  add("wholesale", /\b(?:wholesale|distributor|supplier)\b/);
  add("repair", /\b(?:repair|workshop|maintenance)\b/);
  add("installation", /\b(?:installation|installer|fit[-\s]?out)\b/);
  add("consulting", /\b(?:consultancy|consulting|advisor|advisory)\b/);
  add("professional_practice", /\b(?:firm|practice|accountant|lawyer|architect|brokerage)\b/);
  add("healthcare", /\b(?:clinic|therapy|laboratory|medical|dental|veterinary)\b/);
  add("education", /\b(?:school|academy|training|learning|education)\b/);
  add("hospitality", /\b(?:hotel|restaurant|cafe|bakery|hospitality|catering)\b/);
  add("saas", /\b(?:saas|software|platform|app|workflow startup)\b/);
  add("marketplace", /\bmarketplace\b/);
  add("subscription", /\bsubscription\b/);
  add("rental", /\b(?:rental|leasing|hire)\b/);
  add("service", /\b(?:service|services|studio|salon|provider)\b/);
  if (!values.length && primary?.businessModels.length) values.push(primary.businessModels[0]);
  return unique(values) as WebsiteBusinessModel[];
}

function nicheLevels(phrase: string | null) {
  if (!phrase) return { niche: null, subNiche: null };
  const words = normalize(phrase).split(/\s+/).filter(Boolean);
  const withoutModifiers = words.filter((word) => !nicheModifiers.has(word));
  const niche = titleCase((withoutModifiers.length ? withoutModifiers : words).join(" "));
  const subNiche = withoutModifiers.length !== words.length ? titleCase(words.join(" ")) : null;
  return { niche, subNiche };
}

function semanticDomainLabel(phrase: string | null, canonical: CanonicalEvidence | null) {
  if (!phrase) return canonical?.displayName ?? "Current Prompt Business";
  const cleaned = titleCase(phrase);
  if (/\b(?:agency|bakery|brokerage|business|company|consultancy|clinic|firm|laboratory|manufacturer|platform|practice|provider|restaurant|roastery|salon|school|shop|software|store|studio|workshop)\b/i.test(cleaned)) return cleaned;
  const words = cleaned.split(/\s+/);
  const last = words.at(-1) ?? "";
  if (/(?:ches|shes|xes|zes|ses)$/i.test(last) && !/services$/i.test(last)) {
    words[words.length - 1] = last.slice(0, -2);
  } else if (/s$/i.test(last) && !/(?:analytics|gas|saas|services)$/i.test(last)) {
    words[words.length - 1] = last.slice(0, -1);
  }
  return `${words.join(" ")} Business`;
}

function suggestedStructure(models: WebsiteBusinessModel[]) {
  if (models.includes("saas")) return { pages: ["home", "features", "pricing", "about", "contact"], sections: ["hero", "features", "workflow", "proof", "pricing", "faq", "contact"] };
  if (models.includes("manufacturing")) return { pages: ["home", "products", "capabilities", "about", "contact"], sections: ["hero", "products", "capabilities", "materials", "process", "quality", "contact"] };
  if (models.includes("healthcare")) return { pages: ["home", "services", "about", "contact"], sections: ["hero", "services", "care_process", "trust", "faq", "contact"] };
  if (models.includes("education")) return { pages: ["home", "courses", "about", "contact"], sections: ["hero", "learning_paths", "courses", "outcomes", "faq", "contact"] };
  if (models.includes("hospitality")) return { pages: ["home", "menu", "about", "contact"], sections: ["hero", "offer", "experience", "process", "faq", "contact"] };
  if (models.includes("consulting") || models.includes("professional_practice") || models.includes("service") || models.includes("repair") || models.includes("installation")) return { pages: ["home", "services", "about", "contact"], sections: ["hero", "services", "process", "expertise", "trust", "faq", "contact"] };
  return { pages: ["home", "products", "about", "contact"], sections: ["hero", "products", "categories", "comparison", "trust", "faq", "contact"] };
}

function ctas(models: WebsiteBusinessModel[], niche: string | null) {
  const subject = niche ?? "the offer";
  if (models.includes("saas")) return ["Explore the product", "Request a demo"];
  if (models.includes("healthcare")) return ["Review care options", "Request an appointment"];
  if (models.includes("education")) return ["Explore learning options", "Ask about enrollment"];
  if (models.includes("consulting") || models.includes("professional_practice")) return ["Review capabilities", "Request a consultation"];
  if (models.includes("service") || models.includes("repair") || models.includes("installation")) return ["Review services", "Request guidance"];
  return [`Explore ${subject}`, "Ask about the right option"];
}

export function resolveWebsiteNiche(input: { canonical?: CanonicalEvidence | null; prompt: string }): WebsiteSemanticResolution {
  const extracted = extractBusinessPhrase(input.prompt);
  const text = normalize(`${extracted.phrase ?? ""} ${input.prompt}`);
  const ranked = WEBSITE_INDUSTRY_CATALOG
    .map((candidate) => ({ node: candidate, score: scoreNode(text, candidate) }))
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score || a.node.displayName.localeCompare(b.node.displayName));
  const primary = ranked[0]?.node ?? null;
  const secondary = ranked
    .slice(1)
    .filter((candidate) => candidate.score >= Math.max(3, (ranked[0]?.score ?? 0) * 0.48))
    .slice(0, 3)
    .map((candidate) => candidate.node);
  const conceptMatches = matchingConcepts(text);
  const models = businessModels(text, primary);
  const levels = nicheLevels(extracted.phrase);
  const structure = suggestedStructure(models);
  const conceptProducts = unique(conceptMatches.flatMap((concept) => concept.products ?? []));
  const conceptServices = unique(conceptMatches.flatMap((concept) => concept.services ?? []));
  const products = unique(conceptProducts.length ? conceptProducts : primary?.productSignals ?? []).slice(0, 9);
  const services = unique(conceptServices.length ? conceptServices : primary?.serviceSignals ?? []).slice(0, 7);
  const capabilities = unique([
    ...(input.canonical?.capabilities ?? []),
    ...conceptMatches.flatMap((concept) => concept.capabilities),
    ...(primary?.capabilities ?? []),
    ...secondary.flatMap((candidate) => candidate.capabilities),
    ...models
  ]).slice(0, 18);
  const audiences = unique([
    ...conceptMatches.flatMap((concept) => concept.audiences ?? []),
    ...(primary?.audienceSignals ?? []),
    ...secondary.flatMap((candidate) => candidate.audienceSignals)
  ]).slice(0, 7);
  const visualSubjects = unique([
    ...conceptMatches.flatMap((concept) => concept.visualSubjects),
    ...(primary?.visualSignals ?? []),
    ...secondary.flatMap((candidate) => candidate.visualSignals)
  ]).slice(0, 7);
  const trustSignals = unique([
    ...(primary?.trustSignals ?? []),
    ...secondary.flatMap((candidate) => candidate.trustSignals)
  ]).slice(0, 6);
  const hasSemanticPhrase = Boolean(extracted.phrase);
  const topScore = ranked[0]?.score ?? 0;
  const semanticConfidence = Number(Math.min(0.94, hasSemanticPhrase ? 0.58 + Math.min(0.28, topScore * 0.018) + (conceptMatches.length ? 0.06 : 0) : input.canonical ? input.canonical.confidence : 0.22).toFixed(2));
  const source = input.canonical
    ? "canonical_taxonomy" as const
    : extracted.source === "named_business"
    ? "named_business" as const
    : hasSemanticPhrase
      ? "dynamic_niche" as const
      : input.canonical
        ? "canonical_taxonomy" as const
        : "generic_fallback" as const;

  return {
    audiences: audiences.length ? audiences : ["people exploring the offer", "customers comparing practical options"],
    brandName: extracted.brandName,
    businessModels: models,
    canonicalConfidence: input.canonical?.confidence ?? 0,
    canonicalDomain: input.canonical?.domainId ?? null,
    capabilities,
    category: primary?.category ?? null,
    ctas: ctas(models, levels.subNiche ?? levels.niche),
    industry: primary?.displayName ?? null,
    niche: levels.niche,
    primaryIndustryNodeId: primary?.id ?? null,
    products,
    rawBusinessPhrase: extracted.phrase,
    secondaryIndustryNodeIds: secondary.map((candidate) => candidate.id),
    sector: primary?.sector ?? null,
    semanticConfidence,
    semanticDomain: input.canonical?.displayName ?? (extracted.source === "named_business" && extracted.phrase ? titleCase(extracted.phrase) : semanticDomainLabel(extracted.phrase, null)),
    services,
    source,
    subNiche: levels.subNiche,
    suggestedPages: structure.pages,
    suggestedSections: structure.sections,
    trustSignals,
    visualSubjects
  };
}
