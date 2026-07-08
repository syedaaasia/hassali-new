export type TaxonomyTier = 1 | 2;

export type DomainId =
  | "accounting_firm"
  | "bakery"
  | "beauty_salon"
  | "bicycle_shop"
  | "car_rental"
  | "car_repair"
  | "cleaning_service"
  | "clothing_brand"
  | "construction_company"
  | "crm_software"
  | "dental_clinic"
  | "education_training"
  | "electronics_store"
  | "ecommerce_store"
  | "event_planning"
  | "florist"
  | "furniture_store"
  | "gym_fitness_studio"
  | "hotel_guesthouse"
  | "interior_design"
  | "law_firm"
  | "mobile_phone_shop"
  | "motorcycle_shop"
  | "photography_studio"
  | "real_estate"
  | "restaurant"
  | "seafood_restaurant"
  | "travel_agency"
  | "toy_store"
  | "upholstery";

export type CorrectedTypo = {
  from: string;
  to: string;
};

export type TaxonomyCodeHints = {
  commonStackPreferences?: string[];
  entities: string[];
  possibleApps: string[];
};

export type IndustryTaxonomyProfile = {
  aliases: string[];
  ambiguityNotes?: string[];
  codeHints: TaxonomyCodeHints;
  commonPages: string[];
  commonSections: string[];
  conflicts: DomainId[];
  ctas: string[];
  displayName: string;
  expectedEntities: string[];
  id: DomainId;
  relatedIndustries: string[];
  tier: TaxonomyTier;
  trustSignals: string[];
  typoVariants: CorrectedTypo[];
  visualHints: string[];
  websiteVocabulary: string[];
};

export type DomainClassification = {
  ambiguityNotes: string[];
  ambiguous: boolean;
  assumptionNotes: string[];
  confidence: number;
  correctedTypos: CorrectedTypo[];
  detectedAliases: string[];
  domainId: DomainId | null;
  normalizedPrompt: string;
  profile: IndustryTaxonomyProfile | null;
  relatedCandidates: DomainId[];
};

export type WebsiteIntentContract = {
  assumptionNotes: string[];
  confidence: number;
  correctedTypos: CorrectedTypo[];
  detectedAliases: string[];
  displayName: string;
  domainId: DomainId | null;
  exactPageCount: number | null;
  expectedEntities: string[];
  expectedSections: string[];
  expectedVocabulary: string[];
  forbiddenDomains: DomainId[];
  forbiddenVocabulary: string[];
  generatorStrategy: "clarify_domain_before_generation" | "domain_profile_website" | "generic_extracted_business_website";
  mode: "WEBSITE";
  normalizedPrompt: string;
  originalPrompt: string;
  pageIntentMap: Record<string, string[]>;
  requestedPages: string[];
  requiredFiles: string[];
  trustSignals: string[];
  visualStyleHints: string[];
  ctas: string[];
};

export type CodeIntentContract = {
  appType: string;
  assumptionNotes: string[];
  confidence: number;
  correctedTypos: CorrectedTypo[];
  dataModelHints: string[];
  domainId: DomainId | null;
  entities: string[];
  forbiddenStacks: string[];
  mode: "CODE";
  modules: string[];
  normalizedPrompt: string;
  originalPrompt: string;
  preferredFramework: "fastapi" | "flask" | "next_app" | "react_vite" | "streamlit" | "unknown";
  previewStrategy: "code_source_summary" | "python_streamlit_summary_until_runtime_enabled" | "react_vite_css_summary_until_runtime_enabled";
  requestedFeatures: string[];
  requestedStack: "next" | "node" | "python" | "react_vite" | "unknown";
  runtimeExpectations: string[];
  screens: string[];
};

export type IntentLockContract = CodeIntentContract | WebsiteIntentContract;

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9+./#\s]/g, " ").replace(/\s+/g, " ").trim();
}

function fullProfile(input: Omit<IndustryTaxonomyProfile, "tier">): IndustryTaxonomyProfile {
  return { ...input, tier: 1 };
}

function stubProfile(input: Pick<IndustryTaxonomyProfile, "aliases" | "conflicts" | "displayName" | "id" | "typoVariants" | "websiteVocabulary"> & Partial<IndustryTaxonomyProfile>): IndustryTaxonomyProfile {
  return {
    ambiguityNotes: input.ambiguityNotes ?? [],
    codeHints: input.codeHints ?? { entities: [], possibleApps: [] },
    commonPages: input.commonPages ?? ["home", "about", "services", "contact"],
    commonSections: input.commonSections ?? ["hero", "services", "trust", "contact"],
    ctas: input.ctas ?? ["Contact us", "Request information"],
    expectedEntities: input.expectedEntities ?? input.websiteVocabulary.slice(0, 4),
    relatedIndustries: input.relatedIndustries ?? [],
    tier: 2,
    trustSignals: input.trustSignals ?? [],
    visualHints: input.visualHints ?? [],
    ...input
  };
}

export const industryTaxonomyProfiles: IndustryTaxonomyProfile[] = [
  fullProfile({
    aliases: ["upholstery", "upholstry", "upholestry", "reupholstery", "sofa upholstery", "furniture upholstery", "chair upholstery", "fabric repair", "leather repair", "furniture restoration"],
    codeHints: {
      entities: ["customer", "job", "furniture item", "fabric", "estimate", "invoice"],
      possibleApps: ["estimate tracker", "job booking system", "fabric inventory", "repair workflow CRM"]
    },
    commonPages: ["home", "about", "services", "blog", "contact"],
    commonSections: ["hero", "services", "before_after", "fabric_options", "restoration_process", "testimonials", "estimate_cta", "contact"],
    conflicts: ["mobile_phone_shop", "car_rental", "bicycle_shop", "crm_software", "restaurant"],
    ctas: ["Request a free estimate", "Book a consultation", "Send furniture photos", "Choose fabric options"],
    displayName: "Upholstery Business",
    expectedEntities: ["service", "fabric option", "furniture item", "estimate request", "before/after project"],
    id: "upholstery",
    relatedIndustries: ["furniture", "home services", "repair and restoration", "interior design"],
    trustSignals: ["before and after gallery", "fabric samples", "workmanship guarantee", "years of experience", "local workshop", "free estimate"],
    typoVariants: [{ from: "upholstry", to: "upholstery" }, { from: "upholestry", to: "upholstery" }],
    visualHints: ["warm craft studio", "fabric texture", "before and after restoration", "premium home interior feel"],
    websiteVocabulary: ["sofa reupholstery", "chair restoration", "fabric selection", "leather repair", "custom cushions", "furniture restoration", "commercial upholstery", "home furniture", "foam replacement", "stitching", "before and after", "workshop", "free estimate"]
  }),
  fullProfile({
    aliases: ["mobile phone shop", "phone shop", "smartphone store", "mobile store", "cellphone shop", "phone retail", "phone accessories", "iphone shop", "samsung phone shop", "android phone shop", "unlocked phones", "phone repair shop"],
    codeHints: {
      entities: ["product", "brand", "model", "stock", "supplier", "sale", "repairTicket"],
      possibleApps: ["inventory system", "repair ticket tracker", "sales dashboard"]
    },
    commonPages: ["home", "about", "services", "contact"],
    commonSections: ["hero", "devices", "accessories", "service_counter", "trade_ins", "contact"],
    conflicts: ["car_rental", "bicycle_shop", "crm_software", "restaurant"],
    ctas: ["Compare phones", "Ask about availability", "Request service help"],
    displayName: "Mobile Phone Shop",
    expectedEntities: ["phone model", "accessory", "repair ticket", "warranty question", "trade-in"],
    id: "mobile_phone_shop",
    relatedIndustries: ["electronics retail", "phone repair", "consumer technology"],
    trustSignals: ["warranty support", "device setup", "repair counter", "customer support"],
    typoVariants: [],
    visualHints: ["premium smartphone display", "accessory shelf", "repair counter", "device comparison cards"],
    websiteVocabulary: ["smartphones", "iPhone", "Samsung", "Android phones", "phone accessories", "cases", "chargers", "screen protectors", "unlocked phones", "trade-ins", "installment plans", "warranty", "repairs", "service counter", "new arrivals", "customer support", "product comparison", "device setup"]
  }),
  fullProfile({
    aliases: ["car rental", "rent a car", "vehicle rental", "car hire", "rental cars", "airport rentals", "fleet rental"],
    codeHints: { entities: ["vehicle", "driver", "booking", "invoice", "availability"], possibleApps: ["booking system", "fleet manager", "reservation dashboard"] },
    commonPages: ["home", "about", "services", "blog", "contact"],
    commonSections: ["hero", "fleet", "booking", "insurance", "pricing", "support", "contact"],
    conflicts: ["bicycle_shop", "motorcycle_shop", "crm_software", "mobile_phone_shop"],
    ctas: ["Reserve a vehicle", "Check availability", "Send rental inquiry"],
    displayName: "Car Rental / Vehicle Rental",
    expectedEntities: ["vehicle", "reservation", "driver", "pickup location", "insurance"],
    id: "car_rental",
    relatedIndustries: ["automotive", "travel", "fleet services"],
    trustSignals: ["clean vehicles", "roadside support", "transparent pricing", "insurance guidance"],
    typoVariants: [],
    visualHints: ["vehicle fleet", "pickup/dropoff cards", "rental plan cards"],
    websiteVocabulary: ["rental cars", "vehicle fleet", "economy cars", "SUVs", "luxury vehicles", "pickup and dropoff", "airport rentals", "daily rental", "weekly rental", "insurance", "drivers", "booking", "reservations", "availability", "mileage", "clean vehicles", "roadside support", "transparent pricing"]
  }),
  fullProfile({
    aliases: ["bicycle shop", "cycle shop", "cycling shop", "bike bicycle shop", "bicycle repair", "cycling store"],
    ambiguityNotes: ["The phrase bike shop is ambiguous without bicycle or motorcycle context."],
    codeHints: { entities: ["bicycle", "service job", "accessory", "customer", "sale"], possibleApps: ["bike service booking", "bicycle inventory"] },
    commonPages: ["home", "about", "services", "contact"],
    commonSections: ["hero", "bicycles", "service", "accessories", "fitting", "contact"],
    conflicts: ["car_rental", "motorcycle_shop", "mobile_phone_shop", "crm_software"],
    ctas: ["Book a tune-up", "Explore bicycles", "Visit the workshop"],
    displayName: "Bicycle Shop",
    expectedEntities: ["bicycle", "rider", "service", "accessory", "repair"],
    id: "bicycle_shop",
    relatedIndustries: ["cycling", "sports retail", "repair"],
    trustSignals: ["mechanic service", "bike fitting", "rider guidance"],
    typoVariants: [],
    visualHints: ["cycling showroom", "repair stand", "rider gear"],
    websiteVocabulary: ["bicycles", "cycling", "bike fitting", "helmets", "rider gear", "bicycle repair", "tune-up", "accessories", "workshop", "road bikes", "mountain bikes"]
  }),
  fullProfile({
    aliases: ["restaurant", "dining", "food restaurant", "reservation", "menu"],
    codeHints: { entities: ["menu item", "reservation", "order", "table"], possibleApps: ["restaurant POS", "reservation system"] },
    commonPages: ["home", "menu", "about", "contact"],
    commonSections: ["hero", "menu", "popular_items", "pickup_delivery", "hours", "contact"],
    conflicts: ["crm_software", "mobile_phone_shop", "car_rental"],
    ctas: ["View menu", "Reserve a table", "Order now"],
    displayName: "Restaurant",
    expectedEntities: ["dish", "menu", "reservation", "hours", "location"],
    id: "restaurant",
    relatedIndustries: ["hospitality", "food service"],
    trustSignals: ["fresh ingredients", "chef-led menu", "reviews", "hours"],
    typoVariants: [],
    visualHints: ["dish spotlight", "menu cards", "warm hospitality"],
    websiteVocabulary: ["menu", "food", "reservation", "hours", "chef", "dining", "popular dishes", "pickup", "delivery", "contact"]
  }),
  fullProfile({
    aliases: ["seafood restaurant", "seafood", "sea food restaurant", "fresh catch", "oyster bar", "lobster", "fish grill"],
    codeHints: { entities: ["menu item", "reservation", "catch", "supplier"], possibleApps: ["seafood reservation system", "menu manager"] },
    commonPages: ["home", "menu", "about", "contact"],
    commonSections: ["hero", "menu", "fresh_catch", "sourcing", "reservation", "contact"],
    conflicts: ["crm_software", "mobile_phone_shop", "car_rental"],
    ctas: ["Reserve your table", "View menu", "Ask about private dining"],
    displayName: "Seafood Restaurant",
    expectedEntities: ["seafood dish", "fresh catch", "reservation", "supplier", "menu"],
    id: "seafood_restaurant",
    relatedIndustries: ["restaurant", "hospitality", "coastal dining"],
    trustSignals: ["daily catch", "sustainable sourcing", "chef specials", "reservations"],
    typoVariants: [{ from: "sea food", to: "seafood" }],
    visualHints: ["coastal dining", "fresh seafood plates", "ocean-inspired warmth"],
    websiteVocabulary: ["seafood", "fresh catch", "seasonal catch", "oyster", "lobster", "grilled fish", "reservation", "chef", "sourcing", "sustainability", "ocean", "menu"]
  }),
  fullProfile({
    aliases: ["crm", "crm software", "customer relationship", "customer relationship management", "sales pipeline", "billing dashboard"],
    codeHints: {
      commonStackPreferences: ["react_vite", "python_streamlit"],
      entities: ["customer", "deal", "invoice", "activity", "pipeline"],
      possibleApps: ["CRM dashboard", "sales pipeline tracker", "billing dashboard"]
    },
    commonPages: ["architecture", "data-model", "dashboard"],
    commonSections: ["dashboard", "customers", "pipeline", "billing", "activity"],
    conflicts: ["restaurant", "car_rental", "mobile_phone_shop", "upholstery"],
    ctas: ["Review dashboard", "Open pipeline", "Check billing"],
    displayName: "CRM Software",
    expectedEntities: ["customer", "deal", "invoice", "activity", "billing"],
    id: "crm_software",
    relatedIndustries: ["software_saas", "sales operations", "business systems"],
    trustSignals: ["mock data boundary", "planned auth", "planned database"],
    typoVariants: [],
    visualHints: ["dashboard metrics", "tables", "charts", "pipeline board"],
    websiteVocabulary: ["CRM", "dashboard", "contacts", "pipeline", "billing", "reports", "workflow"]
  }),
  fullProfile({
    aliases: ["dental clinic", "dentist", "tooth", "teeth", "root canal", "orthodontic", "dental care"],
    codeHints: { entities: ["patient", "appointment", "treatment", "doctor"], possibleApps: ["appointment booking", "clinic CRM"] },
    commonPages: ["home", "services", "doctors", "about", "contact"],
    commonSections: ["hero", "treatments", "doctors", "appointments", "hygiene", "reviews", "contact"],
    conflicts: ["restaurant", "mobile_phone_shop", "car_rental", "upholstery"],
    ctas: ["Book appointment", "View treatments", "Contact clinic"],
    displayName: "Dental Clinic",
    expectedEntities: ["treatment", "doctor", "appointment", "patient", "clinic"],
    id: "dental_clinic",
    relatedIndustries: ["healthcare", "clinic", "patient services"],
    trustSignals: ["licensed dentists", "hygiene protocols", "patient reviews", "clear treatment plans"],
    typoVariants: [],
    visualHints: ["calm clinic", "treatment room", "smile care"],
    websiteVocabulary: ["dental", "dentist", "treatments", "appointment", "hygiene", "patient care", "doctors", "clinic"]
  }),
  stubProfile({ aliases: ["motorcycle shop", "motorbike shop", "motor bike shop", "riding gear"], conflicts: ["bicycle_shop", "car_rental"], displayName: "Motorcycle Shop", id: "motorcycle_shop", typoVariants: [], websiteVocabulary: ["motorcycle", "motorbike", "helmets", "rider gear", "spare parts", "engine service", "test rides"] }),
  stubProfile({ aliases: ["bakery", "cake shop", "pastry shop", "bread bakery"], conflicts: ["dental_clinic", "crm_software"], displayName: "Bakery", id: "bakery", typoVariants: [], websiteVocabulary: ["bakery", "cakes", "pastries", "bread", "desserts", "fresh baked", "orders"] }),
  stubProfile({ aliases: ["florist", "flower shop", "bridal flowers", "bouquet"], conflicts: ["crm_software", "mobile_phone_shop"], ctas: ["Order flowers", "Request an arrangement", "Schedule delivery"], displayName: "Florist", id: "florist", trustSignals: ["seasonal collections", "wedding arrangements", "same-day delivery"], typoVariants: [], websiteVocabulary: ["flowers", "bouquet", "wedding", "event", "delivery", "freshness", "arrangements"] }),
  stubProfile({ aliases: ["cleaning service", "cleaning company", "cleaners", "home cleaning"], conflicts: ["restaurant", "crm_software"], ctas: ["Book a cleaning", "Get a free quote", "Schedule recurring cleaning"], displayName: "Cleaning Service", id: "cleaning_service", trustSignals: ["insured cleaners", "local reviews", "recurring cleaning"], typoVariants: [], websiteVocabulary: ["cleaning", "deep clean", "home cleaning", "office cleaning", "move-in cleaning", "move-out cleaning", "schedule", "trusted cleaners"] }),
  stubProfile({ aliases: ["gym", "fitness studio", "gym fitness studio", "personal training"], conflicts: ["restaurant", "car_rental"], displayName: "Gym / Fitness Studio", id: "gym_fitness_studio", typoVariants: [], websiteVocabulary: ["gym", "fitness", "training", "classes", "coaches", "membership", "strength"] }),
  stubProfile({ aliases: ["beauty salon", "salon", "hair salon", "makeup studio"], conflicts: ["dental_clinic", "crm_software"], displayName: "Beauty Salon", id: "beauty_salon", typoVariants: [], websiteVocabulary: ["beauty", "salon", "hair", "makeup", "appointments", "styling", "care"] }),
  stubProfile({ aliases: ["real estate", "real estate agency", "property agency", "realtor"], conflicts: ["car_rental", "crm_software"], ctas: ["View listings", "Schedule a consultation", "Request a valuation"], displayName: "Real Estate", id: "real_estate", trustSignals: ["local market expertise", "buyer guidance", "seller strategy"], typoVariants: [], websiteVocabulary: ["property", "listings", "buyers", "sellers", "viewings", "neighborhoods", "agents"] }),
  stubProfile({ aliases: ["construction company", "builder", "contractor", "construction"], conflicts: ["software_saas" as DomainId, "restaurant" as DomainId].filter(Boolean) as DomainId[], displayName: "Construction Company", id: "construction_company", typoVariants: [], websiteVocabulary: ["construction", "contractor", "projects", "renovation", "site work", "estimates", "safety"] }),
  stubProfile({ aliases: ["law firm", "lawyer", "legal office", "attorney"], conflicts: ["restaurant", "ecommerce_store"], displayName: "Law Firm", id: "law_firm", typoVariants: [], websiteVocabulary: ["law firm", "legal", "attorney", "consultation", "cases", "practice areas", "confidential"] }),
  stubProfile({ aliases: ["accounting firm", "accountant", "tax firm", "bookkeeping"], conflicts: ["restaurant", "ecommerce_store"], displayName: "Accounting Firm", id: "accounting_firm", typoVariants: [], websiteVocabulary: ["accounting", "tax", "bookkeeping", "payroll", "financial reports", "compliance"] }),
  stubProfile({ aliases: ["ecommerce store", "online store", "shop", "product store"], conflicts: ["crm_software", "car_rental"], displayName: "Ecommerce Store", id: "ecommerce_store", typoVariants: [], websiteVocabulary: ["products", "categories", "cart", "checkout", "delivery", "returns", "support"] }),
  stubProfile({
    aliases: ["toy shop", "toy store", "kids toy shop", "kids toy store", "children toy shop", "children's toy shop", "educational toy shop", "toy ecommerce", "toy ecommerce store"],
    codeHints: { entities: ["product", "age group", "category", "order", "invoice"], possibleApps: ["toy inventory app", "kids product catalog", "toy shop POS"] },
    commonPages: ["home", "products", "about", "contact"],
    commonSections: ["hero", "product_categories", "featured_toys", "age_groups", "delivery_returns", "contact"],
    conflicts: ["crm_software", "dental_clinic", "car_rental", "upholstery", "cleaning_service"],
    ctas: ["Shop toys", "Browse age groups", "Ask about delivery"],
    displayName: "Toy Shop",
    expectedEntities: ["toy", "age group", "category", "gift pick", "checkout"],
    id: "toy_store",
    relatedIndustries: ["ecommerce", "children retail", "gift shop"],
    trustSignals: ["safe checkout", "delivery and returns", "age-group guidance", "gift picks"],
    typoVariants: [],
    visualHints: ["premium toy shelves", "playful but clean product cards", "age-group filters", "gift-ready catalog"],
    websiteVocabulary: ["toy shop", "toys", "kids", "age groups", "educational toys", "plush toys", "puzzles", "building blocks", "gifts", "gift picks", "safe checkout", "delivery", "returns", "categories"]
  }),
  stubProfile({ aliases: ["hotel", "guesthouse", "guest house", "boutique hotel"], conflicts: ["restaurant", "car_rental"], displayName: "Hotel / Guesthouse", id: "hotel_guesthouse", typoVariants: [], websiteVocabulary: ["rooms", "booking", "amenities", "location", "guests", "breakfast", "hospitality"] }),
  stubProfile({ aliases: ["travel agency", "tour agency", "trip planner", "travel company"], conflicts: ["car_rental", "restaurant"], displayName: "Travel Agency", id: "travel_agency", typoVariants: [], websiteVocabulary: ["travel", "tours", "packages", "destinations", "itinerary", "booking", "support"] }),
  stubProfile({ aliases: ["car repair", "auto repair", "mechanic shop", "vehicle service"], conflicts: ["car_rental", "bicycle_shop"], displayName: "Car Repair", id: "car_repair", typoVariants: [], websiteVocabulary: ["car repair", "mechanic", "diagnostics", "oil change", "brakes", "service booking", "warranty"] }),
  stubProfile({ aliases: ["electronics store", "electronics shop", "tv shop", "tv store", "television shop", "television store", "smart tv shop", "smart tv store"], conflicts: ["mobile_phone_shop", "dental_clinic"], displayName: "Electronics Store", id: "electronics_store", typoVariants: [], websiteVocabulary: ["electronics", "TV", "OLED", "QLED", "warranty", "installation", "delivery"] }),
  stubProfile({ aliases: ["clothing brand", "fashion brand", "apparel store", "clothing store"], conflicts: ["crm_software", "restaurant"], displayName: "Clothing Brand", id: "clothing_brand", typoVariants: [], websiteVocabulary: ["clothing", "fashion", "collection", "lookbook", "sizes", "fabric", "shipping"] }),
  stubProfile({ aliases: ["interior design", "interior designer", "home interiors"], conflicts: ["upholstery", "construction_company"], displayName: "Interior Design", id: "interior_design", typoVariants: [], websiteVocabulary: ["interior design", "space planning", "materials", "moodboard", "consultation", "home styling"] }),
  stubProfile({ aliases: ["furniture store", "furniture shop", "sofa store", "chair store"], conflicts: ["upholstery", "mobile_phone_shop"], displayName: "Furniture Store", id: "furniture_store", typoVariants: [], websiteVocabulary: ["furniture", "sofa", "chair", "table", "showroom", "delivery", "collections"] }),
  stubProfile({ aliases: ["photography studio", "photographer", "photo studio"], conflicts: ["crm_software", "restaurant"], displayName: "Photography Studio", id: "photography_studio", typoVariants: [], websiteVocabulary: ["photography", "portfolio", "shoot", "studio", "packages", "gallery", "booking"] }),
  stubProfile({ aliases: ["event planning", "event planner", "wedding planner", "events company"], conflicts: ["restaurant", "crm_software"], displayName: "Event Planning", id: "event_planning", typoVariants: [], websiteVocabulary: ["events", "planning", "weddings", "coordination", "decor", "vendors", "consultation"] }),
  stubProfile({ aliases: ["education training", "training center", "online course", "academy", "school"], conflicts: ["crm_software", "restaurant"], displayName: "Education / Training", id: "education_training", typoVariants: [], websiteVocabulary: ["courses", "training", "students", "certificates", "classes", "instructors", "enrollment"] })
];

const profileMap = new Map(industryTaxonomyProfiles.map((profile) => [profile.id, profile]));

export function getTaxonomyProfile(id: string | null | undefined) {
  if (!id) return null;
  return profileMap.get(id as DomainId) ?? null;
}

export function allTaxonomyProfiles() {
  return industryTaxonomyProfiles;
}

function correctedPrompt(prompt: string, profile: IndustryTaxonomyProfile | null) {
  let next = prompt;
  const corrected: CorrectedTypo[] = [];

  for (const typo of profile?.typoVariants ?? []) {
    const pattern = new RegExp(`\\b${typo.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig");
    if (pattern.test(next)) {
      corrected.push(typo);
      next = next.replace(pattern, typo.to);
    }
  }

  return { corrected, normalizedPrompt: normalizeText(next) };
}

function aliasMatches(prompt: string, profile: IndustryTaxonomyProfile) {
  const text = normalizeText(prompt);
  const aliases = [...profile.aliases, ...profile.typoVariants.map((typo) => typo.from)];

  return aliases.filter((alias) => {
    const normalizedAlias = normalizeText(alias);
    const escaped = normalizedAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

    return new RegExp(`(?:^|\\s)${escaped}(?:\\s|[.,!?;:]|$)`, "i").test(text);
  });
}

export function classifyDomainIntent(prompt: string): DomainClassification {
  const normalized = normalizeText(prompt);
  const bikeAmbiguous = /\bbike shop\b|\bbike business\b|\bpremium bike shop\b/.test(normalized) &&
    !/\bbicycle|cycling|cycle shop|motorcycle|motorbike|motor bike\b/.test(normalized);

  if (bikeAmbiguous) {
    return {
      ambiguityNotes: ["Bike shop can mean bicycle shop or motorcycle shop. Ask for clarification or make the assumption explicit."],
      ambiguous: true,
      assumptionNotes: ["No bicycle or motorcycle context was present."],
      confidence: 0.52,
      correctedTypos: [],
      detectedAliases: ["bike shop"],
      domainId: null,
      normalizedPrompt: normalized,
      profile: null,
      relatedCandidates: ["bicycle_shop", "motorcycle_shop"]
    };
  }

  const scored = industryTaxonomyProfiles
    .map((profile) => {
      const matches = aliasMatches(prompt, profile);
      const specificityBoost = profile.id === "toy_store" && /\b(?:toy shop|toy store|kids toy|children'?s toy|educational toys?|plush toys?|building blocks)\b/.test(normalized)
        ? 2
        : 0;
      return { matches, profile, score: matches.reduce((sum, match) => sum + Math.max(1, match.split(/\s+/).length), 0) + specificityBoost };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.matches[0].length - a.matches[0].length);
  const best = scored[0];

  if (!best) {
    return {
      ambiguityNotes: [],
      ambiguous: false,
      assumptionNotes: ["No taxonomy profile matched the current prompt with high confidence."],
      confidence: 0.2,
      correctedTypos: [],
      detectedAliases: [],
      domainId: null,
      normalizedPrompt: normalized,
      profile: null,
      relatedCandidates: []
    };
  }

  const { corrected, normalizedPrompt } = correctedPrompt(prompt, best.profile);
  const confidence = Math.min(0.98, 0.68 + best.score * 0.08 + (corrected.length ? 0.08 : 0));
  const runnerUp = scored.find((item) => item.profile.id !== best.profile.id && item.score >= best.score - 1);

  return {
    ambiguityNotes: runnerUp ? [`Also matched ${runnerUp.profile.displayName}; selected ${best.profile.displayName} because it had stronger alias evidence.`] : best.profile.ambiguityNotes ?? [],
    ambiguous: Boolean(runnerUp && confidence < 0.82),
    assumptionNotes: corrected.length ? corrected.map((typo) => `Corrected "${typo.from}" to "${typo.to}".`) : [],
    confidence,
    correctedTypos: corrected,
    detectedAliases: unique(best.matches),
    domainId: best.profile.id,
    normalizedPrompt,
    profile: best.profile,
    relatedCandidates: runnerUp ? [runnerUp.profile.id] : []
  };
}

function wordNumber(value: string) {
  const map: Record<string, number> = { five: 5, four: 4, one: 1, seven: 7, six: 6, three: 3, two: 2 };
  return map[value] ?? null;
}

function normalizePage(value: string) {
  const normalized = normalizeText(value);
  if (normalized === "blogs" || normalized === "articles") return "blog";
  if (normalized === "about us") return "about";
  if (normalized === "index") return "home";
  if (normalized === "service" || normalized === "services") return "services";
  if (normalized === "homepage") return "home";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page";
}

function extractExplicitPageList(prompt: string) {
  const patterns = [
    /\binclude\s+([\s\S]{0,180}?)\s+pages?\b/i,
    /\bwith\s+(?:exactly\s+)?(?:\d+|one|two|three|four|five|six|seven)\s+pages?\s*:?\s*([\s\S]{0,180})/i,
    /\bpages?\s*:?\s*([\s\S]{0,180})/i
  ];
  const pageWordPattern = /about us|our story|about|services?|blogs?|blog|contact|story|products?|menu|pricing|gallery|shop|fleet|booking|home|homepage/gi;

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const rawList = match?.[1];
    if (!rawList) continue;

    const boundaryLimited = rawList
      .split(/\b(?:with|and\s+strong|using|for|that|which|plus)\b/i)[0]
      .replace(/\.$/, "");
    const listed = boundaryLimited
      .match(pageWordPattern)
      ?.map(normalizePage)
      .filter(Boolean) ?? [];

    if (listed.length >= 2) {
      return unique(listed);
    }
  }

  return [];
}

export function extractRequestedPages(prompt: string, fallback: string[] = []) {
  const text = normalizeText(prompt);
  const countMatch = text.match(/\b(\d+|one|two|three|four|five|six|seven)\s+(?:page|pages)\b/);
  const exactPageCount = countMatch
    ? Number.isNaN(Number(countMatch[1]))
      ? wordNumber(countMatch[1])
      : Number(countMatch[1])
    : null;
  const listed = extractExplicitPageList(prompt);
  const requestedPages = unique(listed.length ? listed : fallback).slice(0, exactPageCount ?? undefined);

  return {
    exactPageCount,
    requestedPages
  };
}

export function pageToHtmlPath(page: string) {
  const normalized = normalizePage(page);
  return normalized === "home" ? "index.html" : `${normalized}.html`;
}

function contractForbiddenVocabulary(profile: IndustryTaxonomyProfile | null) {
  if (!profile) return ["Current Prompt Website", "domain-specific hero", "contact / unknown"];
  const commonWords = new Set([
    "accessories",
    "availability",
    "booking",
    "contact",
    "customer support",
    "delivery",
    "dining",
    "hours",
    "pickup",
    "repairs",
    "reservations",
    "support",
    "warranty",
    "workshop"
  ]);
  const conflicts = profile.conflicts
    .flatMap((id) => getTaxonomyProfile(id)?.websiteVocabulary ?? [id.replace(/_/g, " ")])
    .filter((term) => !commonWords.has(normalizeText(term)) && term.length > 3);
  return unique(["Current Prompt Website", "domain-specific hero", "contact / unknown", "unknown with clear guidance", ...conflicts]);
}

export function buildWebsiteIntentContract(input: {
  prompt: string;
  requestedPagesFallback?: string[];
}): WebsiteIntentContract {
  const classification = classifyDomainIntent(input.prompt);
  const profile = classification.profile;
  const pageInfo = extractRequestedPages(input.prompt, input.requestedPagesFallback?.length ? input.requestedPagesFallback : profile?.commonPages ?? ["home", "about", "contact"]);
  const requestedPages = pageInfo.requestedPages.length ? pageInfo.requestedPages : profile?.commonPages ?? ["home", "about", "contact"];

  return {
    assumptionNotes: classification.ambiguous
      ? [...classification.assumptionNotes, ...classification.ambiguityNotes]
      : classification.assumptionNotes,
    confidence: classification.confidence,
    correctedTypos: classification.correctedTypos,
    ctas: profile?.ctas ?? [],
    detectedAliases: classification.detectedAliases,
    displayName: profile?.displayName ?? "Current Prompt Business",
    domainId: classification.domainId,
    exactPageCount: pageInfo.exactPageCount,
    expectedEntities: profile?.expectedEntities ?? [],
    expectedSections: profile?.commonSections ?? [],
    expectedVocabulary: profile?.websiteVocabulary ?? [],
    forbiddenDomains: profile?.conflicts ?? [],
    forbiddenVocabulary: contractForbiddenVocabulary(profile),
    generatorStrategy: classification.ambiguous ? "clarify_domain_before_generation" : profile ? "domain_profile_website" : "generic_extracted_business_website",
    mode: "WEBSITE",
    normalizedPrompt: classification.normalizedPrompt,
    originalPrompt: input.prompt,
    pageIntentMap: Object.fromEntries(requestedPages.map((page) => [page, profile?.commonSections.slice(0, 4) ?? ["hero", "contact"]])),
    requestedPages,
    requiredFiles: unique([...requestedPages.map(pageToHtmlPath), "styles.css", "main.js", "HASSALI.md"]),
    trustSignals: profile?.trustSignals ?? [],
    visualStyleHints: profile?.visualHints ?? []
  };
}

function requestedStack(prompt: string): CodeIntentContract["requestedStack"] {
  const text = normalizeText(prompt);
  if (/\b(?:python|py|streamlit|flask|fastapi|django|tkinter|pyside|pyqt)\b/.test(text)) return "python";
  if (/\b(?:react|vite|tsx|frontend react|react frontend|typescript frontend)\b/.test(text)) return "react_vite";
  if (/\b(?:next\.js|nextjs|next app)\b/.test(text)) return "next";
  if (/\b(?:node|express|nestjs)\b/.test(text)) return "node";
  return "unknown";
}

function featureMatches(prompt: string) {
  const text = normalizeText(prompt);
  const features: Record<string, string[]> = {
    activity: ["activity", "feed", "timeline"],
    billing: ["billing", "invoice", "invoices", "payment", "cost"],
    cash_flow: ["cash in", "cash out", "cashflow", "cash flow"],
    customers: ["customers", "clients", "contacts"],
    dashboard: ["dashboard", "metrics", "graphical", "charts", "graphs", "stats"],
    low_stock_alerts: ["low stock", "reorder", "alerts"],
    pipeline: ["pipeline", "deals", "sales"],
    products: ["products", "inventory", "stock"],
    purchases: ["purchase", "purchases", "purchase records"],
    reports: ["reports", "graphs", "stats", "analytics"],
    repairs: ["repairs", "tickets", "service counter"],
    sales: ["sales", "orders", "checkout"],
    stock: ["stock", "quantity", "reorder"],
    suppliers: ["supplier", "suppliers", "vendor", "lead time"]
  };

  return Object.entries(features)
    .filter(([, terms]) => terms.some((term) => text.includes(term)))
    .map(([feature]) => feature);
}

export function buildCodeIntentContract(input: {
  prompt: string;
}): CodeIntentContract {
  const classification = classifyDomainIntent(input.prompt);
  const text = normalizeText(input.prompt);
  const isCrm = /\bcrm\b|customer relationship|sales pipeline/.test(text);
  const isInventory = /\b(?:inventory|inventory management|inventory system|stock|products|sales|supplier|suppliers|billing|cash in|cash out|purchase records?|low stock|repair tickets?|service tickets?)\b/.test(text);
  const stack = requestedStack(input.prompt);
  const requestedFeatures = featureMatches(input.prompt);
  const domainProfile = isCrm ? getTaxonomyProfile("crm_software") : classification.profile;
  const isMobilePhoneInventory = !isCrm && isInventory && domainProfile?.id === "mobile_phone_shop";
  const isGenericInventory = !isCrm && isInventory && !isMobilePhoneInventory;
  const modules = unique([
    ...(isCrm ? ["dashboard", "customers", "pipeline", "billing", "activity"] : []),
    ...(isMobilePhoneInventory ? ["dashboard", "products", "stock", "sales", "suppliers", "repairs", "billing"] : []),
    ...(isGenericInventory ? ["dashboard", "products", "stock", "low_stock_alerts", "billing", "cash_flow", "sales", "purchases", "reports"] : []),
    ...requestedFeatures,
    ...(domainProfile?.codeHints.possibleApps.length && !isCrm ? ["dashboard"] : [])
  ]);
  const entities = unique(isCrm
    ? ["customer", "deal", "invoice", "activity"]
    : isMobilePhoneInventory
      ? ["product", "brand", "stock", "supplier", "sale", "repairTicket", "invoice"]
      : isGenericInventory
        ? ["product", "SKU", "stock level", "low stock alert", "invoice", "sale", "purchase", "supplier", "cash movement"]
      : domainProfile?.codeHints.entities ?? []);
  const selectedFramework = stack === "python" || (stack === "unknown" && isMobilePhoneInventory)
    ? "streamlit"
    : stack === "react_vite" || isCrm
      ? "react_vite"
      : "unknown";

  return {
    appType: isCrm ? "crm" : isMobilePhoneInventory || isGenericInventory ? "inventory_system" : domainProfile?.id ?? "custom_app",
    assumptionNotes: [
      ...classification.assumptionNotes,
      ...(isMobilePhoneInventory && stack === "unknown"
        ? ["No implementation stack was specified; Hassali selected Python / Streamlit for a low-spec inventory dashboard scaffold."]
        : [])
    ],
    confidence: isCrm ? 0.94 : isGenericInventory ? 0.9 : classification.confidence,
    correctedTypos: classification.correctedTypos,
    dataModelHints: entities,
    domainId: isCrm ? "crm_software" : classification.domainId,
    entities,
    forbiddenStacks: stack === "python" ? ["react_vite", "next"] : [],
    mode: "CODE",
    modules: modules.length ? modules : ["dashboard"],
    normalizedPrompt: classification.normalizedPrompt,
    originalPrompt: input.prompt,
    preferredFramework: selectedFramework,
    previewStrategy: selectedFramework === "streamlit"
      ? "python_streamlit_summary_until_runtime_enabled"
      : selectedFramework === "react_vite"
        ? "react_vite_css_summary_until_runtime_enabled"
        : "code_source_summary",
    requestedFeatures,
    requestedStack: stack,
    runtimeExpectations: selectedFramework === "streamlit"
      ? ["Do not install packages automatically.", "Do not start Streamlit automatically.", "Use summary preview unless approved runtime is running."]
      : ["Runtime starts only after explicit approval."],
    screens: modules.length ? modules : ["dashboard"]
  };
}
