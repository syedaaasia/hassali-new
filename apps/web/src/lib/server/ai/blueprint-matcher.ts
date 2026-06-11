import type { TranslatedIntentSpec } from "@/lib/server/ai/intent-translator";
import type { ProjectContract } from "@/lib/server/ai/project-contract";

export type BlueprintKind = "answer" | "code_app" | "website";
export type BlueprintStatus = "fallback" | "matched" | "none";
export type BlueprintPreviewType =
  | "code_app_preview"
  | "code_plan_preview"
  | "none"
  | "website_static_preview";

export type BusinessBlueprint = {
  acceptanceChecks: string[];
  blueprintId: string;
  blueprintKind: BlueprintKind;
  blueprintName: string;
  blueprintStatus: BlueprintStatus;
  confidence: number;
  dataEntities: string[];
  fileStrategy: string[];
  integrations: string[];
  matchedDomain: string | null;
  mustAvoid: string[];
  mustInclude: string[];
  previewType: BlueprintPreviewType;
  requiredComponents: string[];
  requiredCopyBlocks: string[];
  screens: string[];
  sections: string[];
};

type MatchBlueprintInput = {
  contract?: ProjectContract | null;
  productMode: "ASK" | "CODE" | "WEBSITE";
  prompt: string;
  translatedIntent: TranslatedIntentSpec;
};

type BlueprintTemplate = Omit<
  BusinessBlueprint,
  "blueprintStatus" | "confidence" | "matchedDomain"
> & {
  domains: string[];
};

const websiteBlueprints: BlueprintTemplate[] = [
  {
    acceptanceChecks: [
      "dental terminology appears in visible copy",
      "appointment path is clear",
      "clinic trust, hygiene, doctors, and location are present",
      "no unrelated cafe, TV, vehicle, or developer wording"
    ],
    blueprintId: "dental_clinic_website",
    blueprintKind: "website",
    blueprintName: "Dental Clinic Website",
    dataEntities: [],
    domains: ["dental"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["appointment request placeholder", "contact form placeholder"],
    mustAvoid: ["coffee", "cafe", "OLED", "QLED", "developer", "coder", "car rental"],
    mustInclude: ["dental services", "dentists", "appointments", "hygiene", "patient reviews", "location"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "ServicesGrid", "DoctorsTeam", "AppointmentCTA", "TrustReviews", "LocationContact"],
    requiredCopyBlocks: ["appointment CTA", "treatment descriptions", "doctor/team intro", "hygiene and safety trust copy"],
    screens: [],
    sections: [
      "hero with appointment CTA",
      "dental services and treatments",
      "featured services",
      "dentists and care team",
      "working hours",
      "request appointment",
      "hygiene and safety",
      "patient testimonials",
      "location and contact"
    ]
  },
  {
    acceptanceChecks: [
      "coffee/menu vocabulary appears in visible copy",
      "pickup/delivery and hours are present when relevant",
      "no dental, TV, or developer leakage"
    ],
    blueprintId: "coffee_cafe_website",
    blueprintKind: "website",
    blueprintName: "Coffee Shop / Cafe Website",
    dataEntities: [],
    domains: ["coffee"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["order inquiry placeholder", "contact/location placeholder"],
    mustAvoid: ["dental", "dentist", "doctor", "OLED", "QLED", "developer", "coder"],
    mustInclude: ["signature drinks", "menu", "pastries", "hours", "pickup", "location"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "MenuCategories", "PopularItems", "PickupInfo", "Reviews", "Contact"],
    requiredCopyBlocks: ["signature drinks copy", "menu highlight copy", "pickup/location details", "community reviews"],
    screens: [],
    sections: [
      "hero banner",
      "signature drinks",
      "menu and order flow",
      "category tabs",
      "popular drinks and food",
      "pastries and add-ons",
      "pickup or delivery info",
      "secure payment trust",
      "location and hours",
      "contact"
    ]
  },
  {
    acceptanceChecks: [
      "occasion/product category structure exists",
      "freshness, delivery, and gifting trust appear",
      "no unrelated dental, TV, or developer copy"
    ],
    blueprintId: "floral_bridal_website",
    blueprintKind: "website",
    blueprintName: "Floral / Bridal Flower Website",
    dataEntities: [],
    domains: ["floral"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["bouquet inquiry placeholder", "delivery/contact placeholder"],
    mustAvoid: ["dental", "OLED", "QLED", "developer", "coder", "car rental"],
    mustInclude: ["bouquets", "occasions", "freshness", "delivery", "gifts"],
    previewType: "website_static_preview",
    requiredComponents: ["DeliveryNotice", "OccasionCategories", "CollectionGrid", "ProductCards", "TrustBadges"],
    requiredCopyBlocks: ["occasion copy", "freshness promise", "delivery/payment copy", "gift add-on copy"],
    screens: [],
    sections: [
      "top delivery and freshness notice",
      "hero",
      "occasion categories",
      "product categories",
      "top-selling collections",
      "new arrivals",
      "gifts and add-ons",
      "featured products",
      "why choose us",
      "delivery, payment, and freshness badges",
      "contact and support"
    ]
  },
  {
    acceptanceChecks: [
      "TV/electronics vocabulary appears",
      "comparison, installation, warranty, and store visit are present",
      "no dental, cafe, bridal, or generic developer SaaS leakage"
    ],
    blueprintId: "electronics_tv_shop_website",
    blueprintKind: "website",
    blueprintName: "Electronics / TV Shop Website",
    dataEntities: [],
    domains: ["electronics_retail"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["store visit/contact placeholder", "installation request placeholder"],
    mustAvoid: ["dental", "coffee", "cafe", "bridal", "generic developer SaaS"],
    mustInclude: ["4K", "OLED", "QLED", "HDMI", "warranty", "installation"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "FeaturedTVs", "ComparisonStrip", "ScreenSizeGuide", "InstallationPanel", "WarrantySupport"],
    requiredCopyBlocks: ["product lineup copy", "OLED/QLED comparison", "home cinema guidance", "installation/warranty copy"],
    screens: [],
    sections: [
      "hero",
      "featured TVs",
      "OLED vs QLED comparison",
      "screen size guide",
      "home cinema setup",
      "installation and wall mounting",
      "warranty and support",
      "store visit and contact"
    ]
  },
  {
    acceptanceChecks: ["menu/order flow is present", "location/contact is present", "no unrelated domain leakage"],
    blueprintId: "restaurant_food_website",
    blueprintKind: "website",
    blueprintName: "Restaurant / Food Business Website",
    dataEntities: [],
    domains: ["restaurant", "bakery"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["reservation/order placeholder", "contact/location placeholder"],
    mustAvoid: ["developer", "coder", "OLED", "QLED", "dental"],
    mustInclude: ["menu", "popular items", "hours", "pickup", "contact"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "MenuTabs", "PopularItems", "OrderStatus", "TrustBadges", "Contact"],
    requiredCopyBlocks: ["menu highlight copy", "pickup/delivery copy", "payment trust copy", "location/hours copy"],
    screens: [],
    sections: ["hero/banner", "menu/order flow", "category tabs", "popular products", "secure payment trust", "pickup/delivery info", "location/hours", "contact"]
  },
  {
    acceptanceChecks: ["product benefit copy is present", "CTA and trust proof exist", "does not become local-service filler"],
    blueprintId: "saas_product_landing_website",
    blueprintKind: "website",
    blueprintName: "SaaS / Product Landing Page",
    dataEntities: [],
    domains: ["crm", "saas"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["signup/contact placeholder"],
    mustAvoid: ["local service studio filler", "unrelated retail copy"],
    mustInclude: ["product value", "features", "workflow", "pricing or CTA", "trust"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "FeatureGrid", "Workflow", "PricingCTA", "Testimonials"],
    requiredCopyBlocks: ["product positioning", "feature copy", "workflow explanation", "conversion CTA"],
    screens: [],
    sections: ["hero", "product features", "workflow", "integrations", "pricing or CTA", "testimonials", "contact"]
  },
  {
    acceptanceChecks: ["commerce catalog structure exists", "checkout trust exists", "no unrelated domain leakage"],
    blueprintId: "ecommerce_store_website",
    blueprintKind: "website",
    blueprintName: "Ecommerce Store Website",
    dataEntities: [],
    domains: ["ecommerce"],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["cart/checkout placeholder", "contact/support placeholder"],
    mustAvoid: ["developer", "coder", "unrelated medical copy"],
    mustInclude: ["products", "categories", "cart", "checkout", "trust"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "CategoryGrid", "ProductGrid", "CartSummary", "TrustBadges", "Support"],
    requiredCopyBlocks: ["product category copy", "featured product copy", "checkout trust copy", "support copy"],
    screens: [],
    sections: ["hero", "product categories", "featured products", "most popular", "bundles", "cart/order status", "secure checkout", "support/contact"]
  }
];

const codeBlueprints: BlueprintTemplate[] = [
  {
    acceptanceChecks: [
      "proposal stays in CODE mode",
      "architecture/data/security/test plan exists",
      "no public static marketing website is generated unless requested"
    ],
    blueprintId: "crm_app",
    blueprintKind: "code_app",
    blueprintName: "CRM App",
    dataEntities: ["User", "Customer", "Deal/Record", "Invoice/Subscription"],
    domains: ["crm"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md", "SECURITY_AND_TESTING.md"],
    integrations: ["Auth provider placeholder", "Database placeholder", "Billing provider placeholder"],
    mustAvoid: ["public marketing website", "local service studio filler", "index.html static site unless explicitly landing page"],
    mustInclude: ["auth", "database", "dashboard", "customers", "billing"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "Sidebar", "DashboardCards", "CustomerTable", "RecordsPipeline", "BillingPanel", "SettingsPanel"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Dashboard", "Customers", "Records/Deals", "Billing", "Settings"],
    sections: []
  },
  {
    acceptanceChecks: ["admin screens are named", "data entities and reports are planned", "no public website fallback"],
    blueprintId: "admin_dashboard_app",
    blueprintKind: "code_app",
    blueprintName: "Admin Dashboard App",
    dataEntities: ["User", "Metric", "Report", "Activity"],
    domains: ["saas"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md"],
    integrations: ["Auth placeholder", "Database placeholder"],
    mustAvoid: ["public marketing website", "static-only placeholder"],
    mustInclude: ["dashboard", "reports", "users", "settings"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "Sidebar", "DashboardCards", "ReportsTable", "SettingsPanel"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Dashboard", "Reports", "Users", "Settings"],
    sections: []
  },
  {
    acceptanceChecks: ["inventory data model exists", "stock/supplier/report flows are planned", "no static website fallback"],
    blueprintId: "inventory_system_app",
    blueprintKind: "code_app",
    blueprintName: "Inventory System",
    dataEntities: ["User", "Product", "StockMovement", "Supplier", "Sale", "Report"],
    domains: ["business_system"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md", "SECURITY_AND_TESTING.md"],
    integrations: ["Auth placeholder", "Database placeholder"],
    mustAvoid: ["public marketing website", "generic service website"],
    mustInclude: ["products", "stock", "suppliers", "sales", "reports"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "InventoryTable", "SupplierPanel", "SalesFlow", "ReportsDashboard"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Dashboard", "Products", "Stock", "Suppliers", "Sales", "Reports"],
    sections: []
  },
  {
    acceptanceChecks: ["booking entities and screens are planned", "calendar/appointment flow exists"],
    blueprintId: "booking_system_app",
    blueprintKind: "code_app",
    blueprintName: "Booking System",
    dataEntities: ["User", "Customer", "Appointment", "Service", "Availability"],
    domains: ["booking"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md"],
    integrations: ["Auth placeholder", "Calendar placeholder", "Database placeholder"],
    mustAvoid: ["public marketing website"],
    mustInclude: ["booking", "availability", "appointments", "customers"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "CalendarView", "BookingForm", "CustomerList", "AvailabilityPanel"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Calendar", "Bookings", "Customers", "Settings"],
    sections: []
  },
  {
    acceptanceChecks: ["billing entities and screens are planned", "security/payment caveats are included"],
    blueprintId: "billing_dashboard_app",
    blueprintKind: "code_app",
    blueprintName: "Billing Dashboard",
    dataEntities: ["User", "Customer", "Invoice", "Subscription", "Payment"],
    domains: ["billing"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md", "SECURITY_AND_TESTING.md"],
    integrations: ["Auth placeholder", "Billing provider placeholder", "Database placeholder"],
    mustAvoid: ["public marketing website"],
    mustInclude: ["billing", "invoices", "subscriptions", "payments"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "InvoiceTable", "SubscriptionPanel", "PaymentStatus", "SettingsPanel"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Dashboard", "Invoices", "Subscriptions", "Payments", "Settings"],
    sections: []
  },
  {
    acceptanceChecks: ["portal screens and data entities are planned", "auth scope is clear"],
    blueprintId: "customer_portal_app",
    blueprintKind: "code_app",
    blueprintName: "Customer Portal",
    dataEntities: ["User", "Customer", "Request", "Document", "Message"],
    domains: ["portal"],
    fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md"],
    integrations: ["Auth placeholder", "Database placeholder"],
    mustAvoid: ["public marketing website"],
    mustInclude: ["customers", "requests", "documents", "messages"],
    previewType: "code_app_preview",
    requiredComponents: ["AppShell", "PortalHome", "RequestList", "DocumentCenter", "MessagePanel"],
    requiredCopyBlocks: [],
    screens: ["Login/Auth", "Portal Home", "Requests", "Documents", "Messages", "Settings"],
    sections: []
  }
];

function cloneTemplate(template: BlueprintTemplate, status: BlueprintStatus, confidence: number, matchedDomain: string | null): BusinessBlueprint {
  return {
    acceptanceChecks: template.acceptanceChecks,
    blueprintId: template.blueprintId,
    blueprintKind: template.blueprintKind,
    blueprintName: template.blueprintName,
    blueprintStatus: status,
    confidence,
    dataEntities: template.dataEntities,
    fileStrategy: template.fileStrategy,
    integrations: template.integrations,
    matchedDomain,
    mustAvoid: template.mustAvoid,
    mustInclude: template.mustInclude,
    previewType: template.previewType,
    requiredComponents: template.requiredComponents,
    requiredCopyBlocks: template.requiredCopyBlocks,
    screens: template.screens,
    sections: template.sections
  };
}

function fallbackBlueprint(input: MatchBlueprintInput): BusinessBlueprint {
  if (input.productMode === "ASK") {
    return {
      acceptanceChecks: ["answer the question directly", "do not propose file mutations"],
      blueprintId: "ask_answer",
      blueprintKind: "answer",
      blueprintName: "ASK Answer",
      blueprintStatus: "none",
      confidence: 0.78,
      dataEntities: [],
      fileStrategy: [],
      integrations: [],
      matchedDomain: input.translatedIntent.domain,
      mustAvoid: ["file mutation", "website generation", "code generation"],
      mustInclude: ["clear answer", "safe limitation when facts are uncertain"],
      previewType: "none",
      requiredComponents: [],
      requiredCopyBlocks: [],
      screens: [],
      sections: []
    };
  }

  if (input.productMode === "CODE") {
    return {
      acceptanceChecks: ["proposal remains approval-first", "technical plan is concrete", "no static website fallback"],
      blueprintId: "generic_business_app",
      blueprintKind: "code_app",
      blueprintName: "Generic Business App",
      blueprintStatus: "fallback",
      confidence: 0.46,
      dataEntities: input.translatedIntent.extractedEntities,
      fileStrategy: ["ARCHITECTURE.md", "DATA_MODEL.md", "IMPLEMENTATION_PLAN.md"],
      integrations: input.translatedIntent.requestedFeatures.filter((feature) => ["auth", "billing", "database"].includes(feature)),
      matchedDomain: input.translatedIntent.domain,
      mustAvoid: ["public marketing website", "index.html static site unless explicitly requested"],
      mustInclude: input.translatedIntent.requestedFeatures,
      previewType: "code_plan_preview",
      requiredComponents: ["AppShell", "CoreScreens", "DataModel", "Settings"],
      requiredCopyBlocks: [],
      screens: ["Login/Auth", "Dashboard", "Records", "Settings"],
      sections: []
    };
  }

  return {
    acceptanceChecks: ["domain-specific copy is present", "requested pages and constraints are respected", "no stale domain leakage"],
    blueprintId: "generic_local_service_website",
    blueprintKind: "website",
    blueprintName: "Generic Local Service Website",
    blueprintStatus: "fallback",
    confidence: 0.42,
    dataEntities: [],
    fileStrategy: ["index.html", "styles.css", "main.js", "requested page files"],
    integrations: ["contact form placeholder"],
    matchedDomain: input.translatedIntent.domain,
    mustAvoid: ["developer/coder fallback", "unrelated stale project domain", "generic internal instruction copy"],
    mustInclude: ["clear hero", "services/offers", "trust reasons", "CTA", "contact"],
    previewType: "website_static_preview",
    requiredComponents: ["Hero", "OfferSections", "TrustReasons", "CTA", "Contact"],
    requiredCopyBlocks: ["public hero copy", "offer descriptions", "trust copy", "contact CTA"],
    screens: [],
    sections: ["hero", "services or offers", "trust reasons", "testimonials", "CTA", "contact"]
  };
}

function matchesLandingPage(input: MatchBlueprintInput) {
  const text = input.prompt.toLowerCase();

  return text.includes("landing page") || text.includes("website") || text.includes("site");
}

function codeDomainFromFeatures(input: MatchBlueprintInput) {
  const features = input.translatedIntent.requestedFeatures;

  if (input.translatedIntent.domain === "crm") return "crm";
  if (input.translatedIntent.domain === "business_system" || features.includes("inventory")) return "business_system";
  if (features.includes("appointments")) return "booking";
  if (features.includes("billing")) return "billing";
  if (input.prompt.toLowerCase().includes("portal")) return "portal";

  return input.translatedIntent.domain;
}

export function matchBusinessBlueprint(input: MatchBlueprintInput): BusinessBlueprint {
  if (input.productMode === "ASK") {
    return fallbackBlueprint(input);
  }

  if (input.productMode === "WEBSITE") {
    const domain = input.translatedIntent.domain;
    const effectiveDomain = domain === "crm" && matchesLandingPage(input) ? "crm" : domain;
    const matched = websiteBlueprints.find((blueprint) =>
      effectiveDomain ? blueprint.domains.includes(effectiveDomain) : false
    );

    return matched
      ? cloneTemplate(matched, "matched", Math.min(0.96, input.translatedIntent.confidence + 0.08), effectiveDomain)
      : fallbackBlueprint(input);
  }

  const domain = codeDomainFromFeatures(input);
  const matched = codeBlueprints.find((blueprint) =>
    domain ? blueprint.domains.includes(domain) : false
  );

  return matched
    ? cloneTemplate(matched, "matched", Math.min(0.96, input.translatedIntent.confidence + 0.1), domain)
    : fallbackBlueprint(input);
}

export function summarizeBusinessBlueprint(blueprint: BusinessBlueprint) {
  return [
    `${blueprint.blueprintId}`,
    `kind=${blueprint.blueprintKind}`,
    `status=${blueprint.blueprintStatus}`,
    `preview=${blueprint.previewType}`,
    `confidence=${blueprint.confidence.toFixed(2)}`,
    blueprint.sections.length ? `sections=${blueprint.sections.slice(0, 6).join(", ")}` : null,
    blueprint.screens.length ? `screens=${blueprint.screens.slice(0, 6).join(", ")}` : null
  ].filter(Boolean).join("; ");
}
