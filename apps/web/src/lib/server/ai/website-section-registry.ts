export type WebsiteIndustry =
  | "ai_product"
  | "beverage"
  | "bicycle_shop"
  | "car_rental"
  | "crm_software"
  | "dental_clinic"
  | "cleaning_service"
  | "ecommerce"
  | "florist"
  | "healthcare"
  | "marketplace"
  | "mobile_phone_shop"
  | "portfolio"
  | "real_estate"
  | "restaurant"
  | "seafood_restaurant"
  | "upholstery"
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
  upholstery: {
    audience: "homeowners, designers, restaurants, offices, and local customers repairing or refreshing furniture",
    contentStrategy: ["lead with craft restoration", "show fabric and leather options", "make estimate requests easy"],
    goal: "turn furniture restoration interest into quote requests and workshop consultations",
    industry: "upholstery",
    layoutType: "creator_case_study",
    optionalSections: [
      section("fabric-options", "Fabric and Leather Options", "Show material choices and guidance.", "fabric sample cards", true),
      section("before-after", "Before and After Projects", "Build trust with restoration proof.", "before and after gallery", true)
    ],
    requiredSections: [
      section("upholstery-hero", "Sofa Reupholstery and Furniture Restoration", "Introduce upholstery services, fabric selection, and quote path.", "warm craft studio"),
      section("services", "Sofa, Chair, Fabric, and Leather Repair", "Show core upholstery services.", "service cards with furniture details"),
      section("process", "Restoration Process", "Explain photos, estimate, fabric choice, stitching, and pickup.", "restoration process timeline"),
      section("trust", "Workshop Quality and Before/After Proof", "Surface workmanship, samples, and experience.", "fabric and restoration proof"),
      section("contact", "Request a Free Estimate", "Close with furniture photo and consultation CTA.", "estimate request form")
    ],
    visualStrategy: "warm craft studio, fabric textures, before and after restoration, premium home interior feel"
  },
  bicycle_shop: {
    audience: "cyclists, commuters, families, and riders looking for bicycles, accessories, and service",
    contentStrategy: ["lead with bicycles and rider fit", "show service and accessories", "make workshop contact clear"],
    goal: "turn visitors into bicycle buyers, tune-up bookings, and accessory shoppers",
    industry: "bicycle_shop",
    layoutType: "catalog_commerce",
    optionalSections: [
      section("accessories", "Helmets and Rider Gear", "Show add-ons and safety gear.", "rider gear shelf", true),
      section("workshop", "Service Workshop", "Explain tune-ups and repair booking.", "bike repair stand", true)
    ],
    requiredSections: [
      section("bike-hero", "Bicycles and Rider Service", "Introduce bicycle lineup, fitting, and service path.", "cycling showroom"),
      section("bikes", "Road, Mountain, and Commuter Bikes", "Show bicycle categories.", "bicycle category cards"),
      section("service", "Tune-ups and Bicycle Repair", "Explain workshop services.", "repair checklist"),
      section("trust", "Fitting, Safety, and Support", "Build rider confidence.", "rider support proof"),
      section("contact", "Visit the Bike Workshop", "Close with visit or service booking.", "service contact panel")
    ],
    visualStrategy: "cycling showroom, repair stand, rider gear, no car rental or motorcycle copy"
  },
  seafood_restaurant: {
    audience: "diners, families, seafood lovers, and reservation guests looking for fresh coastal food",
    contentStrategy: ["lead with fresh catch", "show menu and sourcing", "make reservations easy"],
    goal: "drive seafood reservations, menu exploration, and contact inquiries",
    industry: "seafood_restaurant",
    layoutType: "table_to_order",
    optionalSections: [
      section("sourcing", "Sourcing and Sustainability", "Explain freshness and supplier care.", "fresh catch sourcing panel", true),
      section("private-dining", "Private Dining", "Support event inquiries.", "coastal dining table", true)
    ],
    requiredSections: [
      section("seafood-hero", "Fresh Catch Seafood Dining", "Lead with seafood menu and reservation path.", "fresh seafood plates"),
      section("menu", "Oysters, Lobster, Grilled Fish, and Seasonal Catch", "Show menu range.", "seafood menu cards"),
      section("fresh-catch", "Daily Catch and Chef Specials", "Build freshness proof.", "daily catch board"),
      section("reservation", "Reservations and Hospitality", "Clarify booking and dining experience.", "reservation panel"),
      section("contact", "Contact and Hours", "Make visit and inquiry details clear.", "contact hours panel")
    ],
    visualStrategy: "ocean-inspired seafood dining, fresh catch gallery, reservation warmth, no coffee or latte vocabulary"
  },
  dental_clinic: {
    audience: "patients and families looking for calm, trustworthy dental care",
    contentStrategy: ["lead with appointments", "show dental treatments", "surface hygiene and doctor trust"],
    goal: "increase dental appointment requests and patient confidence",
    industry: "dental_clinic",
    layoutType: "clinical_trust",
    optionalSections: [
      section("insurance", "Insurance and Payment Information", "Clarify payment support.", "document cards", true),
      section("emergency", "Urgent Dental Care Guidance", "Guide urgent visitors safely.", "alert panel", true)
    ],
    requiredSections: [
      section("clinic-hero", "Dental Care and Appointment Path", "State dental care promise and appointment path.", "clinic glass panel"),
      section("treatments", "Treatments and Services", "List dental care categories.", "service cards"),
      section("team", "Dentists and Care Team", "Build trust through team presentation.", "team cards"),
      section("booking", "Appointment Booking", "Make the appointment path visible.", "booking panel"),
      section("trust-safety", "Hygiene, Safety, and Patient Trust", "Explain safety and reviews.", "trust checklist")
    ],
    visualStrategy: "calm clinic surfaces, dentist team cards, appointment panels, safety badges"
  },
  crm_software: {
    audience: "sales teams, founders, operators, and support teams evaluating CRM software",
    contentStrategy: ["show dashboard workflow", "explain customers, pipeline, and billing", "surface control boundaries"],
    goal: "help users understand CRM modules and implementation readiness",
    industry: "crm_software",
    layoutType: "saas_conversion",
    optionalSections: [
      section("billing", "Billing and Revenue", "Explain invoice and billing workflow.", "billing chart cards", true),
      section("activity", "Activity Feed", "Show sales activity and follow-up.", "activity timeline", true)
    ],
    requiredSections: [
      section("crm-hero", "CRM Dashboard Workflow", "Introduce dashboard metrics and customer pipeline.", "dashboard frame"),
      section("customers", "Customer Records", "Show customer table and status.", "customer table"),
      section("pipeline", "Sales Pipeline", "Explain deals and stages.", "pipeline board"),
      section("billing", "Billing Overview", "Show invoice and revenue clarity.", "billing cards"),
      section("contact", "Implementation Notes", "Clarify mock data, auth, and database boundaries.", "architecture notes")
    ],
    visualStrategy: "dashboard metrics, customer tables, billing charts, no unrelated retail domain"
  },
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
  mobile_phone_shop: {
    audience: "smartphone buyers, upgrade customers, accessory shoppers, repair customers, and families comparing mobile devices",
    contentStrategy: ["lead with phones and accessories", "make service and warranty clear", "support product comparison and repair inquiries"],
    goal: "help customers choose phones, accessories, repairs, and service support with confidence",
    industry: "mobile_phone_shop",
    layoutType: "catalog_commerce",
    optionalSections: [
      section("trade-ins", "Trade-ins and Installments", "Explain upgrade paths, trade-ins, and installment plans.", "phone upgrade cards", true),
      section("repairs", "Repair Counter", "Show screen, battery, setup, and warranty help.", "service counter panel", true)
    ],
    requiredSections: [
      section("phone-hero", "Smartphone Storefront", "Introduce new arrivals, unlocked phones, and trusted setup help.", "premium smartphone shelf"),
      section("devices", "iPhone, Samsung, and Android Phones", "Show the main device categories and comparison paths.", "device comparison grid"),
      section("accessories", "Cases, Chargers, and Screen Protectors", "Surface essential accessories and add-ons.", "accessory shelf"),
      section("service", "Repairs, Warranty, and Device Setup", "Make support, warranty, repairs, and transfer help clear.", "service counter"),
      section("contact", "Customer Support and Store Visit", "Give shoppers a clear contact path.", "support and visit panel")
    ],
    visualStrategy: "premium smartphone displays, accessory shelves, repair/service counter, comparison cards, no SaaS dashboards or generic service filler"
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
  car_rental: {
    audience: "drivers, travelers, families, business customers, and airport rental customers comparing vehicle availability",
    contentStrategy: ["lead with fleet and booking clarity", "show rental categories and transparent pricing", "make pickup, insurance, and contact paths obvious"],
    goal: "turn visitors into car rental reservations and fleet inquiries",
    industry: "car_rental",
    layoutType: "property_showcase",
    optionalSections: [
      section("airport-rentals", "Airport Rentals", "Explain pickup, dropoff, and travel timing.", "airport pickup card", true),
      section("rental-plans", "Daily and Weekly Rental Plans", "Clarify flexible rental periods and mileage.", "rental plan cards", true)
    ],
    requiredSections: [
      section("rental-hero", "Rental Cars Ready for Every Trip", "Lead with vehicle fleet, booking, pickup/dropoff, and transparent pricing.", "premium vehicle fleet"),
      section("fleet-categories", "Economy, SUV, and Luxury Vehicle Fleet", "Show rental categories, availability, clean vehicles, and driver needs.", "fleet category cards"),
      section("booking-flow", "Booking, Insurance, and Mileage Clarity", "Explain reservations, insurance, mileage, deposits, and roadside support.", "booking details panel"),
      section("trust-support", "Clean Vehicles and Roadside Support", "Build confidence with maintained cars, driver support, and simple handover.", "support and inspection checklist"),
      section("contact", "Reserve a Vehicle", "Close with contact, pickup location, date, and vehicle category inquiry.", "rental reservation form")
    ],
    visualStrategy: "premium vehicle fleet, reservation cards, pickup/dropoff cues, transparent pricing, roadside support, no SaaS dashboard imagery"
  },
  cleaning_service: {
    audience: "homeowners, renters, offices, property managers, and local customers booking reliable cleaning",
    contentStrategy: ["lead with easy booking", "show cleaning packages", "surface insured/local trust"],
    goal: "turn cleaning interest into quote requests and scheduled visits",
    industry: "cleaning_service",
    layoutType: "clinical_trust",
    optionalSections: [
      section("reviews", "Local Reviews", "Build trust with local customer proof.", "fresh review cards", true),
      section("move-cleaning", "Move-In and Move-Out Cleaning", "Support high-intent moving needs.", "move cleaning checklist", true)
    ],
    requiredSections: [
      section("cleaning-hero", "Fresh Local Cleaning", "Lead with home cleaning, office cleaning, and quote path.", "bright cleaned room"),
      section("packages", "Home, Office, and Deep Clean Packages", "Show practical cleaning service options.", "cleaning package cards"),
      section("trust", "Insured Cleaners and Local Reviews", "Build confidence before booking.", "insured cleaning badges"),
      section("schedule", "Recurring Cleaning Schedule", "Explain weekly, biweekly, and monthly service.", "cleaning calendar"),
      section("contact", "Book a Cleaning", "Close with room details, schedule, and quote CTA.", "cleaning booking form")
    ],
    visualStrategy: "fresh bright cleaning surfaces, checklist cards, insured proof, local reviews"
  },
  florist: {
    audience: "gift buyers, wedding clients, event planners, families, and seasonal flower customers",
    contentStrategy: ["lead with emotional arrangement value", "show occasions", "make ordering and delivery clear"],
    goal: "turn flower interest into orders, arrangement requests, and event inquiries",
    industry: "florist",
    layoutType: "creator_case_study",
    optionalSections: [
      section("weddings", "Wedding and Event Florals", "Support larger arrangement inquiries.", "event floral gallery", true),
      section("delivery", "Delivery and Freshness", "Clarify delivery timing and care.", "delivery proof card", true)
    ],
    requiredSections: [
      section("florist-hero", "Seasonal Floral Design", "Lead with bouquets, arrangements, and order path.", "seasonal bouquet gallery"),
      section("occasions", "Flowers for Every Occasion", "Show gift, wedding, sympathy, and event paths.", "occasion cards"),
      section("arrangements", "Featured Arrangements", "Show bouquet and floral arrangement variety.", "arrangement gallery"),
      section("freshness", "Freshness and Delivery Care", "Build proof around freshness and delivery.", "freshness proof"),
      section("contact", "Order Flowers", "Close with delivery date, occasion, and arrangement request.", "floral order form")
    ],
    visualStrategy: "soft floral gallery, seasonal arrangements, delivery proof, emotional gift cues"
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
