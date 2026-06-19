export type WebsiteIndustry =
  | "ai_product"
  | "beverage"
  | "ecommerce"
  | "healthcare"
  | "marketplace"
  | "portfolio"
  | "real_estate"
  | "restaurant"
  | "saas";

export type WebsiteLayoutType =
  | "app_product_story"
  | "beverage_brand"
  | "catalog_commerce"
  | "clinical_trust"
  | "creator_case_study"
  | "marketplace_discovery"
  | "property_showcase"
  | "saas_conversion"
  | "table_to_order";

export type WebsiteSectionDefinition = {
  contentAngle: string;
  id: string;
  intent: string;
  optional?: boolean;
  title: string;
  visualIntent: string;
};

export type WebsiteIndustryProfile = {
  audience: string;
  contentStrategy: string[];
  goal: string;
  industry: WebsiteIndustry;
  layoutType: WebsiteLayoutType;
  optionalSections: WebsiteSectionDefinition[];
  requiredSections: WebsiteSectionDefinition[];
  visualStrategy: string;
};

const profiles: Record<WebsiteIndustry, WebsiteIndustryProfile> = {
  ai_product: {
    audience: "founders, operators, builders, and teams evaluating an AI product",
    contentStrategy: ["show the product promise quickly", "explain workflow", "make trust and control visible"],
    goal: "convert interested builders into product trials or demos",
    industry: "ai_product",
    layoutType: "app_product_story",
    optionalSections: [
      section("model-control", "Model and Control Layer", "Explain routing, privacy, and review-first control.", "stacked control cards"),
      section("use-cases", "Builder Use Cases", "Show specific workflows for real users.", "scenario strips", true)
    ],
    requiredSections: [
      section("product-hero", "AI Product Command Surface", "Introduce the product, user outcome, and primary action.", "product interface glass"),
      section("workflow", "Prompt to Reviewed Output", "Show how an idea becomes a structured result.", "step timeline"),
      section("capabilities", "Core Capabilities", "Name the product abilities without generic feature filler.", "capability panels"),
      section("evidence", "Trust and Safety Evidence", "Show control, validation, and user review.", "kernel evidence cards"),
      section("cta", "Start Building", "Close with one decisive next action.", "focused CTA band")
    ],
    visualStrategy: "interface-forward dark panels, signal glows, kernel evidence, no random stock images"
  },
  ecommerce: {
    audience: "online shoppers comparing products, categories, delivery, and support",
    contentStrategy: ["lead with product categories", "surface trust and delivery", "make discovery easy"],
    goal: "help shoppers explore the range and purchase confidently",
    industry: "ecommerce",
    layoutType: "catalog_commerce",
    optionalSections: [
      section("bundles", "Bundles and Add-ons", "Encourage combinations and higher-value baskets.", "bundle shelf", true),
      section("support", "Delivery and Support", "Explain delivery, returns, and support.", "service badges", true)
    ],
    requiredSections: [
      section("shop-hero", "Featured Range", "Present the range and why it matters.", "range showcase"),
      section("categories", "Collection Paths", "Organize items into clear buying paths.", "collection grid"),
      section("featured-products", "Featured Lineup", "Highlight specific items or collections.", "lineup highlights"),
      section("trust", "Delivery, Warranty, and Payment Clarity", "Reduce buying anxiety.", "confidence row"),
      section("contact", "Store Support", "Make support and contact obvious.", "contact panel")
    ],
    visualStrategy: "curated range visuals, collection shelves, delivery confidence, stable local assets"
  },
  beverage: {
    audience: "retailers, distributors, campaign partners, and cola fans",
    contentStrategy: ["lead with flavor and chill", "show lineup and campaigns", "make retail/distribution contact easy"],
    goal: "grow cola brand demand and distribution partner inquiries",
    industry: "beverage",
    layoutType: "beverage_brand",
    optionalSections: [
      section("campaigns", "Campaign Launches", "Show regional launches and seasonal moments.", "campaign bottles", true),
      section("distribution", "Distribution Network", "Explain retailer and distributor paths.", "route map", true)
    ],
    requiredSections: [
      section("beverage-hero", "Bold Cola Flavor, Chilled and Ready", "Lead with cold cola flavor, sparkling bottles, and shelf-ready cans.", "chilled cola cans"),
      section("lineup", "Featured Cola Lineup", "Show flagship cans, sparkling bottles, and flavors for every shelf.", "cola flavor lineup"),
      section("retail", "Retailer and Distributor Inquiries", "Invite partners to discuss campaign launches and regional distribution.", "retailer inquiry path"),
      section("proof", "Trusted by Retailers Across 12 Regions", "Build confidence with distribution proof and campaign reliability.", "regional retail proof"),
      section("contact", "Become a Distribution Partner", "Close with a clear contact path for retail, distributor, and campaign partnerships.", "partner contact form")
    ],
    visualStrategy: "chilled cola cans, sparkling bottle shapes, campaign shelves, retailer distribution cues"
  },
  healthcare: {
    audience: "patients and families looking for calm, trustworthy care",
    contentStrategy: ["lead with appointment trust", "explain services clearly", "humanize care team"],
    goal: "increase appointment requests and patient confidence",
    industry: "healthcare",
    layoutType: "clinical_trust",
    optionalSections: [
      section("insurance", "Insurance and Payment Information", "Clarify payment support.", "document cards", true),
      section("emergency", "Urgent Care Guidance", "Guide urgent visitors safely.", "alert panel", true)
    ],
    requiredSections: [
      section("clinic-hero", "Care-Focused Hero", "State care promise and appointment path.", "clinic glass panel"),
      section("services", "Treatments and Services", "List care categories in human language.", "service cards"),
      section("team", "Doctors and Care Team", "Build trust through team presentation.", "team cards"),
      section("booking", "Appointment Booking", "Make the appointment path visible.", "booking panel"),
      section("trust-safety", "Hygiene, Safety, and Patient Trust", "Explain safety and reviews.", "trust checklist"),
      section("location", "Location and Contact", "Make hours and contact easy.", "map-style panel")
    ],
    visualStrategy: "calm clinic surfaces, team cards, appointment panels, safety badges"
  },
  marketplace: {
    audience: "buyers, sellers, and operators comparing marketplace value",
    contentStrategy: ["explain both sides of the marketplace", "show discovery", "show trust and payments"],
    goal: "drive marketplace signups and supply/demand confidence",
    industry: "marketplace",
    layoutType: "marketplace_discovery",
    optionalSections: [
      section("categories", "Popular Categories", "Show marketplace breadth.", "category orbit", true),
      section("seller-tools", "Seller Tools", "Explain seller onboarding and management.", "seller dashboard cards", true)
    ],
    requiredSections: [
      section("market-hero", "Two-Sided Marketplace Hero", "Explain buyer and seller value.", "split marketplace cards"),
      section("discovery", "Browse and Discover", "Show how users find offers.", "listing grid"),
      section("seller-onboarding", "List and Sell", "Explain seller flow.", "seller steps"),
      section("trust-payments", "Trust, Payments, and Reviews", "Show transaction safety.", "trust rails"),
      section("cta", "Join the Marketplace", "Offer buyer and seller actions.", "dual CTA")
    ],
    visualStrategy: "listing cards, seller/buyer split, trust rails, controlled commerce accents"
  },
  portfolio: {
    audience: "clients, recruiters, collaborators, and creative directors",
    contentStrategy: ["lead with identity", "show selected work", "make contact easy"],
    goal: "turn portfolio visitors into inquiries",
    industry: "portfolio",
    layoutType: "creator_case_study",
    optionalSections: [
      section("process", "Process", "Explain how work happens.", "process notes", true),
      section("press", "Recognition", "Show notable proof.", "quote rail", true)
    ],
    requiredSections: [
      section("identity-hero", "Creator Identity", "State craft, role, and point of view.", "editorial title block"),
      section("selected-work", "Selected Work", "Show project range.", "case study cards"),
      section("services", "Services or Expertise", "Clarify how to hire or collaborate.", "expertise grid"),
      section("about", "About the Studio", "Give human context.", "bio panel"),
      section("contact", "Contact and Availability", "Make inquiry simple.", "availability CTA")
    ],
    visualStrategy: "editorial project cards, large type, case-study rhythm, no generic SaaS blocks"
  },
  real_estate: {
    audience: "buyers, renters, sellers, and investors evaluating property options",
    contentStrategy: ["show property inventory", "explain locations", "build agent trust"],
    goal: "generate property inquiries and viewings",
    industry: "real_estate",
    layoutType: "property_showcase",
    optionalSections: [
      section("neighborhoods", "Neighborhood Guides", "Explain locations and lifestyle.", "location cards", true),
      section("valuation", "Sell or Value a Property", "Capture seller leads.", "valuation CTA", true)
    ],
    requiredSections: [
      section("property-hero", "Property Search Hero", "Lead with location and property promise.", "property search panel"),
      section("featured-listings", "Featured Listings", "Show representative property cards.", "listing cards"),
      section("neighborhood-proof", "Neighborhood and Lifestyle", "Make locations feel tangible.", "area cards"),
      section("agent-trust", "Agent Trust", "Show expertise and reviews.", "agent profile cards"),
      section("viewing", "Book a Viewing", "Turn interest into appointment.", "viewing CTA")
    ],
    visualStrategy: "listing cards, map-style surfaces, property specs, neighborhood panels"
  },
  restaurant: {
    audience: "local diners, families, food lovers, and delivery customers",
    contentStrategy: ["lead with menu and order path", "show popular dishes", "make hours/contact obvious"],
    goal: "drive reservations, pickup, delivery, and calls",
    industry: "restaurant",
    layoutType: "table_to_order",
    optionalSections: [
      section("reservations", "Reservations", "Help visitors book tables.", "reservation panel", true),
      section("catering", "Catering and Events", "Show group/order options.", "event platter cards", true)
    ],
    requiredSections: [
      section("food-hero", "Signature Menu Hero", "Make the cuisine and order path clear.", "dish spotlight"),
      section("menu-categories", "Menu Categories", "Organize food paths.", "menu tabs"),
      section("popular-items", "Popular Orders", "Show high-demand dishes.", "dish cards"),
      section("pickup-delivery", "Pickup, Delivery, and Payment", "Clarify ordering logistics.", "order status cards"),
      section("location-hours", "Location and Hours", "Make contact and visit details obvious.", "hours panel")
    ],
    visualStrategy: "menu cards, dish-style visual blocks, order flow, payment trust badges"
  },
  saas: {
    audience: "teams, operators, and decision-makers evaluating software",
    contentStrategy: ["show problem and workflow", "explain product modules", "surface proof and pricing path"],
    goal: "drive signups, demos, or product evaluation",
    industry: "saas",
    layoutType: "saas_conversion",
    optionalSections: [
      section("pricing", "Plans and Pricing Path", "Help buyers understand commitment.", "pricing comparison", true),
      section("integrations", "Integrations", "Show ecosystem fit.", "integration grid", true)
    ],
    requiredSections: [
      section("saas-hero", "Outcome-Led SaaS Hero", "State software outcome and primary CTA.", "product dashboard frame"),
      section("workflow", "How the Product Works", "Explain steps and user flow.", "workflow cards"),
      section("modules", "Product Modules", "Show app capabilities without generic filler.", "module cards"),
      section("proof", "Proof and Reliability", "Show security, uptime, or customer proof.", "proof strip"),
      section("demo-cta", "Book a Demo or Start Trial", "Close with conversion path.", "demo CTA")
    ],
    visualStrategy: "dashboard frames, workflow cards, proof strips, restrained product UI visuals"
  }
};

function section(
  id: string,
  title: string,
  intent: string,
  visualIntent: string,
  optional = false
): WebsiteSectionDefinition {
  return {
    contentAngle: intent,
    id,
    intent,
    optional,
    title,
    visualIntent
  };
}

export function getWebsiteIndustryProfile(industry: WebsiteIndustry) {
  return profiles[industry];
}

export function getWebsiteIndustryProfiles() {
  return profiles;
}
