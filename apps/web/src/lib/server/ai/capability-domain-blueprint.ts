export type CapabilityPath =
  | "business_website"
  | "data_tool"
  | "desktop_app"
  | "email_automation"
  | "hardware_iot"
  | "invoice_document"
  | "mobile_app"
  | "web_app";

export type DomainBlueprint = {
  audience: string[];
  ambiguity: {
    alternatives: string[];
    isAmbiguous: boolean;
    note: string | null;
  };
  brandFallback: string;
  businessGoals: string[];
  capabilityPath: CapabilityPath;
  contentTerms: string[];
  ctaStrategy: string[];
  domainLabel: string;
  forbiddenTerms: string[];
  imageQueries: string[];
  industry: string;
  modules: string[];
  productCategory: string;
  reason: string;
  sections: string[];
  stack: string[];
  validationTerms: string[];
  visualMood: string[];
};

type BlueprintInput = {
  prompt: string;
};

const genericDeveloperTerms = [
  "api",
  "build faster",
  "code editor",
  "coding",
  "developer",
  "devtools",
  "engineering workflow",
  "programming",
  "repository",
  "terminal"
];
const genericFillerTerms = [
  "business offers",
  "clear offer",
  "customer outcomes",
  "detected 6-page",
  "domain-specific positioning",
  "hero for business",
  "local service",
  "offers, services, proof",
  "page hero",
  "shaped around",
  "specific offer clarity studio",
  "trust / trust",
  "trust proof"
];
const stopWords = new Set([
  "about",
  "and",
  "app",
  "beautiful",
  "build",
  "business",
  "colors",
  "company",
  "contact",
  "create",
  "for",
  "home",
  "make",
  "need",
  "page",
  "pages",
  "services",
  "site",
  "theme",
  "using",
  "website",
  "with"
]);

function lower(value: string) {
  return value.toLowerCase();
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function titleCase(value: string) {
  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function promptTerms(value: string) {
  return unique(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !stopWords.has(term))
  ).slice(0, 10);
}

function detectCapability(promptText: string): CapabilityPath {
  if (/\binvoice\b/.test(promptText)) {
    return "invoice_document";
  }

  if (includesAny(promptText, ["csv merger", "merge csv", "csv tool", "data cleaner", "spreadsheet tool"])) {
    return "data_tool";
  }

  if (includesAny(promptText, ["email sender", "email automation", "send emails", "mail campaign"])) {
    return "email_automation";
  }

  if (includesAny(promptText, ["inventory system", "crm", "erp", "pos", "dashboard app", "management system"])) {
    return "web_app";
  }

  if (includesAny(promptText, ["desktop app", "windows app", "local app"])) {
    return "desktop_app";
  }

  if (includesAny(promptText, ["mobile app", "android app", "ios app"])) {
    return "mobile_app";
  }

  if (includesAny(promptText, ["iot", "arduino", "sensor", "hardware"])) {
    return "hardware_iot";
  }

  return "business_website";
}

function extractBusinessPhrase(prompt: string) {
  const patterns = [
    /\b(?:for|of)\s+(?:my\s+|a\s+|an\s+)?([a-z0-9][a-z0-9&' -]{2,70}?)(?:\s+(?:business|company|brand|shop|store|clinic|school|factory|website|site|app|system))?(?=\s+(?:with|and|using|that|which|in|it|should|as|name|named|called)\b|[,.!?]|$)/i,
    /\b([a-z0-9][a-z0-9&' -]{2,70}?)\s+(?:business|company|brand|shop|store|clinic|school|factory|crm|erp|pos|website|site|app|system)\b/i
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    const value = match?.[1]?.trim();

    if (value && !includesAny(lower(value), ["website", "site", "landing page", "web app"])) {
      return value.replace(/\s+/g, " ");
    }
  }

  return null;
}

function classifyIndustry(promptText: string, businessPhrase: string | null) {
  const text = `${promptText} ${lower(businessPhrase ?? "")}`;
  const taxonomy = classifyDomainIntent(text);

  if (taxonomy.profile && taxonomy.confidence >= 0.58) {
    return {
      industry: taxonomy.profile.relatedIndustries[0] ?? taxonomy.profile.displayName.toLowerCase(),
      label: taxonomy.profile.id,
      productCategory: taxonomy.profile.websiteVocabulary.join(", "),
      terms: taxonomy.profile.aliases
    };
  }

  if (taxonomy.ambiguous) {
    return {
      industry: "ambiguous bike retail and service",
      label: "bike shop",
      productCategory: "bicycle or motorcycle retail/service; clarification recommended",
      terms: taxonomy.detectedAliases
    };
  }

  const rules: Array<{
    industry: string;
    label: string;
    productCategory: string;
    terms: string[];
  }> = [
    {
      industry: "electronics retail and home cinema",
      label: "television shop",
      productCategory: "smart TVs, OLED/QLED/LED displays, screen sizes, home cinema, wall mounting, installation, warranty",
      terms: ["television", "tv", "smart tv", "lcd", "oled", "qled", "led", "display", "home cinema", "soundbar", "wall mounting", "warranty"]
    },
    {
      industry: "mobile phone retail and repair",
      label: "mobile phone shop",
      productCategory: "smartphones, iPhone, Samsung, Android phones, phone accessories, cases, chargers, screen protectors, unlocked phones, trade-ins, installment plans, warranty, repairs, device setup",
      terms: [
        "mobile phone shop",
        "phone shop",
        "smartphone store",
        "mobile store",
        "cellphone shop",
        "phone retail",
        "phone accessories",
        "iphone shop",
        "samsung phone shop",
        "android phone shop",
        "unlocked phones",
        "phone repair shop"
      ]
    },
    {
      industry: "motorcycle retail and service",
      label: "motorbike shop",
      productCategory: "motorcycles, helmets, rider gear, spare parts, engine service, oil change, test rides",
      terms: ["motorbike", "motorcycle", "motor bike", "helmet", "engine service", "oil change", "spare parts", "test ride", "riding gear"]
    },
    {
      industry: "ambiguous bike retail and service",
      label: "bike shop",
      productCategory: "bikes, rider gear, showroom support, parts, service booking, safety guidance",
      terms: ["bike shop", "bike business", "bike website", "bike site"]
    },
    {
      industry: "automotive rental and booking",
      label: "car rental",
      productCategory: "rental cars, vehicle fleet, economy cars, SUVs, luxury vehicles, pickup and dropoff, airport rentals, insurance, drivers, booking, reservations, mileage, transparent pricing",
      terms: ["car rental", "rent a car", "rent-a-car", "vehicle rental", "car hire", "rental cars", "auto rental", "fleet rental", "airport rentals"]
    },
    {
      industry: "cycling retail and service",
      label: "bicycle",
      productCategory: "bikes, cycling accessories, tune-ups, repairs, rentals, rider fitting",
      terms: ["bicycle", "bicycles", "cycling", "cycle", "cyclist", "commuter bike", "pedal", "tune-up", "rider fitting", "bike rental", "bicycle rental"]
    },
    {
      industry: "frozen dessert and local food retail",
      label: "ice cream",
      productCategory: "scoops, cones, sundaes, shakes, seasonal flavors",
      terms: ["ice cream", "icecream", "ice site", "ice business", "gelato", "scoop", "sundae", "frozen dessert", "kulfi"]
    },
    {
      industry: "beverage and distribution",
      label: "cola company",
      productCategory: "soft drinks, campaigns, distributors, retailers",
      terms: ["cola", "soft drink", "beverage", "soda", "drink company"]
    },
    {
      industry: "healthcare clinic",
      label: "dentist clinic",
      productCategory: "dental services, appointments, doctors, hygiene care",
      terms: ["dentist", "dental", "orthodontic", "clinic"]
    },
    {
      industry: "education operations",
      label: "school ERP",
      productCategory: "students, classes, fees, attendance, reports",
      terms: ["school erp", "school management", "student management", "attendance"]
    },
    {
      industry: "operations software",
      label: "inventory system",
      productCategory: "stock, suppliers, sales, purchase orders, reports",
      terms: ["inventory", "stock", "warehouse", "factory inventory"]
    },
    {
      industry: "customer relationship management software",
      label: "CRM system",
      productCategory: "customers, leads, pipeline, auth, database, dashboard, billing, reports",
      terms: ["crm", "customer relationship", "lead pipeline", "sales pipeline", "customer records", "billing", "auth", "database"]
    },
    {
      industry: "coffee hospitality and cafe retail",
      label: "coffee shop",
      productCategory: "espresso, latte, cold brew, signature drinks, pastries, pickup, cafe seating",
      terms: ["coffee", "coffee shop", "cafe", "café", "espresso", "latte", "cold brew", "barista", "roastery"]
    },
    {
      industry: "real estate operations",
      label: "real estate",
      productCategory: "properties, agents, locations, leads, viewings",
      terms: ["real estate", "property", "realtor", "houses", "apartments"]
    },
    {
      industry: "fitness and wellness",
      label: "gym",
      productCategory: "classes, trainers, memberships, schedules",
      terms: ["gym", "fitness", "workout", "trainer"]
    },
    {
      industry: "tailoring and local services",
      label: "tailor shop",
      productCategory: "alterations, custom stitching, fabric, measurements",
      terms: ["tailor", "tailoring", "stitching", "alteration"]
    },
    {
      industry: "healthcare retail",
      label: "pharmacy",
      productCategory: "medicines, prescriptions, delivery, health essentials",
      terms: ["pharmacy", "medicine", "prescription", "drugstore"]
    },
    {
      industry: "restaurant operations",
      label: "restaurant POS",
      productCategory: "orders, tables, menu, kitchen, billing",
      terms: ["restaurant pos", "pos system", "restaurant app"]
    },
    {
      industry: "local data tooling",
      label: "csv merger",
      productCategory: "CSV files, headers, merge log, skipped files, output destination",
      terms: ["csv", "merge csv", "csv merger", "headers", "output file", "skipped files"]
    },
    {
      industry: "creator media",
      label: "podcast",
      productCategory: "episodes, hosts, sponsors, subscribers",
      terms: ["youtube podcast", "podcast", "creator", "media brand"]
    },
    {
      industry: "beauty and skincare",
      label: "beauty/skincare",
      productCategory: "cream, glow, skincare routine, ingredients",
      terms: ["beauty", "skincare", "skin care", "beauty cream", "cosmetic"]
    },
    {
      industry: "fragrance retail and gifting",
      label: "perfume shop",
      productCategory: "fragrance, scent notes, oud, floral, citrus, musk, perfume bottles, testers, gifting, luxury collections",
      terms: ["perfume", "fragrance", "scent", "oud", "musk", "cologne", "attar", "perfume shop", "fragrance shop"]
    },
    {
      industry: "seafood commerce",
      label: "seafood",
      productCategory: "fresh fish, daily catch, delivery, sourcing",
      terms: ["fish", "seafood", "fresh catch"]
    },
    {
      industry: "bakery and hospitality",
      label: "bakery",
      productCategory: "bread, cakes, pastries, custom orders",
      terms: ["bakery", "bread", "pastry", "cake"]
    },
    {
      industry: "floral service and gifting",
      label: "florist",
      productCategory: "bouquets, flowers, events, delivery",
      terms: ["florist", "flower", "bouquet"]
    },
    {
      industry: "automotive retail",
      label: "car showroom",
      productCategory: "vehicles, test drives, financing, showroom visits",
      terms: ["car showroom", "dealership", "test drive", "vehicle showroom"]
    },
    {
      industry: "technical software",
      label: "code/tooling",
      productCategory: "developer workflows, coding tools, repositories",
      terms: ["developer tool", "coding", "chatgpt clone", "ai tool", "code editor", "programming"]
    }
  ];
  const matched = rules.find((rule) => includesAny(text, rule.terms));

  if (matched) {
    return matched;
  }

  const inferred = businessPhrase?.replace(/\b(?:my|a|an|the)\b/gi, "").trim() || "local service";
  const terms = promptTerms(`${promptText} ${inferred}`);
  const primaryTerms = terms.length ? terms : [lower(inferred)];

  return {
    industry: `${inferred} industry`,
    label: lower(inferred),
    productCategory: `${primaryTerms.slice(0, 4).join(", ")} offers, customer needs, service details, booking/contact`,
    terms: primaryTerms
  };
}

function pagesForBlueprint(capabilityPath: CapabilityPath, label: string) {
  if (capabilityPath === "web_app") {
    return ["dashboard", "records", "reports", "settings"];
  }

  if (capabilityPath === "data_tool") {
    return ["workspace", "input", "results", "logs"];
  }

  if (label.includes("podcast")) {
    return ["home", "episodes", "about", "services", "contact"];
  }

  if (label.includes("inventory")) {
    return ["dashboard", "products", "suppliers", "reports"];
  }

  if (label.includes("crm")) {
    return ["dashboard", "customers", "pipeline", "billing", "settings"];
  }

  if (label.includes("coffee")) {
    return ["home", "menu", "about", "locations", "contact"];
  }

  if (label.includes("dentist")) {
    return ["home", "services", "about", "blog", "contact"];
  }

  if (label.includes("ice cream")) {
    return ["home", "flavors", "catering", "about", "contact"];
  }

  if (label.includes("perfume")) {
    return ["home", "about", "services", "blog", "contact", "story"];
  }

  if (label.includes("television")) {
    return ["home", "services", "about", "blog", "contact"];
  }

  if (label.includes("motorbike")) {
    return ["home", "services", "bikes", "about", "contact"];
  }

  if (label === "bike shop") {
    return ["home", "services", "bikes", "about", "contact"];
  }

  if (label.includes("bicycle")) {
    return ["home", "services", "about", "blog", "contact"];
  }

  if (label.includes("cola")) {
    return ["home", "products", "distributors", "about", "contact"];
  }

  return ["home", "services", "about", "gallery", "contact"];
}

function sectionsForBlueprint(label: string, productCategory: string, capabilityPath: CapabilityPath) {
  if (capabilityPath === "web_app") {
    return ["overview dashboard", "records table", "quick actions", "reports", "activity log"];
  }

  if (capabilityPath === "data_tool") {
    return ["file picker", "merge settings", "processing log", "output summary"];
  }

  if (label.includes("ice cream")) {
    return ["hero", "signature flavors", "scoops and cones", "seasonal specials", "catering", "store visit CTA"];
  }

  if (label.includes("perfume")) {
    return ["hero", "signature scent collections", "fragrance notes", "bottle and tester experience", "gifting sets", "scent consultation CTA"];
  }

  if (label.includes("television")) {
    return ["hero", "smart TV showroom", "OLED QLED LED comparison", "home cinema setup", "wall mounting installation", "warranty support CTA"];
  }

  if (label.includes("motorbike")) {
    return ["hero", "motorcycle showroom", "engine service", "helmets and rider gear", "spare parts", "test ride CTA"];
  }

  if (label === "bike shop") {
    return ["hero", "bike showroom", "service and parts", "rider safety gear", "test rides or fittings", "booking CTA"];
  }

  if (label.includes("bicycle")) {
    return ["hero", "bike lineup", "repair tune-ups", "accessories and fitting", "city rides community", "service booking CTA"];
  }

  if (label.includes("cola")) {
    return ["hero", "product lineup", "retailer/distributor network", "campaigns", "logistics", "contact CTA"];
  }

  if (label.includes("coffee")) {
    return ["hero", "signature drinks", "menu highlights", "pastries and food", "pickup and ordering", "location hours CTA"];
  }

  if (label.includes("dentist")) {
    return ["hero", "dental services", "doctors", "appointment CTA", "hygiene trust", "clinic location"];
  }

  return [
    "hero",
    `${productCategory.split(",")[0] ?? label} highlights`,
    `${label} services`,
    "customer trust",
    "booking CTA",
    "contact"
  ];
}

function ambiguityForLabel(label: string) {
  if (label === "bike shop") {
    return {
      alternatives: ["bicycle shop", "motorbike shop"],
      isAmbiguous: true,
      note: "The word bike can mean bicycle or motorbike. Use balanced rider/service/showroom language unless the user clarifies."
    };
  }

  return {
    alternatives: [],
    isAmbiguous: false,
    note: null
  };
}

function brandFallbackForLabel(label: string) {
  if (label.includes("television")) {
    return "Vision House";
  }

  if (label.includes("motorbike")) {
    return "Rider Garage";
  }

  if (label === "bike shop") {
    return "Bike House";
  }

  if (label.includes("bicycle")) {
    return "Cycling House";
  }

  if (label.includes("cola")) {
    return "Crimson Cola";
  }

  if (label.includes("ice cream")) {
    return "Scoop House";
  }

  if (label.includes("coffee")) {
    return "North Roast";
  }

  if (label.includes("dentist")) {
    return "North Dental";
  }

  if (label.includes("crm")) {
    return "CustomerOS";
  }

  if (label.includes("perfume")) {
    return "Scent Atelier";
  }

  return `${titleCase(label)} Studio`;
}

export function buildDomainBlueprint(input: BlueprintInput): DomainBlueprint {
  const promptText = lower(input.prompt);
  const capabilityPath = detectCapability(promptText);
  const businessPhrase = extractBusinessPhrase(input.prompt);
  const classified = classifyIndustry(promptText, businessPhrase);
  const domainLabel = classified.label;
  const productTerms = unique([
    ...classified.productCategory.split(/[\s,]+/),
    ...classified.terms
  ]).filter((term) => term.length > 2);
  const pages = pagesForBlueprint(capabilityPath, domainLabel);
  const sections = sectionsForBlueprint(domainLabel, classified.productCategory, capabilityPath);

  return {
    audience:
      capabilityPath === "web_app"
        ? ["operators", "staff", "owners", "managers"]
        : domainLabel.includes("television")
          ? ["home cinema buyers", "families", "showroom visitors", "installation customers"]
        : domainLabel.includes("dentist")
          ? ["families", "new patients", "cosmetic dental patients", "hygiene appointment seekers"]
        : domainLabel.includes("perfume")
            ? ["fragrance lovers", "gift buyers", "luxury shoppers", "scent explorers"]
          : domainLabel.includes("coffee")
            ? ["local coffee drinkers", "office workers", "weekend visitors", "pickup customers"]
          : domainLabel.includes("motorbike")
            ? ["riders", "commuters", "touring customers", "service customers"]
          : domainLabel === "bike shop"
            ? ["riders", "commuters", "families", "service customers"]
        : domainLabel.includes("bicycle")
          ? ["commuters", "weekend riders", "cycling families", "repair customers"]
          : domainLabel.includes("cola")
            ? ["retailers", "distributors", "local shoppers", "campaign partners"]
            : ["customers", "local buyers", "visitors", "prospects"],
    businessGoals:
      capabilityPath === "web_app"
        ? ["reduce manual work", "track records accurately", "make daily operations visible"]
        : domainLabel.includes("television")
          ? ["product comparison", "showroom visits", "installation bookings", "warranty confidence"]
        : domainLabel.includes("dentist")
          ? ["appointment bookings", "patient trust", "treatment clarity", "family care confidence"]
        : domainLabel.includes("perfume")
            ? ["signature scent discovery", "gift conversion", "collection trust", "consultation bookings"]
          : domainLabel.includes("coffee")
            ? ["menu discovery", "shop visits", "pickup orders", "community loyalty"]
          : domainLabel.includes("motorbike")
            ? ["bike sales", "service bookings", "rider gear sales", "test ride leads"]
          : domainLabel === "bike shop"
            ? ["rider confidence", "service bookings", "showroom visits", "parts and gear discovery"]
        : domainLabel.includes("bicycle")
          ? ["service bookings", "bike sales", "rider confidence", "community trust"]
          : domainLabel.includes("cola")
            ? ["product discovery", "retailer inquiries", "distribution leads", "campaign awareness"]
            : ["clear services", "conversion", "customer confidence", "practical domain details"],
    capabilityPath,
    ambiguity: ambiguityForLabel(domainLabel),
    brandFallback: brandFallbackForLabel(domainLabel),
    contentTerms: productTerms,
    ctaStrategy:
      capabilityPath === "web_app"
        ? ["Open dashboard", "Add record", "View reports"]
        : domainLabel.includes("ice cream")
          ? ["Explore flavors", "Visit the shop", "Book catering"]
        : domainLabel.includes("television")
            ? ["Compare TVs", "Book installation", "Visit showroom"]
          : domainLabel.includes("dentist")
            ? ["Book an appointment", "Meet the dentists", "Explore treatments"]
          : domainLabel.includes("coffee")
            ? ["View the menu", "Order pickup", "Visit the cafe"]
          : domainLabel.includes("perfume")
            ? ["Explore scents", "Find your signature", "Book a scent consultation"]
          : domainLabel.includes("motorbike")
            ? ["Book engine service", "Explore motorcycles", "Schedule a test ride"]
          : domainLabel === "bike shop"
            ? ["Explore bikes", "Book service", "Ask for fit guidance"]
          : domainLabel.includes("bicycle")
            ? ["Book a tune-up", "Explore bikes", "Find your ride"]
            : domainLabel.includes("cola")
              ? ["Explore drinks", "Become a distributor", "Contact sales"]
              : ["Explore services", "Book a call", "Contact us"],
    domainLabel,
    forbiddenTerms:
      classified.label === "code/tooling" ? genericFillerTerms : [...genericDeveloperTerms, ...genericFillerTerms],
    imageQueries: unique([
      domainLabel,
      classified.productCategory,
      classified.industry,
      ...productTerms.slice(0, 4)
    ]),
    industry: classified.industry,
    modules:
      capabilityPath === "web_app"
        ? pages
        : sections,
    productCategory: classified.productCategory,
    reason: `Capability=${capabilityPath}; domain=${domainLabel}; product=${classified.productCategory}; prompt terms=${productTerms.slice(0, 8).join(", ")}.`,
    sections,
    stack:
      capabilityPath === "data_tool"
        ? ["Python", "Tkinter or lightweight local UI", "CSV parser", "single-file MVP"]
        : capabilityPath === "desktop_app"
          ? ["Python", "Tkinter", "local file handling"]
          : capabilityPath === "business_website"
        ? ["static HTML", "CSS", "light JavaScript"]
        : ["static MVP UI", "CSS", "light JavaScript"],
    validationTerms: unique([domainLabel, ...productTerms]).filter((term) => term.length > 2),
    visualMood:
      domainLabel.includes("ice cream")
        ? ["playful premium", "creamy", "bright", "family-friendly"]
        : domainLabel.includes("coffee")
          ? ["warm editorial", "premium cafe", "inviting", "crafted"]
        : domainLabel.includes("dentist")
          ? ["calm clinical", "modern care", "trust-led", "clean"]
        : domainLabel.includes("perfume")
          ? ["luxury editorial", "sensory", "soft glass", "gift-ready"]
        : domainLabel.includes("television")
          ? ["cinematic", "tactical glass", "showroom-grade", "high contrast"]
        : domainLabel.includes("motorbike") || domainLabel === "bike shop"
          ? ["tactical", "showroom", "rider-focused", "high contrast"]
        : capabilityPath === "web_app"
          ? ["clear", "operational", "low-clutter"]
          : ["domain-specific", "premium", "calm"]
  };
}

export function isTechnicalBlueprint(blueprint: DomainBlueprint) {
  return (
    blueprint.domainLabel.includes("code") ||
    blueprint.domainLabel.includes("tooling") ||
    blueprint.capabilityPath === "data_tool" ||
    blueprint.capabilityPath === "email_automation"
  );
}

export function domainTitle(blueprint: DomainBlueprint) {
  return titleCase(blueprint.domainLabel || blueprint.industry || "Business");
}
import { classifyDomainIntent } from "@/lib/server/ai/industry-taxonomy";
