import type { WebsiteGenerationBrief } from "@/lib/server/ai/generation-brief";
import type { IntentIntelligence } from "@/lib/server/ai/intent-intelligence";
import type { CompositionStrategy } from "@/lib/server/ai/reasoning-composition";
import type { WebsiteCreativeDirection } from "@/lib/server/ai/website-creative-direction";
import type { WebsitePlan } from "@/lib/server/ai/website-planner";
import {
  inferSemanticDomain,
  type SemanticDomainEvidence
} from "@/lib/server/ai/industry-taxonomy";
import {
  evaluateWebsiteSemanticConsistency,
  type WebsiteSemanticConsistencyResult
} from "@/lib/server/ai/website-semantic-consistency";
import {
  buildWebsiteMediaRegistry,
  type WebsiteMediaAsset
} from "@/lib/server/ai/website-media-registry";
import {
  analyzeWebsiteAssets,
  workspaceMediaFromAssetIntelligence,
  type WebsiteAssetIntelligence
} from "@/lib/server/ai/website-asset-intelligence";
import {
  composeWebsiteExperience,
  type WebsiteExperiencePlan
} from "@/lib/server/ai/website-experience-composer";
import {
  applyExperienceQualityRepair,
  reviewWebsiteExperienceQuality,
  type WebsiteExperienceQualityReview
} from "@/lib/server/ai/website-experience-quality";
import type { WebsiteCinematicAssetInput } from "@/lib/server/ai/website-cinematic-asset-analyzer";
import {
  buildWebsiteCinematicExperience,
  type WebsiteCinematicExperience
} from "@/lib/server/ai/website-cinematic-sequence-spec";
import type { WebsiteSemanticResolution } from "@/lib/server/ai/website-niche-resolver";
import {
  buildWebsite3DSceneSpec,
  type Website3DRequirement,
  type Website3DSceneRecipe,
  type Website3DSceneSpec
} from "@/lib/server/ai/website-webgl-scene-spec";

export type WebsitePalette = {
  accent: string;
  accentAlt: string;
  background: string;
  border: string;
  ink: string;
  muted: string;
  surface: string;
};

export type WebsiteTypography = {
  body: string;
  display: string;
  personality: "editorial" | "friendly" | "modern" | "technical";
};

export type WebsiteLogoBlueprint = {
  initials: string;
  style: "emblem" | "lettermark" | "monogram" | "symbol_wordmark" | "wordmark_mark";
  symbol: "blocks" | "cards" | "dial" | "display" | "drop" | "legal_seal" | "orbit" | "spark" | "wordmark";
  variant: number;
};

export type WebsiteVisitorCopy = {
  body: string;
  eyebrow: string;
  heading: string;
  primaryCta: string;
  secondaryCta?: string;
};

export type WebsiteSectionKind =
  | "carousel"
  | "comparison"
  | "content"
  | "entities"
  | "faq"
  | "filter"
  | "form"
  | "gallery"
  | "process"
  | "stats"
  | "trust";

export type WebsiteSectionBlueprint = {
  body: string;
  eyebrow: string;
  id: string;
  items: Array<{ detail: string; meta?: string; title: string }>;
  kind: WebsiteSectionKind;
  title: string;
};

export type WebsitePageBlueprint = {
  description: string;
  name: string;
  path: string;
  sections: WebsiteSectionBlueprint[];
  structuredDataType: string;
  title: string;
  visitorCopy: WebsiteVisitorCopy;
};

export type WebsiteInteractionBlueprint = {
  id: "accordion" | "carousel" | "cinematic-sequence" | "filter" | "form" | "mobile-navigation" | "reveal" | "sticky-header";
  keyboard: boolean;
  reason: string;
};

export type WebsiteSceneObject = {
  colorRole: "accent" | "accent-alt" | "ink" | "surface";
  count: number;
  kind: "building" | "card" | "connector" | "dial" | "display" | "orb" | "plane" | "ring" | "road" | "vessel" | "volume" | "wheel";
  motion: "float" | "orbit" | "rotate" | "slide" | "static";
};

export type WebsiteSceneTimelineStep = {
  end: string;
  objectsAffected: string[];
  pin: boolean;
  reducedMotionBehavior: string;
  scrub: boolean;
  start: string;
  textAffected: string[];
  trigger: string;
};

export type WebsiteSceneBlueprint = {
  assets: Array<{ id: string; path: string; role: "fallback" | "texture" }>;
  camera: { far: number; fov: number; near: number; position: [number, number, number] };
  domainId: string | null;
  engine: "css_svg" | "native_webgl" | "none" | "three";
  fallback: { asset: string; behavior: string };
  id: string;
  lighting: { ambient: number; key: number; rim: number };
  lowPowerPolicy: { disableShadows: boolean; particleScale: number; pixelRatio: number };
  materials: Array<{ colorRole: WebsiteSceneObject["colorRole"]; finish: "emissive" | "glass" | "matte" | "metal" }>;
  mobilePolicy: { allowPinning: boolean; particleScale: number; pixelRatio: number; useFallbackBelow: number };
  motionEngine: "gsap-scrolltrigger" | "native" | "none";
  mountSectionId: string;
  mountSelector: string;
  objects: WebsiteSceneObject[];
  pagePath: string;
  performanceBudget: { maxDrawCalls: number; maxObjects: number; maxPixelRatio: number };
  pointerInteraction: { enabled: boolean; strength: number } | null;
  purpose: "ambient_field" | "architectural_scene" | "comparison_scene" | "gallery_depth" | "hero_product_stage" | "mechanism_explainer" | "scroll_story" | "ui_journey";
  qualityTier: "minimal" | "premium" | "standard";
  recipe: Website3DSceneRecipe;
  reducedMotionPolicy: { showFallback: boolean; skipPinning: boolean; stopContinuousMotion: boolean };
  requirement: Website3DRequirement;
  scrollTimeline: WebsiteSceneTimelineStep[];
  spec: Website3DSceneSpec;
};

export type WebsiteQualityBlueprint = {
  accessibility: {
    landmarks: boolean;
    reducedMotion: boolean;
    skipLink: boolean;
    visibleFocus: boolean;
  };
  assets: WebsiteAssetIntelligence;
  brand: {
    generatedName: string;
    nameProvenance: "GENERATED_PLACEHOLDER" | "USER_SUPPLIED";
    logo: WebsiteLogoBlueprint;
    logoStrategy: "generated-local-svg";
    palette: WebsitePalette;
    tagline: string;
    tone: string[];
    typography: WebsiteTypography;
    visualArchetype: string;
  };
  business: {
    audience: string[];
    businessModels: string[];
    businessType: string;
    capabilities: string[];
    category: string | null;
    differentiators: string[];
    domainId: string | null;
    industry: string | null;
    niche: string | null;
    primaryGoal: string;
    products: string[];
    sector: string | null;
    secondaryGoals: string[];
    services: string[];
    subNiche: string | null;
    trustSignals: string[];
    visualSubjects: string[];
  };
  cinematic: WebsiteCinematicExperience;
  contentEntities: Array<{ description: string; label: string; meta: string }>;
  interactions: WebsiteInteractionBlueprint[];
  media: WebsiteMediaAsset[];
  experience: WebsiteExperiencePlan;
  experienceQuality: WebsiteExperienceQualityReview;
  pages: WebsitePageBlueprint[];
  performance: {
    maxDevicePixelRatio: number;
    pauseWhenHidden: boolean;
    progressiveEnhancement: boolean;
    remoteDependencies: number;
  };
  seo: {
    canonicalPolicy: "project-relative";
    includeOpenGraph: boolean;
    includeRobots: boolean;
    includeSitemap: boolean;
    structuredData: boolean;
  };
  scene: WebsiteSceneBlueprint;
  semanticConsistency: WebsiteSemanticConsistencyResult & { repairApplied: boolean };
  sharedComponents: string[];
  webgl: {
    enabled: boolean;
    fallbackAsset: string;
    intensity: "restrained" | "standard";
    reason: string;
    strategy: "disabled-by-request" | "not-requested" | "three-r185-scroll-story";
  };
};

type DomainProfile = {
  audience: string[];
  brandStems: string[];
  brandSuffixes: string[];
  businessType: string;
  differentiators: string[];
  entities: Array<[string, string, string]>;
  faq: Array<[string, string]>;
  heroBody?: string;
  primaryGoal: string;
  schema: string;
  sectionIdeas: Array<[string, string, WebsiteSectionKind]>;
  tagline: string;
  trustSignals: string[];
  visualArchetype: string;
};

const profiles: Record<string, DomainProfile> = {
  television: profile({
    audience: ["home cinema buyers", "families comparing screen technology", "gaming and sports viewers"],
    brandStems: ["Nova", "Vista", "Pixel", "Lumina"],
    brandSuffixes: ["Vision", "Screen", "Circuit", "Display"],
    businessType: "television and home cinema retailer",
    differentiators: ["room-led buying guidance", "technology comparisons", "installation planning"],
    entities: [
      ["OLED Cinema", "Deep contrast and precise highlights for film nights.", "Premium viewing"],
      ["Mini-LED Bright", "High brightness and local dimming for lively rooms.", "Bright rooms"],
      ["Gaming 120Hz", "Responsive panels for consoles and fast motion.", "Low-latency play"],
      ["QLED Everyday", "Vivid color and practical sizes for family spaces.", "Family favorite"],
      ["Soundbar Pairing", "Clear dialogue and fuller room sound.", "Audio upgrade"],
      ["Wall Mount Plan", "Placement guidance for viewing height and cables.", "Installation ready"]
    ],
    faq: [["Which screen suits a bright room?", "Mini-LED and high-brightness QLED displays are useful starting points; compare reflections and viewing angles in person."], ["How do I choose screen size?", "Use seating distance, room width, and viewing habits rather than choosing the largest panel automatically."], ["Is installation available?", "Ask the store about mounting, cable routing, calibration, and delivery options for your room."]],
    heroBody: "Compare OLED, QLED, and home-cinema options with practical guidance for your room, viewing habits, and installation needs.",
    primaryGoal: "help shoppers compare televisions and request buying or installation guidance",
    schema: "Store",
    sectionIdeas: [["Find your viewing fit", "Compare by room, screen size, light level, and the content you watch most.", "filter"], ["Featured screen technologies", "Explore display technologies for different rooms, viewing habits, and budgets.", "carousel"], ["See the difference clearly", "Compare practical strengths before choosing a panel technology.", "comparison"], ["From room plan to first movie", "A simple consultation, selection, delivery, and setup path.", "process"], ["Support beyond the box", "Clear advice around mounting, calibration, audio, and after-sales questions.", "trust"], ["Questions before you choose", "Straight answers for screen size, brightness, gaming, and installation.", "faq"]],
    tagline: "Better screens, chosen for real rooms.",
    trustSignals: ["warranty guidance", "installation planning", "clear delivery questions"],
    visualArchetype: "cinematic retail showroom"
  }),
  dental: profile({
    audience: ["patients", "families", "people planning preventive or restorative care"],
    brandStems: ["Harbor", "Luma", "Oakwell", "Kindred"],
    brandSuffixes: ["Dental", "Dentistry", "Smile Care", "Dental House"],
    businessType: "dental clinic",
    differentiators: ["calm appointment journey", "clear treatment explanations", "comfort-led care"],
    entities: [["Routine Care", "Checkups, hygiene visits, and preventive guidance.", "Prevention"], ["Restorative Care", "Assessment-led options for damaged or missing teeth.", "Restore"], ["Cosmetic Consultation", "A careful conversation about appearance goals and suitable options.", "Plan first"], ["Family Visits", "Age-aware appointments with a calm, clear process.", "All ages"], ["Urgent Guidance", "A visible contact path for symptoms that should not wait.", "Call the clinic"], ["Patient Comfort", "Share sensitivities and concerns before the appointment.", "Comfort notes"]],
    faq: [["When should I book a routine visit?", "A clinician can recommend an interval based on your oral health and risk factors."], ["What if I feel anxious?", "Tell the clinic before your visit so the team can explain steps and discuss comfort options."], ["Is this form a confirmed booking?", "No. It is an appointment request until the clinic confirms a time."]],
    primaryGoal: "help patients understand care and request an appointment",
    schema: "Dentist",
    sectionIdeas: [["Care that starts with listening", "Explore common treatment paths without replacing a clinical assessment.", "entities"], ["A calmer appointment path", "Know what happens before, during, and after a visit.", "process"], ["Designed around patient confidence", "Comfort notes, clear explanations, and transparent next steps.", "trust"], ["Common appointment questions", "Practical guidance before contacting the clinic.", "faq"], ["Request an appointment", "Send preferred timing and a short note; the clinic must confirm availability.", "form"]],
    tagline: "Clear care. Calmer visits.",
    trustSignals: ["patient-first explanations", "accessible appointment requests", "editable clinician details"],
    visualArchetype: "calm clinical clarity"
  }),
  crm: profile({
    audience: ["sales teams", "founders", "customer operations teams"],
    brandStems: ["Relay", "Clear", "Client", "Signal"],
    brandSuffixes: ["CRM", "Pipeline", "Flow", "Desk"],
    businessType: "CRM software product",
    differentiators: ["one customer timeline", "visible pipeline movement", "billing context beside relationships"],
    entities: [["Contact Timeline", "Calls, notes, emails, and tasks in one customer history.", "Context"], ["Deal Pipeline", "Move opportunities through clear stages with ownership.", "Sales"], ["Company Records", "Connect contacts, deals, invoices, and activity.", "Accounts"], ["Billing View", "Keep invoice status visible beside client work.", "Revenue"], ["Task Queue", "Turn follow-up promises into assigned next actions.", "Execution"], ["Reports", "Read pipeline health without a maze of dashboards.", "Insight"]],
    faq: [["Is the pricing real?", "Pricing shown in this generated demo is editable sample content until the product owner confirms plans."], ["Does this include a database?", "This static website explains the product; it does not provision application infrastructure."], ["Can teams import contacts?", "Import behavior should be specified and implemented in the product before it is promised publicly."]],
    heroBody: "Bring invoices, follow-ups, savings goals, and payment progress into one clear workflow your team can understand at a glance.",
    primaryGoal: "explain the CRM workflow and convert qualified visitors into demos or trials",
    schema: "SoftwareApplication",
    sectionIdeas: [["Your customer work, in one view", "Connect relationships, opportunities, follow-ups, and billing context.", "entities"], ["See the pipeline without losing the person", "Compare fragmented work with a joined-up CRM workflow.", "comparison"], ["A day in the sales workflow", "Move from new lead to invoice follow-up with clear ownership.", "process"], ["Plans that can grow with the team", "Editable sample tiers make packaging easy to review.", "carousel"], ["Questions before a product demo", "Clarify scope, data, setup, and rollout expectations.", "faq"]],
    tagline: "Keep every relationship moving.",
    trustSignals: ["editable sample pricing", "clear product boundaries", "workflow-first explanation"],
    visualArchetype: "precise product interface"
  }),
  toy: profile({
    audience: ["parents", "gift buyers", "kids across practical age groups"],
    brandStems: ["Bright", "Wonder", "Little", "Play"],
    brandSuffixes: ["Nest", "Orbit", "Box Toys", "Harbor"],
    businessType: "toy shop",
    differentiators: ["age-aware discovery", "learning and play categories", "honest delivery and returns guidance"],
    entities: [["Tiny Explorers", "Sensory and early-learning picks for supervised play.", "Ages 1-3"], ["Creative Builders", "Blocks, making kits, and open-ended construction.", "Ages 4-7"], ["Puzzle Thinkers", "Puzzles and educational games with growing challenge.", "Ages 6+"], ["Plush Friends", "Soft companions and gift-ready favorites.", "All ages"], ["STEM Play", "Hands-on science, logic, and building activities.", "Learn through play"], ["Gift Picks", "Editable ideas organized by age and interest.", "Easy gifting"]],
    faq: [["How should I choose by age?", "Use the maker's age guidance, the child's interests, and adult supervision needs."], ["Is checkout live?", "No checkout is claimed unless the project includes a real commerce flow; use the inquiry path for this static demo."], ["How do delivery and returns work?", "Policies are editable and must be confirmed by the shop before launch."]],
    primaryGoal: "help families discover suitable toys and make a confident inquiry or purchase decision",
    schema: "ToyStore",
    sectionIdeas: [["Start with their age and curiosity", "Filter sample picks by age group and play style.", "filter"], ["Popular ways to play", "Browse educational toys, puzzles, plush friends, and building sets.", "carousel"], ["A gift guide without the guesswork", "Choose by age, interest, occasion, and how the child likes to play.", "content"], ["Playful, not confusing", "Readable motion, touch-friendly controls, and clear product details support families.", "trust"], ["Questions from thoughtful gift buyers", "Practical notes about age guidance, checkout state, delivery, and returns.", "faq"]],
    tagline: "Big curiosity for every little explorer.",
    trustSignals: ["age guidance", "editable delivery policy", "honest checkout state"],
    visualArchetype: "playful editorial retail"
  }),
  restaurant: profile({
    audience: ["local diners", "families and groups", "guests planning a reservation"],
    brandStems: ["Ember", "Gather", "Salt", "Olive"],
    brandSuffixes: ["Table", "Kitchen", "House", "Dining Room"],
    businessType: "restaurant",
    differentiators: ["editorial menu storytelling", "clear reservation path", "atmosphere-led presentation"],
    entities: [["Seasonal Starter", "A light opening plate using ingredients selected for the current menu.", "Sample item"], ["House Main", "A signature plate description ready for the chef's real dish and price.", "Sample item"], ["Plant-led Plate", "A vegetable-forward option with clear dietary notes.", "Sample item"], ["Shared Table", "A flexible dish concept for groups and celebrations.", "Sample item"], ["Chef's Dessert", "A concise finish with editable ingredients.", "Sample item"], ["Zero-proof Pairing", "A thoughtful non-alcoholic pairing placeholder.", "Sample item"]],
    faq: [["Is a reservation request confirmed?", "No. The restaurant should confirm the date and time directly."], ["Can dietary needs be shared?", "Yes, add them to the request, but confirm suitability with the restaurant before visiting."], ["Are menu items and prices final?", "No. Generated menu entries are editable samples until the restaurant supplies its current menu."]],
    primaryGoal: "encourage menu exploration and reservation requests",
    schema: "Restaurant",
    sectionIdeas: [["A menu with a point of view", "Present editable seasonal dishes with enough detail to guide a visit.", "entities"], ["Inside the dining room", "A responsive gallery creates atmosphere without hiding practical information.", "gallery"], ["From request to table", "Set honest expectations for reservation confirmation.", "process"], ["Planning your visit", "Answer common menu, dietary, and booking questions.", "faq"], ["Request a table", "Send a date, party size, and notes; confirmation happens separately.", "form"]],
    tagline: "Seasonal food, made for the table.",
    trustSignals: ["editable menu", "honest reservation state", "dietary-note guidance"],
    visualArchetype: "editorial dining room"
  }),
  portfolio: profile({
    audience: ["prospective clients", "creative teams", "collaborators and recruiters"],
    brandStems: ["North", "Frame", "Field", "Form"],
    brandSuffixes: ["Practice", "Works", "Direction", "Office"],
    businessType: "creative portfolio",
    differentiators: ["case-study storytelling", "bold art direction", "clear role and outcome context"],
    entities: [["Identity System", "A sample case study for a growing consumer brand.", "Brand direction"], ["Digital Launch", "A campaign experience shaped around product discovery.", "Creative lead"], ["Editorial Series", "A modular visual language for long-form stories.", "Art direction"], ["Retail Moment", "A spatial and digital concept for a seasonal launch.", "Experience"], ["Motion Study", "A restrained sequence exploring type, rhythm, and depth.", "Motion"], ["Campaign Toolkit", "A flexible system for teams working across channels.", "Systems"]],
    faq: [["Are these real client projects?", "Generated case studies are clearly editable samples until the portfolio owner supplies verified work."], ["What should a case study include?", "State the challenge, role, decisions, deliverables, and observable outcome without inflating results."], ["How can someone inquire?", "Use the contact path with project type, timing, and scope."]],
    primaryGoal: "show creative judgment and generate qualified project inquiries",
    schema: "Person",
    sectionIdeas: [["Selected direction", "Move through editable projects with keyboard-friendly controls.", "carousel"], ["How the work takes shape", "Connect research, concept, systems, craft, and delivery.", "process"], ["A practice built for collaboration", "Clarify role, working style, and the kind of problems the director takes on.", "content"], ["Project questions", "Set useful expectations before an inquiry.", "faq"]],
    tagline: "Direction with a reason behind every detail.",
    trustSignals: ["clearly marked sample work", "role clarity", "accessible project browsing"],
    visualArchetype: "cinematic typographic portfolio"
  }),
  realEstate: profile({
    audience: ["buyers", "sellers", "renters and property investors"],
    brandStems: ["Cedar", "Northline", "Harbor", "Stone"],
    brandSuffixes: ["Properties", "Residences", "Realty", "Living"],
    businessType: "real estate consultancy",
    differentiators: ["neighborhood context", "editorial property presentation", "clear consultation paths"],
    entities: [["Garden Residence", "Editable sample property with room for verified location and specifications.", "Sample listing"], ["City Loft", "A sample urban home framed around light, layout, and access.", "Sample listing"], ["Family Townhouse", "An editable example for space, storage, and neighborhood priorities.", "Sample listing"], ["Coastal Retreat", "A sample property story focused on setting and pace.", "Sample listing"], ["Investment Brief", "A consultation path for yield, condition, and local-market questions.", "Advisory"], ["Valuation Review", "A structured seller conversation before any public claim.", "Seller service"]],
    faq: [["Are the listings current?", "Generated properties are marked as editable samples until verified listing data is supplied."], ["Can I request a viewing?", "The inquiry form records interest; an agent must confirm availability."], ["Does this include a valuation?", "The site can request a consultation but should not promise a valuation outcome."]],
    primaryGoal: "help visitors explore property needs and request a consultation",
    schema: "RealEstateAgent",
    sectionIdeas: [["Explore by property goal", "Filter editable sample properties by the kind of move you are planning.", "filter"], ["Featured property stories", "Browse spacious, image-led cards with clear sample labels.", "carousel"], ["Neighborhoods are part of the decision", "Balance property detail with commute, amenities, and daily rhythm.", "content"], ["A considered buying or selling path", "Make the next steps legible without promising outcomes.", "process"], ["Questions before a viewing", "Clarify listing status, consultations, and sample content.", "faq"]],
    tagline: "Property decisions, seen in full context.",
    trustSignals: ["sample listings clearly marked", "consultation-first guidance", "no invented market claims"],
    visualArchetype: "luxury property editorial"
  }),
  hvac: profile({
    audience: ["homeowners", "property managers", "small businesses planning heating or cooling service"],
    brandStems: ["North", "Comfort", "True", "Clear"],
    brandSuffixes: ["Air", "Climate", "Home Comfort", "HVAC"],
    businessType: "heating and cooling service",
    differentiators: ["clear service areas", "maintenance guidance", "urgent-contact visibility"],
    entities: [["Heating Repair", "Assessment-led service for heating faults and uneven comfort.", "Heating"], ["Cooling Repair", "Practical diagnosis and approved repair for air-conditioning issues.", "Cooling"], ["Seasonal Maintenance", "Preventive checks focused on reliability, airflow, and efficiency.", "Maintenance"], ["System Planning", "Compare property needs, equipment options, and installation constraints.", "Planning"], ["Airflow Review", "Discuss hot spots, cold spots, filters, and indoor comfort concerns.", "Comfort"], ["Urgent Service Request", "A visible call path for time-sensitive heating or cooling problems.", "Confirm availability"]],
    faq: [["Is emergency service guaranteed?", "No. Current availability must be confirmed directly before relying on an urgent visit."], ["Which areas are covered?", "Service areas are editable samples until the business supplies its real coverage."], ["Is the booking form a confirmed appointment?", "No. It records a request until the service team confirms timing."]],
    primaryGoal: "turn heating and cooling needs into qualified service requests",
    schema: "HVACBusiness",
    sectionIdeas: [["Heating and cooling support", "Help visitors identify the relevant service without diagnosing equipment remotely.", "entities"], ["A straightforward service visit", "Explain initial questions, assessment, approval, work, and follow-up.", "process"], ["Comfort details that stay clear", "Keep coverage, availability, and credentials editable until verified.", "trust"], ["Questions before a visit", "Set honest expectations around urgency, service areas, and booking.", "faq"], ["Request HVAC service", "Capture the system issue, property type, timing, and preferred contact method.", "form"]],
    tagline: "Clear heating and cooling support for everyday comfort.",
    trustSignals: ["editable service areas", "no fabricated license claims", "honest availability state"],
    visualArchetype: "confident home-comfort utility"
  }),
  cleaning: profile({
    audience: ["homeowners", "renters", "property managers planning carpet or rug care"],
    brandStems: ["Fresh", "Clear", "Bright", "Pure"],
    brandSuffixes: ["Carpet Care", "Clean", "Home Care", "Floor Care"],
    businessType: "carpet cleaning service",
    differentiators: ["clear cleaning scope", "stain and fabric questions before booking", "honest drying-time guidance"],
    entities: [["Carpet Cleaning", "Room-by-room cleaning planned around carpet material and condition.", "Carpets"], ["Rug Care", "A careful intake for rug material, size, and stains.", "Rugs"], ["Stain Treatment", "Assessment-led treatment without promising every stain can be removed.", "Stains"], ["Upholstery Cleaning", "Editable add-on care for suitable fabric furniture.", "Furniture"], ["Move-out Cleaning", "A clearly scoped service for empty properties and handover timing.", "Move out"], ["Drying Guidance", "Practical ventilation and access notes after service.", "After care"]],
    faq: [["Will every stain come out?", "No result should be guaranteed before the material and stain are assessed."], ["How long will carpets take to dry?", "Drying varies with material, ventilation, humidity, and cleaning method; confirm an estimate with the cleaner."], ["Is the booking confirmed online?", "No. The request must be confirmed with timing and scope by the cleaning team."]],
    heroBody: "Plan carpet, rug, and upholstery care with clear scope, realistic stain guidance, and practical drying information before you book.",
    primaryGoal: "help customers choose the right carpet-cleaning service and request a scoped visit",
    schema: "ProfessionalService",
    sectionIdeas: [["Care for carpets, rugs, and rooms", "Choose a service by surface, condition, and the result you need.", "entities"], ["From stain notes to drying guidance", "Explain assessment, quotation, cleaning, and after-care in a calm sequence.", "process"], ["What can be promised honestly", "Keep stain results, drying times, and service areas clear.", "trust"], ["Questions before a cleaning visit", "Set expectations around materials, access, and confirmation.", "faq"], ["Request a cleaning visit", "Share rooms, surfaces, stains, access, and preferred timing.", "form"]],
    tagline: "Careful cleaning, clear expectations.",
    trustSignals: ["material-aware intake", "no guaranteed stain claims", "honest booking state"],
    visualArchetype: "clean textile service editorial"
  }),
  localService: profile({
    audience: ["homeowners", "property managers", "local businesses"],
    brandStems: ["North", "Ready", "True", "Clear"],
    brandSuffixes: ["Air", "Service", "Home Care", "Works"],
    businessType: "local service business",
    differentiators: ["clear service areas", "practical booking path", "urgent-contact visibility"],
    entities: [["System Check", "A structured first look at symptoms and operating conditions.", "Assessment"], ["Repair Visit", "Editable service scope for diagnosed faults and approved work.", "Repair"], ["Maintenance", "Seasonal care focused on reliability and efficiency.", "Preventive"], ["Replacement Planning", "Compare system needs, property constraints, and budget questions.", "Planning"], ["Indoor Comfort", "Discuss airflow, temperature balance, and practical comfort concerns.", "Comfort"], ["Urgent Contact", "A visible call path for time-sensitive service needs.", "Priority"]],
    faq: [["Is emergency service guaranteed?", "No. Availability must be confirmed directly and should not be implied by the static site."], ["Which areas are covered?", "Service areas are editable placeholders until the business provides its real coverage."], ["Can I book online?", "The form sends a request only after a real endpoint is configured."]],
    primaryGoal: "turn local service needs into qualified booking requests",
    schema: "ProfessionalService",
    sectionIdeas: [["Service for the problem in front of you", "Help visitors identify the right request without diagnosing remotely.", "entities"], ["A straightforward visit", "Explain assessment, approval, work, and follow-up.", "process"], ["Local details that should be clear", "Keep service areas, availability, and credentials editable until verified.", "trust"], ["Common service questions", "Set honest expectations around urgency, coverage, and booking.", "faq"], ["Request service", "Capture the issue, property type, timing, and preferred contact method.", "form"]],
    tagline: "Clear service for a more comfortable space.",
    trustSignals: ["editable service areas", "no fabricated license claims", "honest booking state"],
    visualArchetype: "confident local utility"
  }),
  legal: profile({
    audience: ["individuals", "founders", "business teams seeking legal consultation"],
    brandStems: ["Cedar", "North", "Civic", "Harbor"],
    brandSuffixes: ["Legal", "Counsel", "Law Office", "Advisory"],
    businessType: "legal consultancy",
    differentiators: ["clear matter intake", "measured language", "confidentiality-aware contact path"],
    entities: [["Business Contracts", "General contract review and drafting consultation.", "Advisory"], ["Freelance Agreements", "Scope, payment, ownership, and termination questions.", "Contracts"], ["Company Matters", "General guidance around governance and commercial documents.", "Business"], ["Dispute Planning", "A consultation to understand documents, options, and next steps.", "Review"], ["Policy Review", "Website and internal policy document consultation.", "Documents"], ["Initial Consultation", "A private path to describe the matter without sending sensitive detail publicly.", "Contact"]],
    faq: [["Is this website legal advice?", "No. It provides general information and a consultation path; advice depends on facts and jurisdiction."], ["Should confidential documents be sent through the demo form?", "No. Configure a secure intake process before accepting sensitive documents."], ["Are outcomes guaranteed?", "No legal outcome should be guaranteed."]],
    heroBody: "Understand the relevant practice areas, prepare the right questions, and request a confidential consultation without unsupported promises.",
    primaryGoal: "help visitors understand general practice areas and request a consultation",
    schema: "LegalService",
    sectionIdeas: [["Focused legal support", "Present practice areas with measured, jurisdiction-aware language.", "entities"], ["A clear consultation path", "Understand the issue, documents, urgency, and appropriate next step.", "process"], ["Careful boundaries build trust", "Keep confidentiality, credentials, and outcomes accurate and editable.", "trust"], ["Before you contact the office", "Answer practical questions without turning general information into advice.", "faq"], ["Request a consultation", "Share a brief non-confidential summary and preferred contact time.", "form"]],
    tagline: "Clear counsel starts with careful listening.",
    trustSignals: ["general-information boundary", "no outcome guarantees", "secure-intake reminder"],
    visualArchetype: "restrained professional editorial"
  }),
  watch: profile({
    audience: ["mechanical-watch enthusiasts", "design-conscious buyers", "collectors comparing movements"],
    brandStems: ["Aperture", "Meridian", "Calibre", "Vesper"],
    brandSuffixes: ["Time", "Chronograph", "Watch Co", "Atelier"],
    businessType: "mechanical watchmaker",
    differentiators: ["movement storytelling", "material and finishing detail", "clear technical specifications"],
    entities: [["Balance Assembly", "The regulating system that controls the movement's measured release of energy.", "Mechanism"], ["Layered Dial", "Applied markers, controlled depth, and a legible time display.", "Exterior"], ["Power Reserve", "A clear guide to reserve and winding behavior for the selected movement.", "Specification"], ["Case Finishing", "Brushed and polished surfaces described without unsupported material claims.", "Craft"], ["Calibration Marks", "Original SVG scale details that support the movement story.", "Detail"], ["Wearing Notes", "Practical guidance for dimensions, fit, and daily use.", "Practical"]],
    faq: [["Are the specifications final?", "No. Dimensions, materials, and movement details are editable until verified."], ["Is this a real limited edition?", "No scarcity or production claim is made without supplied evidence."], ["How is reduced motion handled?", "The static technical summary and fallback remain visible without scroll animation."]],
    heroBody: "Follow the movement from calibrated rings to the layered dial, with clear space for verified materials, dimensions, and wearing details.",
    primaryGoal: "explain the movement, finishing, and wearing character without inventing specifications",
    schema: "Product",
    sectionIdeas: [["Inside the movement", "Follow the regulating system from energy transfer to measured release.", "process"], ["The dial in layers", "See how markers, hands, depth, and finishing shape legibility.", "gallery"], ["Specifications that matter", "Compare dimensions, movement, reserve, materials, and wearing comfort clearly.", "comparison"], ["From winding to the wrist", "Connect operation, adjustment, fit, and care in a practical sequence.", "content"], ["Questions before collecting", "Understand the movement, materials, fit, and care before choosing a watch.", "faq"]],
    tagline: "Time, revealed layer by layer.",
    trustSignals: ["clear technical details", "no invented scarcity", "motion-independent specifications"],
    visualArchetype: "mechanical editorial precision"
  }),
  automotive: profile({
    audience: ["performance-car buyers", "drivers comparing body styles", "people planning a test drive"],
    brandStems: ["Apex", "Vector", "Veloce", "Radian"],
    brandSuffixes: ["Motors", "Automotive", "Performance", "Drive"],
    businessType: "performance automotive marque",
    differentiators: ["model comparison", "design and safety context", "honest test-drive requests"],
    entities: [["Grand Tourer", "Editable model concept focused on long-distance comfort.", "Sample model"], ["Track Focus", "Editable performance concept without unverified figures.", "Sample model"], ["Open Roadster", "A lightweight body-style story ready for verified specifications.", "Sample model"], ["Safety Systems", "A structured place for verified assistance and protection features.", "Confirm details"], ["Cabin Design", "Materials, controls, and ergonomics described without luxury claims.", "Interior"], ["Test Drive", "A request path that requires direct confirmation.", "Request only"]],
    faq: [["Are performance figures verified?", "No figures are presented as factual until supplied by the manufacturer."], ["Is a test drive confirmed online?", "No. The form records a request that the retailer must confirm."], ["Are these real models?", "Generated model names and specifications are editable samples."]],
    primaryGoal: "help visitors compare automotive concepts and request a confirmed test drive",
    schema: "AutoDealer",
    sectionIdeas: [["Compare the body styles", "Review editable model concepts by use, layout, and driving character.", "carousel"], ["Performance with context", "Explain handling, braking, safety, and comfort without fabricated numbers.", "comparison"], ["Light across the body", "Use a restrained visual sequence to reveal proportion and surface.", "gallery"], ["From interest to test drive", "Make the request and confirmation path explicit.", "process"], ["Request a test drive", "Share a preferred model and time; confirmation happens separately.", "form"]],
    tagline: "Performance shaped around the drive.",
    trustSignals: ["sample models labeled", "no fabricated figures", "honest test-drive state"],
    visualArchetype: "cinematic automotive performance"
  }),
  beauty: profile({
    audience: ["beauty shoppers", "skincare beginners", "customers comparing cosmetic routines"],
    brandStems: ["Luma", "Petal", "Vela", "Mira"],
    brandSuffixes: ["Beauty", "Ritual", "Skin", "Edit"],
    businessType: "beauty and skincare store",
    differentiators: ["routine-led discovery", "clear sample-product labels", "ingredient and suitability prompts"],
    entities: [["Mascara Edit", "Sample mascara products grouped by finish and brush preference.", "Prototype products"], ["Daily Cleanse", "Editable cleanser category for different routine needs.", "Skincare"], ["Hydration Layer", "Sample moisturizers and serums without treatment promises.", "Skincare"], ["Color Essentials", "Editable cosmetic categories organized by use and finish.", "Cosmetics"], ["Routine Builder", "A simple order-of-use guide that avoids medical claims.", "Guide"], ["Patch-Test Note", "Encourage label review and professional advice for reactions.", "Safety"]],
    faq: [["Are these products in stock?", "No. Generated products are prototype content until connected to verified inventory."], ["Does this replace skin advice?", "No. Product copy should not diagnose or treat skin conditions."], ["How are sample images labeled?", "Prototype providers and local fallbacks are recorded in the project contract."]],
    heroBody: "Explore a considered routine by texture, finish, and order of use, with clear product boundaries and no unverified treatment claims.",
    primaryGoal: "help shoppers explore editable beauty categories without presenting prototype data as inventory",
    schema: "Store",
    sectionIdeas: [["Build a considered routine", "Explore cleansing, hydration, color, and finishing categories in a practical order.", "process"], ["Beauty categories", "Browse editable sample products with their prototype state visible.", "filter"], ["Texture and finish", "Use relevant editorial media to distinguish product experiences.", "gallery"], ["Before you choose", "Keep ingredient, suitability, and patch-test questions visible.", "faq"]],
    tagline: "A clearer way to shape your ritual.",
    trustSignals: ["prototype inventory labeled", "no treatment claims", "image sources recorded"],
    visualArchetype: "elegant beauty editorial"
  }),
  greetingCard: profile({
    audience: ["occasion shoppers", "gift buyers", "people looking for a personal message"],
    brandStems: ["Kind", "Paper", "Dear", "Little"],
    brandSuffixes: ["Post", "Note", "Card Co", "Letter"],
    businessType: "greeting card store",
    differentiators: ["occasion-led discovery", "personal message guidance", "clear paper and delivery details"],
    entities: [["Birthday Notes", "Warm, editable card ideas for different ages and relationships.", "Birthday"], ["Anniversary Cards", "Thoughtful designs with room for a personal message.", "Anniversary"], ["Thank-you Cards", "Simple cards for gratitude without generic filler.", "Thank you"], ["New Baby", "Gentle designs for welcoming a new arrival.", "Milestone"], ["Personalized Message", "A clear place to add names and a short note.", "Personalize"], ["Paper and Envelope", "Editable paper weight, finish, size, and envelope details.", "Materials"]],
    faq: [["Can I personalize a card?", "Personalization options are editable and should be confirmed before checkout."], ["What paper is used?", "Publish only verified paper weight, finish, and print details."], ["When will it arrive?", "Delivery timing must be confirmed by the store for the destination and order date."]],
    heroBody: "Find a card by occasion and tone, then shape a personal message with clear paper, envelope, and delivery details.",
    primaryGoal: "help shoppers find an occasion-appropriate card and add a meaningful message",
    schema: "Store",
    sectionIdeas: [["Find the right occasion", "Browse cards by moment, recipient, and tone.", "filter"], ["A small note can carry a lot", "Use a restrained card grid with editable message prompts.", "carousel"], ["Make it personal", "Explain names, short notes, paper, and envelope choices clearly.", "process"], ["Before you send it", "Keep personalization and delivery expectations honest.", "faq"]],
    tagline: "A thoughtful note for every moment.",
    trustSignals: ["paper details", "personalization guidance", "honest delivery state"],
    visualArchetype: "restrained paper craft editorial"
  }),
  fashion: profile({
    audience: ["fashion shoppers", "footwear buyers", "people comparing apparel and accessories"],
    brandStems: ["Form", "Rove", "Thread", "North"],
    brandSuffixes: ["Wear", "Supply", "Collection", "Goods"],
    businessType: "fashion and footwear store",
    differentiators: ["category accuracy", "responsive editorial media", "honest sample inventory"],
    entities: [["Everyday Sneakers", "Editable footwear examples for fit and styling context.", "Footwear"], ["Layered Clothing", "Sample apparel organized by use and season.", "Clothing"], ["Carry Collection", "Backpacks and accessories kept in their correct category.", "Accessories"], ["Material Notes", "A place for verified fabric and care details.", "Confirm details"], ["Fit Guide", "Editable sizing guidance that should match verified availability.", "Guide"], ["New Edit", "A clearly marked sample collection for visual merchandising.", "Prototype products"]],
    faq: [["Is inventory live?", "No. Sample products must be replaced or connected to verified inventory."], ["Are sizes guaranteed?", "No. Publish only size information supplied by the retailer."], ["Where do images come from?", "Provider, semantic category, fallback, and prototype status are recorded in HASSALI.md."]],
    primaryGoal: "present fashion categories accurately and guide shoppers toward verified product details",
    schema: "ClothingStore",
    sectionIdeas: [["Shop by how you wear it", "Separate footwear, clothing, and accessories into accurate browsing paths.", "filter"], ["The current edit", "Use responsive imagery and editable sample products for visual merchandising.", "carousel"], ["Fit, fabric, and care", "Keep decision details legible before a shopper commits.", "comparison"], ["Questions before checkout", "Clarify inventory, sizing, returns, and prototype content.", "faq"]],
    tagline: "Useful pieces, styled with intention.",
    trustSignals: ["category-correct imagery", "sample inventory labeled", "editable fit guidance"],
    visualArchetype: "clean fashion editorial"
  }),
  developerCommunity: profile({
    audience: ["software learners", "working developers", "community organizers"],
    brandStems: ["Build", "Patch", "Local", "Open"],
    brandSuffixes: ["Circle", "Guild", "Commons", "Room"],
    businessType: "developer community",
    differentiators: ["welcoming member paths", "fictional avatars clearly labeled", "practical learning exchange"],
    entities: [["Build Sessions", "Small working sessions around real project problems.", "Learn together"], ["Code Review Circle", "A respectful place to improve maintainability and testing.", "Peer practice"], ["Starter Paths", "Beginner-friendly topics with exact next steps.", "Learning"], ["Project Exchange", "Share clearly scoped ideas without claiming ownership or outcomes.", "Community"], ["Member Placeholders", "Deterministic fictional avatars that are not real-person claims.", "Sample profiles"], ["Community Notes", "Editable expectations for conduct, privacy, and moderation.", "Guidance"]],
    faq: [["Are these real members?", "No. Generated avatars and profiles are fictional placeholders."], ["Is participation free?", "No access or pricing promise is made until the community owner confirms it."], ["How is conduct handled?", "Publish a real moderation and privacy policy before launch."]],
    primaryGoal: "help developers understand the community and find a suitable way to participate",
    schema: "Organization",
    sectionIdeas: [["Find your way in", "Choose a learning, review, or project-sharing path.", "entities"], ["Meet sample members", "Use deterministic fictional avatars without presenting them as real people.", "carousel"], ["How a session works", "Move from a clear problem to a respectful, useful exchange.", "process"], ["Community questions", "Clarify membership, conduct, and placeholder content.", "faq"]],
    tagline: "A calmer place to build together.",
    trustSignals: ["fictional profiles labeled", "editable conduct policy", "beginner-friendly paths"],
    visualArchetype: "playful developer network"
  }),
  technology: profile({
    audience: ["business leaders", "product teams", "operations teams"],
    brandStems: ["Signal", "North", "Arc", "Clear"],
    brandSuffixes: ["Technology", "Systems", "Digital", "Labs"],
    businessType: "technology consultancy",
    differentiators: ["practical system planning", "measured implementation", "clear handover"],
    entities: [["Product Discovery", "Turn a business problem into a testable delivery scope.", "Strategy"], ["System Design", "Choose boundaries, data flows, and operational ownership.", "Architecture"], ["Web Delivery", "Build accessible, maintainable customer and internal tools.", "Engineering"], ["Automation Review", "Find repetitive work worth automating without adding fragile complexity.", "Operations"], ["Modernization", "Plan safe improvements around existing systems and constraints.", "Migration"], ["Team Enablement", "Documentation, handover, and practical capability building.", "Support"]],
    faq: [["How does an engagement start?", "Begin with goals, constraints, current systems, and one measurable outcome."], ["Do you promise a fixed result?", "No. Scope, assumptions, and delivery risks should be agreed before work begins."], ["Can this site take project requests?", "Yes after a real form endpoint and privacy notice are configured."]],
    primaryGoal: "turn technology needs into qualified discovery conversations",
    schema: "ProfessionalService",
    sectionIdeas: [["Technology shaped around the work", "Start with operating reality, not a fashionable stack.", "entities"], ["From uncertainty to a buildable plan", "Move through discovery, architecture, delivery, and handover.", "process"], ["Tradeoffs made visible", "Compare speed, cost, maintainability, and operational risk.", "comparison"], ["Questions before discovery", "Set clear expectations for scope and collaboration.", "faq"], ["Start a project conversation", "Share the problem, constraints, and desired outcome.", "form"]],
    tagline: "Useful systems, built around real constraints.",
    trustSignals: ["explicit tradeoffs", "documented handover", "no invented client claims"],
    visualArchetype: "precise technical editorial"
  })
};

function profile(input: DomainProfile): DomainProfile {
  return input;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function selectProfile(input: { plan: WebsitePlan; prompt: string; semantic: WebsiteSemanticResolution }) {
  const text = normalize(`${input.prompt} ${input.plan.sourceOfTruthDomain ?? ""} ${input.plan.industry}`);

  if (input.semantic.capabilities.some((value) => value === "interior_design" || value === "architecture")) {
    return genericSemanticProfile(input.prompt, input.plan);
  }
  if (/\b(?:tv|television|oled|qled|home cinema|electronics)\b/.test(text)) return profiles.television;
  if (/\b(?:dental|dentist|dentistry)\b/.test(text)) return profiles.dental;
  if (/\b(?:crm|customer relationship|sales pipeline|financial workflow|invoice workflow|billing workflow)\b/.test(text)) return profiles.crm;
  if (/\b(?:toy|toys|plush|building blocks)\b/.test(text)) return profiles.toy;
  if (/\b(?:greeting card|birthday card|anniversary card|occasion cards?|card shop|card store)\b/.test(text)) return profiles.greetingCard;
  if (/\b(?:restaurant|dining|menu|cafe|seafood)\b/.test(text)) return profiles.restaurant;
  if (/\b(?:portfolio|creative director|art director|graphic designer|product designer)\b/.test(text)) return profiles.portfolio;
  if (/\b(?:real estate|realty|property|properties|realtor)\b/.test(text)) return profiles.realEstate;
  if (/\b(?:watch|timepiece|horology|mechanical movement)\b/.test(text)) return profiles.watch;
  if (/\b(?:car|automotive|vehicle|sports car|sports-car)\b/.test(text)) return profiles.automotive;
  if (/\b(?:beauty|cosmetic|mascara|skincare|skin care)\b/.test(text)) return profiles.beauty;
  if (/\b(?:fashion|footwear|sneaker|clothing|backpack)\b/.test(text)) return profiles.fashion;
  if (/\b(?:developer community|developer-community|coding community)\b/.test(text)) return profiles.developerCommunity;
  if (/\b(?:hvac|heating|cooling|air conditioning)\b/.test(text)) return profiles.hvac;
  if (/\b(?:cleaning service|carpet cleaning|rug cleaning|carpet cleaner)\b/.test(text)) return profiles.cleaning;
  if (/\b(?:local service)\b/.test(text)) return profiles.localService;
  if (/\b(?:legal|lawyer|law firm|law office|attorney)\b/.test(text)) return profiles.legal;
  if (/\b(?:technology consultancy|tech consultancy|software consultancy|digital consultancy)\b/.test(text)) return profiles.technology;
  if (input.plan.industry === "portfolio") return profiles.portfolio;
  if (input.plan.industry === "real_estate") return profiles.realEstate;
  if (input.plan.industry === "dental_clinic") return profiles.dental;
  if (input.plan.industry === "crm_software") return profiles.crm;
  if (input.plan.industry === "saas" || input.plan.industry === "ai_product") return profiles.technology;
  if (input.plan.industry === "restaurant" || input.plan.industry === "seafood_restaurant") return profiles.restaurant;
  if (input.plan.industry === "ecommerce") return genericSemanticProfile(input.prompt, input.plan);
  return genericSemanticProfile(input.prompt, input.plan);
}

function genericSemanticProfile(prompt: string, plan: WebsitePlan): DomainProfile {
  const semantic = inferSemanticDomain(prompt);
  const internalCapabilities = new Set(["local_service", "product_showcase", "professional_practice", "technical_product"]);
  const usefulCapabilities = semantic.capabilities
    .filter((value) => value.length > 2 && !internalCapabilities.has(value))
    .slice(0, 8);
  const fallbackLabel = cleanBrand(plan.sourceOfTruthDomain ?? plan.industry) ?? "independent business";
  const label = semantic.source === "generic_fallback" ? fallbackLabel : semantic.label;
  const businessType = label.toLowerCase();
  const entityTerms = [...semantic.products, ...semantic.services].slice(0, 8);
  const focusTerms = entityTerms.length > 0 ? entityTerms : usefulCapabilities.length > 0 ? usefulCapabilities : ["offer", "experience", "craft"];
  const model = semantic.businessModels[0]?.replace(/_/g, " ") ?? "independent business";
  const primaryNiche = semantic.subNiche ?? semantic.niche ?? label;
  const visualSubject = semantic.visualSubjects.slice(0, 3).join(", ") || `${primaryNiche} details`;
  const entityDescription = (term: string, index: number) => {
    const capability = usefulCapabilities[index % Math.max(1, usefulCapabilities.length)] ?? "practical detail";
    return `Explore ${term.toLowerCase()} through clear ${capability.replace(/_/g, " ")} guidance, useful comparisons, and an honest next step.`;
  };

  return profile({
    audience: semantic.audiences,
    brandStems: semantic.label.split(/\s+/).filter((part) => part.length > 2).slice(0, 2).map(titleCase).concat(["North", "Morrow"]),
    brandSuffixes: ["Studio", "Works", "House", "Collective"],
    businessType,
    differentiators: uniqueStrings([
      ...semantic.capabilities.slice(0, 2).map((value) => `clear ${value.replace(/_/g, " ")} guidance`),
      semantic.businessModels.includes("custom_build") ? "choices shaped around the customer's requirements" : "a direct path from comparison to inquiry",
      "business facts kept honest until confirmed"
    ]).slice(0, 4),
    entities: focusTerms.slice(0, 8).map((term, index) => [titleCase(term), entityDescription(term, index), index < semantic.products.length ? "Product" : "Service"]),
    faq: [
      ["What should I compare first?", `Start with ${focusTerms.slice(0, 3).join(", ")}, then confirm the specifications or service details that affect your decision.`],
      ["How can I choose the right option?", `Use the ${usefulCapabilities.slice(0, 3).map((value) => value.replace(/_/g, " ")).join(", ") || "practical"} guidance, then ask about your specific requirements.`],
      ["How can I confirm current details?", "Use the inquiry path for current pricing, availability, timing, and terms."]
    ],
    primaryGoal: `present ${label} with relevant ${model} context and turn interest into a qualified inquiry`,
    schema: semantic.businessModels.includes("retail") ? "Store" : semantic.businessModels.includes("professional_practice") ? "ProfessionalService" : "Organization",
    sectionIdeas: [
      [`Explore ${primaryNiche}`, `Start with the products, services, and choices that define this ${businessType}.`, semantic.products.length ? "entities" : "content"],
      ["Choose with useful context", `Compare the details, materials, performance, or outcomes that matter for ${primaryNiche.toLowerCase()}.`, "comparison"],
      ["How the work comes together", `Follow a clear ${model} path from first interest to a confirmed next step.`, "process"],
      ["Details worth checking", "Review the practical questions and trust signals that shape a confident decision.", "trust"],
      ["Common questions", `Get direct guidance about ${focusTerms.slice(0, 3).join(", ")}.`, "faq"]
    ],
    tagline: `${titleCase(primaryNiche)}, made easier to understand.`,
    trustSignals: semantic.trustSignals.length ? semantic.trustSignals : ["clear specifications or scope", "honest availability boundaries", "direct inquiry and confirmation"],
    visualArchetype: visualSubject
  });
}

function hash(value: string) {
  return Array.from(value).reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 17);
}

function cleanBrand(value: string | null | undefined) {
  const cleaned = value?.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  if (!cleaned || /^(?:business|website|unknown|generic|current prompt)$/i.test(cleaned)) return null;
  return cleaned.replace(/\b(?:studio)\b$/i, "").trim() || null;
}

function generatedBrand(profileValue: DomainProfile, seed: string) {
  const number = hash(seed);
  return `${profileValue.brandStems[number % profileValue.brandStems.length]} ${profileValue.brandSuffixes[(number >>> 3) % profileValue.brandSuffixes.length]}`;
}

function logoBlueprint(brandName: string, profileValue: DomainProfile, domainId: string | null): WebsiteLogoBlueprint {
  const words = brandName.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || brandName.slice(0, 2).toUpperCase();
  const text = `${domainId ?? ""} ${profileValue.businessType}`.toLowerCase();
  const variant = hash(`${brandName}:${text}`) % 4;

  if (/greeting card|paper/.test(text)) return { initials, style: "monogram", symbol: "cards", variant };
  if (/toy/.test(text)) return { initials, style: "symbol_wordmark", symbol: "blocks", variant };
  if (/skincare|beauty|cosmetic/.test(text)) return { initials, style: "wordmark_mark", symbol: "drop", variant };
  if (/television|electronics/.test(text)) return { initials, style: "emblem", symbol: "display", variant };
  if (/watch|timepiece|horology/.test(text)) return { initials, style: "emblem", symbol: "dial", variant };
  if (/legal|law/.test(text)) return { initials, style: "monogram", symbol: "legal_seal", variant };
  if (/crm|technology|software/.test(text)) return { initials, style: "lettermark", symbol: "orbit", variant };
  return { initials, style: "lettermark", symbol: "spark", variant };
}

function extractHexColors(prompt: string) {
  return Array.from(new Set(prompt.match(/#[0-9a-f]{6}\b/gi)?.map((color) => color.toUpperCase()) ?? []));
}

function paletteFrom(input: { direction: WebsiteCreativeDirection; intent: IntentIntelligence; prompt: string }): WebsitePalette {
  const exact = extractHexColors(input.prompt);
  const wantsWhite = /\bwhite\b/i.test(input.prompt);
  const wantsBlack = /\bblack\b/i.test(input.prompt);

  if (exact.length > 0) {
    const colors = [...exact, ...(wantsWhite ? ["#FFFFFF"] : []), ...(wantsBlack ? ["#000000"] : [])];
    return {
      accent: colors[2] ?? colors[0],
      accentAlt: colors[3] ?? colors[2] ?? colors[0],
      background: colors[1] ?? (wantsWhite ? "#FFFFFF" : colors[0]),
      border: colors[2] ?? colors[0],
      ink: wantsBlack ? "#000000" : colors[0],
      muted: colors[0],
      surface: wantsWhite ? "#FFFFFF" : colors[1] ?? colors[0]
    };
  }

  const p = input.direction.palette;
  return {
    accent: p.accent,
    accentAlt: p.primary,
    background: p.background,
    border: p.border,
    ink: p.text,
    muted: p.mutedText,
    surface: p.surface
  };
}

function typographyFor(profileValue: DomainProfile, intent: IntentIntelligence): WebsiteTypography {
  const text = `${profileValue.visualArchetype} ${intent.visualStyle.join(" ")} ${intent.typographyTone.join(" ")}`.toLowerCase();
  if (/editorial|luxury|legal|restaurant|real estate/.test(text)) {
    return { body: 'Inter, "Segoe UI", Arial, sans-serif', display: 'Georgia, "Times New Roman", serif', personality: "editorial" };
  }
  if (/toy|playful|friendly/.test(text)) {
    return { body: '"Trebuchet MS", "Segoe UI", Arial, sans-serif', display: '"Trebuchet MS", "Segoe UI", Arial, sans-serif', personality: "friendly" };
  }
  if (/technology|crm|technical|saas/.test(text)) {
    return { body: 'Inter, "Segoe UI", Arial, sans-serif', display: 'Inter, "Segoe UI", Arial, sans-serif', personality: "technical" };
  }
  return { body: 'Inter, "Segoe UI", Arial, sans-serif', display: '"Helvetica Neue", Arial, sans-serif', personality: "modern" };
}

function pagePath(page: string) {
  return page === "home" ? "index.html" : `${page}.html`;
}

function titleCase(value: string) {
  return value.split(/[-_\s]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function visitorBody(profileValue: DomainProfile) {
  if (profileValue.heroBody && !isInternalVisitorCopy(profileValue.heroBody)) return sentenceCase(profileValue.heroBody);
  const choices = profileValue.entities.slice(0, 3).map(([label]) => label);
  const finalChoice = choices.pop();
  const choiceText = choices.length > 0 && finalChoice
    ? `${choices.join(", ")}, and ${finalChoice}`
    : finalChoice ?? profileValue.businessType;
  const qualities = profileValue.differentiators.slice(0, 2).join(" and ");
  return `Explore ${choiceText} with ${qualities || "clear information"}, useful context, and a confident next step.`;
}

function sentenceCase(value: string) {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0]?.toUpperCase() ?? ""}${trimmed.slice(1)}` : trimmed;
}

function isInternalVisitorCopy(value: string) {
  return /why should i consider this|help (?:shoppers|customers|users)\\b|confirm (?:the )?photographer credit|(?:current prompt|selected composition|content strategy|hero goal|visual archetype|quality blueprint)/i.test(value);
}

function visitorCopy(input: {
  brandName: string;
  ctas: { primary: string; secondary: string };
  page: string;
  primaryCta: string;
  profile: DomainProfile;
}): WebsiteVisitorCopy {
  const label = titleCase(input.page);
  const home = input.page === "home";
  let body = visitorBody(input.profile);
  let heading = input.profile.tagline;

  if (!home) {
    heading = `${label} at ${input.brandName}`;
    if (/contact|appointment|booking|reservation/.test(input.page)) {
      body = "Share what you need, your preferred timing, and the best way to follow up. A real team member should confirm every request directly.";
    } else if (/product|shop|menu|listing|work|portfolio|service|feature|dashboard/.test(input.page)) {
      const choices = input.profile.entities.slice(0, 3).map(([item]) => item).join(", ");
      body = `Explore ${choices} with clear details and honest guidance about what should be confirmed before you decide.`;
    } else if (/about|story|company|team/.test(input.page)) {
      body = `${input.brandName} brings ${input.profile.differentiators.slice(0, 3).join(", ")} to every part of the experience.`;
    }
  }

  return {
    body,
    eyebrow: titleCase(input.profile.businessType),
    heading,
    primaryCta: input.primaryCta,
    secondaryCta: home ? input.ctas.secondary : `Return to ${input.brandName}`
  };
}

function itemList(profileValue: DomainProfile) {
  return profileValue.entities.map(([label, description, meta]) => ({ detail: description, meta, title: label }));
}

function createSection(input: {
  body: string;
  eyebrow?: string;
  id: string;
  items: WebsiteSectionBlueprint["items"];
  kind: WebsiteSectionKind;
  title: string;
}): WebsiteSectionBlueprint {
  return {
    eyebrow: input.eyebrow ?? (input.kind === "form" ? "Request" : input.kind === "faq" ? "Questions" : titleCase(input.kind)),
    ...input
  };
}

function pageSections(input: { page: string; profile: DomainProfile }) {
  const entities = itemList(input.profile);
  const processItems = [
    {
      detail: `Start with the visitor's priorities and the ${input.profile.businessType} outcome they need.`,
      title: "Define the need"
    },
    {
      detail: `Compare the relevant options using clear scope, material, performance, or service details.`,
      title: "Compare the fit"
    },
    {
      detail: "Confirm current availability, timing, specifications, and terms directly before deciding.",
      title: "Confirm current information"
    },
    {
      detail: "Continue through the primary inquiry or purchase path without losing the context gathered so far.",
      title: "Take the next step"
    }
  ];
  const trustItems = input.profile.trustSignals.map((signal) =>
    visitorTrustSignal(signal, input.profile.businessType)
  );
  const core = input.profile.sectionIdeas.map(([title, body, kind], index) => createSection({
    body,
    eyebrow: titleCase(input.profile.businessType),
    id: `${input.page}-${kind}-${index + 1}`,
    items: kind === "faq"
      ? input.profile.faq.map(([question, answer]) => ({ detail: answer, title: question }))
      : kind === "process"
        ? processItems
        : kind === "trust"
          ? trustItems
          : kind === "comparison"
            ? entities.slice(0, 4)
            : kind === "gallery"
              ? entities.slice(index % Math.max(1, entities.length), index % Math.max(1, entities.length) + 6)
              : entities,
    kind,
    title
  }));

  if (input.page === "home") {
    return core.filter((section) => section.items.length > 0 || section.kind === "form");
  }

  const pageName = titleCase(input.page);
  if (/contact|appointment|booking|reservation/.test(input.page)) {
    return [
      createSection({ body: `Share enough information for a useful ${input.profile.businessType} response without sending sensitive data.`, id: `${input.page}-form`, items: [], kind: "form", title: `${pageName} request` }),
      createSection({ body: `See how a ${input.profile.businessType} request moves from initial details to direct confirmation.`, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-process`, items: entities.slice(0, 4), kind: "process", title: `How ${pageName.toLowerCase()} is confirmed` }),
      createSection({ body: `Review the practical ${input.profile.businessType} boundaries before sending an inquiry.`, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-faq`, items: input.profile.faq.map(([title, detail]) => ({ detail, title })), kind: "faq", title: `${pageName} questions` })
    ];
  }
  if (/product|shop|menu|listing|work|portfolio|service|feature|dashboard/.test(input.page)) {
    return core.slice(0, 4).map((section) => ({ ...section, id: `${input.page}-${section.kind}-${section.id.split("-").pop()}` }));
  }
  return [
    createSection({ body: `Understand the choices and working principles behind this ${input.profile.businessType}.`, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-story`, items: entities.slice(0, 3), kind: "content", title: `${pageName} and ${input.profile.tagline.toLowerCase()}` }),
    createSection({ body: input.profile.sectionIdeas[1]?.[1] ?? input.profile.primaryGoal, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-process`, items: entities.slice(0, 5), kind: "process", title: input.profile.sectionIdeas[1]?.[0] ?? `${pageName} process` }),
    createSection({ body: `Understand the details that shape a confident ${input.profile.businessType} decision.`, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-trust`, items: input.profile.trustSignals.map((signal) => visitorTrustSignal(signal, input.profile.businessType)), kind: "trust", title: `${pageName} details` }),
    createSection({ body: input.profile.faq[0]?.[1] ?? input.profile.primaryGoal, eyebrow: titleCase(input.profile.businessType), id: `${input.page}-faq`, items: input.profile.faq.map(([title, detail]) => ({ detail, title })), kind: "faq", title: `${pageName} questions` })
  ];
}

function visitorTrustSignal(signal: string, businessType: string) {
  const normalized = signal.toLowerCase().trim();
  const exact: Record<string, { detail: string; title: string }> = {
    "general-information boundary": {
      detail: "Understand what the initial information can clarify and when tailored legal advice requires a direct consultation.",
      title: "Clear legal information"
    },
    "no outcome guarantees": {
      detail: "Receive a realistic explanation of process, options, and uncertainty without promises about a particular result.",
      title: "Honest expectations"
    },
    "secure-intake reminder": {
      detail: "Start with only the information needed for an initial inquiry, then use the firm's confirmed confidential intake process.",
      title: "Careful initial inquiry"
    }
  };
  if (exact[normalized]) return exact[normalized];

  const title = normalized
    .replace(/^editable\s+/, "Current ")
    .replace(/^sample\s+/, "Representative ")
    .replace(/^prototype\s+/, "Featured ")
    .replace(/^no fabricated\s+/, "Verified ")
    .replace(/^no invented\s+/, "Clear ")
    .replace(/^honest\s+/, "Clear ")
    .replace(/-/g, " ");

  return {
    detail: `Ask how this ${businessType} detail applies to the option, service, or project you are considering.`,
    title: titleCase(title)
  };
}

function domainCtas(profileValue: DomainProfile) {
  const text = profileValue.businessType.toLowerCase();
  if (/watch/.test(text)) return { primary: "Explore the movement", secondary: "Review specifications" };
  if (/television/.test(text)) return { primary: "Compare screen technology", secondary: "Plan your room" };
  if (/dental/.test(text)) return { primary: "Request an appointment", secondary: "Understand the visit" };
  if (/crm/.test(text)) return { primary: "Request a product demo", secondary: "See the workflow" };
  if (/toy/.test(text)) return { primary: "Browse toy categories", secondary: "Find a gift by age" };
  if (/restaurant/.test(text)) return { primary: "Explore the menu", secondary: "Request a table" };
  if (/portfolio/.test(text)) return { primary: "View selected work", secondary: "Discuss a project" };
  if (/real estate/.test(text)) return { primary: "Browse sample properties", secondary: "Request a viewing" };
  if (/automotive/.test(text)) return { primary: "Compare the models", secondary: "Request a test drive" };
  if (/beauty/.test(text)) return { primary: "Explore the beauty edit", secondary: "Build a routine" };
  if (/greeting card/.test(text)) return { primary: "Browse by occasion", secondary: "Personalize a card" };
  if (/fashion/.test(text)) return { primary: "Browse the collection", secondary: "Review fit guidance" };
  if (/developer community/.test(text)) return { primary: "Find a community path", secondary: "Meet sample members" };
  if (/legal/.test(text)) return { primary: "Request a consultation", secondary: "Review practice areas" };
  if (/technology/.test(text)) return { primary: "Plan a discovery call", secondary: "Review capabilities" };
  if (/hvac|local service/.test(text)) return { primary: "Request service guidance", secondary: "Review service options" };
  return { primary: `Explore ${profileValue.businessType}`, secondary: "Review the details" };
}

export function buildWebsiteSceneBlueprint(input: { cinematicSequenceRequired: boolean; domainId: string | null; palette: WebsitePalette; profile: Pick<DomainProfile, "businessType">; projectName: string; prompt: string; semantic: SemanticDomainEvidence }): WebsiteSceneBlueprint {
  const spec = buildWebsite3DSceneSpec({
    businessType: input.profile.businessType,
    cinematicSequenceRequired: input.cinematicSequenceRequired,
    domainId: input.domainId,
    palette: [input.palette.ink, input.palette.surface, input.palette.accent, input.palette.accentAlt],
    projectName: input.projectName,
    prompt: input.prompt,
    semantic: input.semantic
  });
  const recipeObjects: Record<Website3DSceneRecipe, WebsiteSceneObject[]> = {
    abstract_motion: [{ colorRole: "accent", count: spec.variation.layerCount, kind: "plane", motion: "slide" }, { colorRole: "accent-alt", count: 2, kind: "ring", motion: "orbit" }],
    architectural_volume: [{ colorRole: "surface", count: spec.variation.layerCount, kind: "building", motion: "slide" }, { colorRole: "accent", count: 3, kind: "plane", motion: "float" }],
    card_data_journey: [{ colorRole: "surface", count: Math.min(6, spec.variation.layerCount), kind: "card", motion: "slide" }, { colorRole: "accent", count: 3, kind: "connector", motion: "float" }],
    material_orbit: [{ colorRole: "surface", count: 1, kind: "vessel", motion: "rotate" }, { colorRole: "accent", count: Math.min(5, spec.variation.layerCount), kind: "orb", motion: "orbit" }],
    mechanical_precision: [{ colorRole: "ink", count: Math.min(5, spec.variation.layerCount), kind: "dial", motion: "rotate" }, { colorRole: "accent", count: 2, kind: "wheel", motion: "rotate" }],
    none: [],
    product_pedestal: [{ colorRole: "surface", count: 1, kind: "vessel", motion: "rotate" }, { colorRole: "accent", count: 2, kind: "ring", motion: "float" }],
    screen_light_stage: [{ colorRole: "ink", count: Math.min(4, spec.variation.layerCount), kind: "display", motion: "slide" }, { colorRole: "accent", count: 3, kind: "plane", motion: "slide" }],
    spatial_brand_world: [{ colorRole: "surface", count: spec.variation.layerCount, kind: "plane", motion: "slide" }, { colorRole: "accent-alt", count: 2, kind: "ring", motion: "orbit" }]
  };
  const purposes: Record<Website3DSceneRecipe, WebsiteSceneBlueprint["purpose"]> = {
    abstract_motion: "ambient_field",
    architectural_volume: "architectural_scene",
    card_data_journey: "ui_journey",
    material_orbit: "hero_product_stage",
    mechanical_precision: "mechanism_explainer",
    none: "ambient_field",
    product_pedestal: "hero_product_stage",
    screen_light_stage: "comparison_scene",
    spatial_brand_world: "scroll_story"
  };
  const fallbackAsset = `assets/${spec.id}-fallback.svg`;
  const scrollTimeline: WebsiteSceneTimelineStep[] = spec.interaction.scrollDriven
    ? spec.scrollStages.map((stage, index) => ({
        end: `${Math.round(stage.progressEnd * 100)}%`,
        objectsAffected: [stage.objectAction ?? "scene composition"],
        pin: false,
        reducedMotionBehavior: "Show the designed static composition and preserve all text.",
        scrub: true,
        start: `${Math.round(stage.progressStart * 100)}%`,
        textAffected: [stage.contentCue ?? `scene chapter ${index + 1}`],
        trigger: `#${spec.placement.sectionId}`
      }))
    : [];

  return {
    assets: spec.enabled ? [{ id: `${spec.id}-fallback`, path: fallbackAsset, role: "fallback" }] : [],
    camera: { far: 80, fov: spec.camera.fieldOfView, near: 0.1, position: spec.camera.initialPosition },
    domainId: input.domainId,
    engine: spec.enabled ? "three" : "none",
    fallback: { asset: fallbackAsset, behavior: spec.fallback.description },
    id: spec.id,
    lighting: { ambient: 0.58 * spec.lighting.exposure, key: 1.08 * spec.lighting.exposure, rim: 0.68 * spec.lighting.exposure },
    lowPowerPolicy: { disableShadows: true, particleScale: 0.25, pixelRatio: 1 },
    materials: [{ colorRole: "accent", finish: spec.materials.finish === "metallic" ? "metal" : spec.materials.finish === "glass" ? "glass" : "matte" }, { colorRole: "surface", finish: spec.materials.finish === "mixed" ? "glass" : "matte" }],
    mobilePolicy: { allowPinning: false, particleScale: 0.25, pixelRatio: 1, useFallbackBelow: 560 },
    motionEngine: spec.enabled ? "native" : "none",
    mountSectionId: spec.placement.sectionId,
    mountSelector: `[data-scene-id="${spec.id}"]`,
    objects: recipeObjects[spec.recipe],
    pagePath: spec.placement.page,
    performanceBudget: { maxDrawCalls: 18, maxObjects: Math.min(36, 8 + recipeObjects[spec.recipe].reduce((total, item) => total + item.count, 0)), maxPixelRatio: spec.performance.maxDevicePixelRatio },
    pointerInteraction: spec.enabled && spec.interaction.pointerReactive ? { enabled: true, strength: 0.08 } : null,
    purpose: purposes[spec.recipe],
    qualityTier: spec.enabled ? spec.performance.desktopTier === "full" ? "premium" : "standard" : "minimal",
    recipe: spec.recipe,
    reducedMotionPolicy: { showFallback: true, skipPinning: true, stopContinuousMotion: true },
    requirement: spec.requirement,
    scrollTimeline,
    spec
  };
}

function webglPolicy(scene: WebsiteSceneBlueprint) {
  return {
    enabled: scene.engine === "native_webgl" || scene.engine === "three",
    fallbackAsset: scene.fallback.asset,
    intensity: scene.qualityTier === "premium" ? "standard" as const : "restrained" as const,
    reason: scene.engine === "none" ? scene.requirement === "forbidden" ? "Disabled by the current user request." : "No meaningful 3D experience was requested." : `Section-scoped ${scene.recipe} with semantic content and a static fallback.`,
    strategy: scene.engine === "three" ? "three-r185-scroll-story" as const : scene.requirement === "forbidden" ? "disabled-by-request" as const : "not-requested" as const
  };
}

export function buildWebsiteQualityBlueprint(input: {
  brief?: WebsiteGenerationBrief | null;
  composition: CompositionStrategy;
  direction: WebsiteCreativeDirection;
  intent: IntentIntelligence;
  plan: WebsitePlan;
  prompt: string;
  workspaceAssets?: WebsiteCinematicAssetInput[];
}): WebsiteQualityBlueprint {
  const semantic = inferSemanticDomain(input.prompt);
  let selectedProfile = selectProfile({ plan: input.plan, prompt: input.prompt, semantic });
  const initialConsistency = evaluateWebsiteSemanticConsistency({
    businessType: selectedProfile.businessType,
    entities: selectedProfile.entities.flatMap(([label, description]) => [label, description]),
    semantic,
    visitorCopy: [selectedProfile.tagline, selectedProfile.heroBody ?? "", ...selectedProfile.sectionIdeas.flatMap(([title, body]) => [title, body])],
    visualSubjects: [selectedProfile.visualArchetype]
  });
  const semanticRepairApplied = initialConsistency.repairRecommended && semantic.source !== "generic_fallback" && semantic.source !== "canonical_taxonomy";
  if (semanticRepairApplied) selectedProfile = genericSemanticProfile(input.prompt, input.plan);
  const userSuppliedBrand = cleanBrand(input.intent.brandName);
  const brandName = userSuppliedBrand ?? generatedBrand(selectedProfile, `${input.prompt}:${input.plan.pages.join(",")}`);
  const contractCta = input.brief?.ctaPatterns[0]?.trim();
  const ctas = domainCtas(selectedProfile);
  const domainId = input.brief?.domainId ?? input.plan.sourceOfTruthDomain;
  const pages = input.plan.pages.map((page) => {
    const label = page === "home" ? "Home" : titleCase(page);
    const path = pagePath(page);
    const primaryCta = contractCta || (/contact|appointment|booking|reservation/.test(page) ? ctas.secondary : ctas.primary);
    const publicCopy = visitorCopy({ brandName, ctas, page, primaryCta, profile: selectedProfile });
    return {
      description: page === "home" ? publicCopy.body : `${label} at ${brandName}. ${publicCopy.body}`,
      name: page,
      path,
      sections: pageSections({ page, profile: selectedProfile }),
      structuredDataType: selectedProfile.schema,
      title: page === "home" ? `${brandName} | ${selectedProfile.tagline}` : `${label} | ${brandName}`,
      visitorCopy: publicCopy
    };
  });
  const sectionKinds = new Set(pages.flatMap((page) => page.sections.map((section) => section.kind)));
  const interactions: WebsiteInteractionBlueprint[] = [
    { id: "mobile-navigation", keyboard: true, reason: "Navigation remains usable on small screens." },
    { id: "sticky-header", keyboard: false, reason: "Keeps the primary route available without covering content." },
    { id: "reveal", keyboard: false, reason: "Adds bounded motion with reduced-motion support." }
  ];
  (["carousel", "filter", "faq", "form"] as const).forEach((kind) => {
    if (sectionKinds.has(kind)) {
      interactions.push({
        id: kind === "faq" ? "accordion" : kind,
        keyboard: true,
        reason: `The planned ${kind} component needs a real interaction contract.`
      });
    }
  });
  const brandPalette = paletteFrom({ direction: input.direction, intent: input.intent, prompt: input.prompt });
  const assets = analyzeWebsiteAssets({
    assets: input.workspaceAssets ?? [],
    capabilities: semantic.capabilities,
    visualSubjects: semantic.visualSubjects
  });
  let cinematic = buildWebsiteCinematicExperience({
    assets: input.workspaceAssets ?? [],
    businessType: selectedProfile.businessType,
    capabilities: semantic.capabilities,
    prompt: input.prompt
  });
  if (cinematic.enabled) {
    interactions.push({
      id: "cinematic-sequence",
      keyboard: false,
      reason: "Maps normal page scrolling to a bounded frame sequence with static mobile and reduced-motion fallbacks."
    });
  }
  const scene = buildWebsiteSceneBlueprint({
    cinematicSequenceRequired: cinematic.enabled && cinematic.requirement === "required",
    domainId,
    palette: brandPalette,
    profile: selectedProfile,
    projectName: brandName,
    prompt: input.prompt,
    semantic
  });
  const webgl = webglPolicy(scene);
  const sequenceBudget = webgl.enabled ? 1 : 2;
  if (cinematic.sequences.length > sequenceBudget) {
    cinematic = {
      ...cinematic,
      sequences: cinematic.sequences.slice(0, sequenceBudget),
      warnings: [
        ...cinematic.warnings,
        `Experience budget selected ${sequenceBudget} of ${cinematic.sequences.length} usable cinematic sequences.`
      ]
    };
  }
  const workspaceMedia = workspaceMediaFromAssetIntelligence(assets, selectedProfile.businessType);
  const registryMedia = buildWebsiteMediaRegistry({ brandName, businessType: selectedProfile.businessType, domainId, prompt: input.prompt });
  const media = workspaceMedia.length
    ? [...workspaceMedia, ...registryMedia.filter((asset) => !workspaceMedia.some((workspaceAsset) => workspaceAsset.role === asset.role))]
    : registryMedia;
  const initialExperience = composeWebsiteExperience({
    assets,
    businessCapabilities: semantic.capabilities,
    cinematic,
    pages,
    prompt: input.prompt,
    scene: {
      enabled: webgl.enabled,
      mountSectionId: scene.mountSectionId,
      pagePath: scene.pagePath,
      requirement: scene.requirement
    }
  });
  const experienceQuality = reviewWebsiteExperienceQuality({
    businessValues: [
      selectedProfile.businessType,
      ...semantic.capabilities,
      ...semantic.products,
      ...semantic.services,
      ...semantic.visualSubjects
    ],
    copy: pages.flatMap((page) => [
      page.visitorCopy.heading,
      page.visitorCopy.body,
      ...page.sections.flatMap((section) => [section.title, section.body])
    ]),
    experience: initialExperience,
    sections: pages.find((page) => page.name === "home")?.sections ?? pages.flatMap((page) => page.sections)
  });
  const experience = experienceQuality.repaired
    ? applyExperienceQualityRepair(initialExperience)
    : initialExperience;
  const externalSceneDependencies = scene.engine === "three" ? 1 + (scene.motionEngine === "gsap-scrolltrigger" ? 2 : 0) : 0;
  const semanticConsistency = evaluateWebsiteSemanticConsistency({
    businessType: selectedProfile.businessType,
    entities: selectedProfile.entities.flatMap(([label, description, meta]) => [label, description, meta]),
    sceneSubject: scene.spec.subject,
    semantic,
    visitorCopy: pages.flatMap((page) => [page.visitorCopy.eyebrow, page.visitorCopy.heading, page.visitorCopy.body, ...page.sections.flatMap((section) => [section.title, section.body])]),
    visualSubjects: [selectedProfile.visualArchetype, ...semantic.visualSubjects]
  });

  return {
    accessibility: { landmarks: true, reducedMotion: true, skipLink: true, visibleFocus: true },
    assets,
    brand: {
      generatedName: brandName,
      nameProvenance: userSuppliedBrand ? "USER_SUPPLIED" : "GENERATED_PLACEHOLDER",
      logo: logoBlueprint(brandName, selectedProfile, domainId),
      logoStrategy: "generated-local-svg",
      palette: brandPalette,
      tagline: selectedProfile.tagline,
      tone: input.intent.visualStyle.length ? input.intent.visualStyle : ["clear", "credible", "domain-aware"],
      typography: typographyFor(selectedProfile, input.intent),
      visualArchetype: selectedProfile.visualArchetype
    },
    business: {
      audience: selectedProfile.audience,
      businessModels: semantic.businessModels,
      businessType: selectedProfile.businessType,
      capabilities: semantic.capabilities,
      category: semantic.category,
      differentiators: selectedProfile.differentiators,
      domainId,
      industry: semantic.industry,
      niche: semantic.niche,
      primaryGoal: selectedProfile.primaryGoal,
      products: semantic.products,
      sector: semantic.sector,
      secondaryGoals: input.intent.businessGoals.slice(0, 3),
      services: semantic.services,
      subNiche: semantic.subNiche,
      trustSignals: selectedProfile.trustSignals,
      visualSubjects: semantic.visualSubjects
    },
    cinematic,
    contentEntities: selectedProfile.entities.map(([label, description, meta]) => ({ description, label, meta })),
    interactions,
    media,
    experience,
    experienceQuality,
    pages,
    performance: { maxDevicePixelRatio: scene.performanceBudget.maxPixelRatio, pauseWhenHidden: true, progressiveEnhancement: true, remoteDependencies: media.filter((item) => item.provider !== "local_svg" && item.provider !== "workspace").length + externalSceneDependencies },
    seo: { canonicalPolicy: "project-relative", includeOpenGraph: true, includeRobots: true, includeSitemap: true, structuredData: true },
    scene,
    semanticConsistency: { ...semanticConsistency, repairApplied: semanticRepairApplied },
    sharedComponents: ["skip-link", "site-header", "mobile-navigation", "button", "section-heading", "entity-card", "faq", "honest-form", "site-footer", ...(cinematic.enabled ? ["cinematic-sequence", "cinematic-fallback"] : []), ...(webgl.enabled ? ["scene-section", "scene-fallback"] : []), ...(media.length > 0 ? ["resilient-media"] : [])],
    webgl
  };
}

export function summarizeWebsiteQualityBlueprint(blueprint: WebsiteQualityBlueprint) {
  return {
    assets: `${blueprint.assets.records.length} asset(s), ${blueprint.assets.cinematicSequences.length} sequence(s)`,
    brand: blueprint.brand.generatedName,
    cinematic: blueprint.cinematic.enabled ? `${blueprint.cinematic.sequences.length} sequence(s)` : blueprint.cinematic.requirement,
    components: blueprint.sharedComponents,
    interactions: blueprint.interactions.map((interaction) => interaction.id),
    experience: blueprint.experience.sections.map((section) => `${section.sectionId}:${section.engine}`),
    experienceQuality: `${blueprint.experienceQuality.score}:${blueprint.experienceQuality.findings.length} finding(s)`,
    media: blueprint.media.map((item) => `${item.provider}:${item.id}`),
    palette: Object.values(blueprint.brand.palette),
    pages: blueprint.pages.map((page) => page.path),
    scene: `${blueprint.scene.recipe}:${blueprint.scene.engine}:${blueprint.scene.motionEngine}`,
    semantic: `${blueprint.business.sector ?? "unknown"}:${blueprint.business.industry ?? "unknown"}:${blueprint.business.niche ?? "unknown"}`,
    semanticConsistency: `${blueprint.semanticConsistency.status}:${blueprint.semanticConsistency.coverage}`,
    webgl: blueprint.webgl.enabled ? blueprint.webgl.strategy : "disabled-by-request"
  };
}
