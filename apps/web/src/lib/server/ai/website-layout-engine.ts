import type { WebsitePlan } from "@/lib/server/ai/website-planner";
import {
  getWebsiteCreativeDirection,
  type WebsiteCreativeDirection
} from "@/lib/server/ai/website-creative-direction";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string) {
  return value
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function pageToPath(page: string) {
  return page === "home" ? "index.html" : `${page}.html`;
}

function nav(plan: WebsitePlan) {
  return plan.pages
    .map((page) => `<a href="./${pageToPath(page)}">${escapeHtml(titleCase(page))}</a>`)
    .join("\n        ");
}

function sectionsForPage(plan: WebsitePlan, page: string) {
  if (page === "home") return plan.requiredSections;
  const offset = Math.max(0, plan.pages.indexOf(page) - 1);
  const section = plan.requiredSections[offset % plan.requiredSections.length];
  const support = plan.optionalSections[offset % Math.max(plan.optionalSections.length, 1)];

  return support ? [section, support] : [section];
}

function industryLabel(plan: WebsitePlan) {
  return plan.industry.replace(/_/g, " ");
}

function isSeafoodPlan(plan: WebsitePlan) {
  return plan.sourceOfTruthDomain === "seafood_restaurant" ||
    plan.sourceOfTruthDomain === "seafood" ||
    plan.sourceOfTruthPages.includes("menu") && plan.sourceOfTruthPages.includes("gallery") && plan.industry === "restaurant";
}

function isBeveragePlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return text.includes("cola") ||
    text.includes("soft drink") ||
    text.includes("beverage") ||
    text.includes("soda") ||
    plan.layoutType === "beverage_brand";
}

function isCarRentalPlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return plan.industry === "car_rental" ||
    text.includes("car rental") ||
    text.includes("vehicle rental") ||
    text.includes("car_rental") ||
    text.includes("rental cars");
}

function isMobilePhonePlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return plan.industry === "mobile_phone_shop" ||
    text.includes("mobile phone shop") ||
    text.includes("phone shop") ||
    text.includes("smartphone") ||
    text.includes("phone retail") ||
    text.includes("mobile_phone_shop");
}

function isUpholsteryPlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return plan.industry === "upholstery" ||
    text.includes("upholstery") ||
    text.includes("reupholstery") ||
    text.includes("furniture restoration");
}

function isDentalPlan(plan: WebsitePlan) {
  return plan.industry === "dental_clinic" || `${plan.sourceOfTruthDomain ?? ""}`.includes("dental");
}

function isCleaningPlan(plan: WebsitePlan) {
  return plan.industry === "cleaning_service" || `${plan.sourceOfTruthDomain ?? ""}`.includes("cleaning");
}

function isFloristPlan(plan: WebsitePlan) {
  return plan.industry === "florist" || `${plan.sourceOfTruthDomain ?? ""}`.includes("florist");
}

function isToyStorePlan(plan: WebsitePlan) {
  const text = `${plan.sourceOfTruthDomain ?? ""} ${plan.industry} ${plan.layoutType}`.toLowerCase();

  return text.includes("toy_store") ||
    text.includes("toy shop") ||
    text.includes("toy store") ||
    text.includes("educational toys") ||
    text.includes("plush toys") ||
    text.includes("building blocks");
}

function isRealEstatePlan(plan: WebsitePlan) {
  return plan.industry === "real_estate" || `${plan.sourceOfTruthDomain ?? ""}`.includes("real_estate");
}

function publicLayoutLabel(plan: WebsitePlan) {
  if (plan.industry === "car_rental") return "vehicle rental";
  if (plan.industry === "mobile_phone_shop") return "smartphone retail";
  if (plan.industry === "upholstery") return "furniture restoration";
  if (plan.layoutType === "catalog_commerce") return "featured range";
  if (plan.layoutType === "beverage_brand") return "beverage brand";

  return plan.layoutType.replace(/_/g, " ");
}

function seafoodPageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Meet the kitchen",
      eyebrow: "Seafood story / sourcing",
      hero: "Coastal cooking with a responsible catch philosophy.",
      lede: "Our kitchen works with trusted fishmongers, seasonal catches, and careful prep so every plate feels fresh, warm, and unmistakably ocean-led.",
      sections: [
        {
          body: "From grilled local fish to chilled oysters, the menu changes with what is freshest and most sustainable.",
          title: "Sourced with care",
          visual: "chef selecting fresh seafood"
        },
        {
          body: "Pearl-toned tables, soft lighting, and a calm dining room make the restaurant suited for date nights, family meals, and business dinners.",
          title: "A relaxed dining atmosphere",
          visual: "coastal restaurant ambience"
        }
      ]
    },
    contact: {
      cta: "Reserve a table",
      eyebrow: "Hours / reservations",
      hero: "Plan your visit for fresh seafood, warm service, and easy reservations.",
      lede: "Send a reservation request, check dinner hours, or contact the team for private dining and seasonal menu questions.",
      sections: [
        {
          body: "Open Tuesday to Sunday for lunch and dinner, with extended evening seating on Fridays and Saturdays.",
          title: "Hours and location",
          visual: "Visit us by the waterfront"
        },
        {
          body: "Use the contact form for table requests, group bookings, allergy notes, and chef's tasting menu inquiries.",
          title: "Reservation request form",
          visual: "reservation contact form"
        }
      ]
    },
    gallery: {
      cta: "View the menu",
      eyebrow: "Gallery / dining room",
      hero: "A visual taste of fresh plates, ocean textures, and coastal hospitality.",
      lede: "Browse composed seafood plates, raw bar details, chef finishes, and dining-room moments without fake uploads or broken remote images.",
      sections: [
        {
          body: "A grid of fresh oysters, grilled fish, lobster pasta, citrus salads, and chilled seafood platters.",
          title: "Food gallery",
          visual: "seafood dish gallery"
        },
        {
          body: "Warm tables, deep navy accents, pearl surfaces, and subtle aqua highlights create the restaurant's ocean mood.",
          title: "Ambience gallery",
          visual: "ocean-inspired dining room"
        }
      ]
    },
    home: {
      cta: "Reserve your table",
      eyebrow: "Premium seafood dining",
      hero: "Fresh seafood, ocean calm, and a table worth reserving.",
      lede: "A refined seafood restaurant built around seasonal catch, chef-led specials, fresh oysters, grilled fish, and warm hospitality.",
      sections: [
        {
          body: "Daily catch, oysters, lobster pasta, grilled prawns, citrus salads, and chef specials anchor the first screen.",
          title: "Featured seafood specialties",
          visual: "Chef's coastal signature platter"
        },
        {
          body: "Guide guests from appetite to action with a warm table request, menu path, hours, and contact details.",
          title: "Reservation-first dining path",
          visual: "Reserve tonight's fresh catch"
        }
      ]
    },
    menu: {
      cta: "Reserve for dinner",
      eyebrow: "Menu / seasonal catch",
      hero: "Seafood categories, dish cards, pricing, and seasonal catch.",
      lede: "Explore raw bar favorites, grilled fish, shellfish plates, seafood pasta, sides, desserts, and chef-selected seasonal catch.",
      sections: [
        {
          body: "Raw bar, grilled catch, lobster and shellfish, seafood pasta, sides, desserts, and non-alcoholic pairings.",
          title: "Seafood menu categories",
          visual: "seafood menu category cards"
        },
        {
          body: "Dish cards include short descriptions, clear pricing, sourcing notes, and seasonal availability.",
          title: "Dish cards and pricing",
          visual: "seasonal catch dish cards"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function beveragePageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Explore the flavor story",
      eyebrow: "Brand story / flavor profile",
      hero: "A cola brand built around bold flavor, campaigns, and retail momentum.",
      lede: "The brand story starts with a crisp cola profile, chilled shelf presence, and campaign launches built for stores, events, and regional distribution.",
      sections: [
        {
          body: "Flagship cans and sparkling bottles carry a bold cola flavor made for everyday shelves, campaign coolers, and shared moments.",
          title: "Flavor profile with shelf energy",
          visual: "flagship cans and sparkling bottles"
        },
        {
          body: "Campaign launches and regional distribution help retailers bring the cola lineup to new neighborhoods with consistent supply and clear merchandising.",
          title: "Campaigns and distribution story",
          visual: "regional campaign launch"
        }
      ]
    },
    contact: {
      cta: "Become a distribution partner",
      eyebrow: "Retailer / distributor contact",
      hero: "Retailer inquiries, distributor partnerships, and campaign partnerships start here.",
      lede: "Use the contact form for retailer inquiries, distributor partnerships, campaign partnerships, regional availability, and shelf-launch planning.",
      sections: [
        {
          body: "Retail teams can ask about flagship cans, sparkling bottles, chilled displays, wholesale availability, and launch timing.",
          title: "Retailer inquiries",
          visual: "retailer inquiry form"
        },
        {
          body: "Distribution partners can discuss region coverage, campaign launches, delivery rhythm, and shelf-ready cola supply.",
          title: "Distributor partnerships",
          visual: "distribution partner path"
        }
      ]
    },
    home: {
      cta: "Become a distribution partner",
      eyebrow: "Premium cola / soft drinks",
      hero: "Bold cola flavor, chilled and ready.",
      lede: "Flagship cans and sparkling bottles bring crisp cola refreshment, campaign energy, and flavors for every shelf.",
      sections: [
        {
          body: "Featured cola lineup with classic cola, zero sugar, citrus sparkle, and seasonal campaign flavors for retail coolers.",
          title: "Flavors for every shelf",
          visual: "featured cola lineup"
        },
        {
          body: "Trusted by retailers across 12 regions, with campaign launches and regional distribution support for growing stores.",
          title: "Retailer and distributor inquiries",
          visual: "regional cola distribution"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function carRentalPageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Explore the fleet",
      eyebrow: "Car rental story / fleet care",
      hero: "A rental team built around clean vehicles, clear pricing, and confident handovers.",
      lede: "Our car rental service keeps economy cars, SUVs, and luxury vehicles ready for airport pickups, business travel, family trips, and weekly rental plans.",
      sections: [
        {
          body: "Every vehicle is inspected, cleaned, and prepared with mileage, insurance, and pickup details explained before handover.",
          title: "Clean vehicles, ready on time",
          visual: "vehicle inspection and clean fleet"
        },
        {
          body: "Drivers can compare rental categories, daily and weekly plans, airport timing, and roadside support without hidden pressure.",
          title: "Transparent rental guidance",
          visual: "transparent rental plan cards"
        }
      ]
    },
    blog: {
      cta: "Reserve a vehicle",
      eyebrow: "Rental guides / travel tips",
      hero: "Helpful rental guides for airport trips, city drives, and weekly plans.",
      lede: "Read practical notes on choosing economy cars, SUVs, luxury vehicles, insurance options, mileage expectations, pickup timing, and travel-ready reservations.",
      sections: [
        {
          body: "Compare vehicle categories by luggage, passenger count, route length, comfort, and daily or weekly rental budget.",
          title: "How to choose the right rental car",
          visual: "rental car comparison guide"
        },
        {
          body: "Plan pickup and dropoff windows, driver requirements, insurance notes, and roadside support before your reservation.",
          title: "Before pickup checklist",
          visual: "pickup checklist for drivers"
        }
      ]
    },
    contact: {
      cta: "Send rental inquiry",
      eyebrow: "Reservations / pickup details",
      hero: "Reserve a rental car with clear dates, pickup location, and vehicle category.",
      lede: "Use the form for reservations, airport rentals, pickup and dropoff timing, driver questions, insurance options, and fleet availability.",
      sections: [
        {
          body: "Share your pickup date, dropoff date, airport or city location, driver count, and preferred vehicle class.",
          title: "Rental inquiry form",
          visual: "reservation form for rental cars"
        },
        {
          body: "Ask about mileage, deposits, insurance, roadside support, luxury vehicles, SUVs, and weekly rental plans.",
          title: "Support before handover",
          visual: "roadside support and insurance details"
        }
      ]
    },
    home: {
      cta: "Reserve a vehicle",
      eyebrow: "Premium car rental / vehicle fleet",
      hero: "Rental cars ready for airport pickups, business days, and weekend drives.",
      lede: "Choose from clean economy cars, SUVs, and luxury vehicles with transparent pricing, insurance guidance, mileage clarity, and easy pickup and dropoff.",
      sections: [
        {
          body: "Browse economy cars, SUVs, and luxury vehicles prepared for daily rentals, weekly plans, airport arrivals, and driver comfort.",
          title: "Vehicle fleet for every trip",
          visual: "economy cars SUVs and luxury vehicles"
        },
        {
          body: "Reserve with clear availability, pickup location, insurance options, mileage details, and roadside support before handover.",
          title: "Booking, insurance, and pickup clarity",
          visual: "booking and pickup details"
        }
      ]
    },
    services: {
      cta: "Check availability",
      eyebrow: "Rental services / plans",
      hero: "Daily rentals, weekly plans, airport pickup, and flexible vehicle categories.",
      lede: "Services include economy rentals, SUV rentals, luxury vehicles, airport rentals, corporate bookings, driver support, insurance guidance, and transparent mileage terms.",
      sections: [
        {
          body: "Daily and weekly rental plans make it simple to book a clean vehicle for errands, travel, business, or family needs.",
          title: "Daily and weekly rental plans",
          visual: "rental plan cards"
        },
        {
          body: "Airport pickup, dropoff scheduling, driver requirements, and roadside support are explained before confirmation.",
          title: "Pickup, dropoff, and support",
          visual: "airport pickup and dropoff"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function mobilePhonePageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Visit the service counter",
      eyebrow: "Phone shop story / trusted support",
      hero: "A mobile phone shop built around honest comparison, setup help, and after-sale care.",
      lede: "Our team helps customers compare iPhone, Samsung, and Android phones, choose accessories, understand warranty options, and set up devices with confidence.",
      sections: [
        {
          body: "We explain storage, camera, battery, display, warranty, and installment plan differences in plain language before customers buy.",
          title: "Clear smartphone guidance",
          visual: "smartphone comparison counter"
        },
        {
          body: "The service counter supports screen protectors, device setup, data transfer, trade-ins, repairs, and customer support after purchase.",
          title: "Setup, warranty, and repairs",
          visual: "phone repair and setup desk"
        }
      ]
    },
    contact: {
      cta: "Ask about availability",
      eyebrow: "Store support / phone inquiries",
      hero: "Contact us for smartphones, accessories, repairs, trade-ins, and device setup.",
      lede: "Use the form to ask about iPhone availability, Samsung models, Android phones, cases, chargers, screen protectors, unlocked phones, installment plans, warranty, repairs, and service counter timing.",
      sections: [
        {
          body: "Share the phone model, storage size, preferred color, accessory needs, warranty question, or repair issue so the team can prepare options.",
          title: "Phone and repair inquiry form",
          visual: "customer support contact form"
        },
        {
          body: "Ask about store hours, pickup, trade-ins, installment plans, screen protector fitting, and device setup before visiting.",
          title: "Support before your visit",
          visual: "mobile store customer support"
        }
      ]
    },
    home: {
      cta: "Compare phones",
      eyebrow: "Premium mobile phone shop / smartphone retail",
      hero: "Smartphones, accessories, repairs, and setup help in one trusted phone shop.",
      lede: "Browse iPhone, Samsung, Android phones, unlocked phones, cases, chargers, screen protectors, trade-ins, installment plans, warranty help, repairs, and device setup support.",
      sections: [
        {
          body: "Compare new arrivals, flagship phones, budget Android phones, and unlocked devices with clear guidance on camera, battery, storage, and warranty.",
          title: "Featured smartphones and new arrivals",
          visual: "iPhone Samsung and Android phone display"
        },
        {
          body: "Find cases, chargers, screen protectors, device setup, data transfer, repair support, and customer service from the same counter.",
          title: "Accessories, setup, and service counter",
          visual: "phone accessories and repair counter"
        }
      ]
    },
    services: {
      cta: "Request service help",
      eyebrow: "Services / support counter",
      hero: "Phone repairs, device setup, accessories, warranty support, and upgrade guidance.",
      lede: "Services include screen protector fitting, phone accessories, device setup, data transfer, trade-ins, installment plan guidance, warranty questions, repairs, and product comparison.",
      sections: [
        {
          body: "Customers can compare iPhone, Samsung, Android phones, unlocked phones, storage choices, camera needs, and upgrade options.",
          title: "Product comparison and upgrades",
          visual: "smartphone product comparison"
        },
        {
          body: "The service counter helps with screen protectors, cases, chargers, repairs, warranty questions, device setup, and customer support.",
          title: "Repair, warranty, and setup support",
          visual: "phone service counter"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function upholsteryPageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "See the workshop",
      eyebrow: "Craft story / upholstery workshop",
      hero: "A local upholstery workshop focused on careful furniture restoration and fabric guidance.",
      lede: "We restore sofas, dining chairs, lounge chairs, cushions, and leather pieces with fabric selection, foam replacement, stitching, and clear before and after proof.",
      sections: [
        {
          body: "Every project starts with furniture photos, material advice, and a free estimate before fabric, foam, stitching, or leather repair begins.",
          title: "Craft-first restoration",
          visual: "upholstery workshop with fabric samples"
        },
        {
          body: "Customers can compare fabric textures, leather repair options, custom cushions, and workmanship details before approving the job.",
          title: "Fabric and leather guidance",
          visual: "fabric selection and leather repair samples"
        }
      ]
    },
    blog: {
      cta: "Request a free estimate",
      eyebrow: "Restoration notes / fabric care",
      hero: "Practical guides for sofa reupholstery, chair restoration, fabric selection, and leather repair.",
      lede: "Read upholstery notes about custom cushions, foam replacement, stitching, fabric durability, leather repair, and before and after furniture restoration.",
      sections: [
        {
          body: "Learn when a sofa needs reupholstery, foam replacement, cushion reshaping, or a full furniture restoration plan.",
          title: "When to reupholster a sofa",
          visual: "before and after sofa reupholstery"
        },
        {
          body: "Compare fabric selection, stain resistance, leather repair, stitching, and workshop care for everyday home furniture.",
          title: "Choosing fabric and repair options",
          visual: "fabric swatches and stitching detail"
        }
      ]
    },
    contact: {
      cta: "Send furniture photos",
      eyebrow: "Quotes / furniture photos",
      hero: "Request a free estimate for sofa reupholstery, chair restoration, leather repair, or custom cushions.",
      lede: "Share photos, measurements, fabric preferences, leather repair notes, and pickup needs so the workshop can prepare an accurate upholstery estimate.",
      sections: [
        {
          body: "Upload or describe the sofa, chair, cushion, booth, or commercial upholstery item that needs repair or restoration.",
          title: "Estimate request details",
          visual: "estimate form with furniture photos"
        },
        {
          body: "Ask about fabric selection, foam replacement, leather repair, stitching, free estimates, and before and after examples.",
          title: "Workshop consultation",
          visual: "upholstery consultation counter"
        }
      ]
    },
    home: {
      cta: "Request a free estimate",
      eyebrow: "Premium upholstery / furniture restoration",
      hero: "Sofa reupholstery, chair restoration, fabric selection, and leather repair for renewed furniture.",
      lede: "Restore home furniture and commercial seating with custom cushions, foam replacement, careful stitching, leather repair, workshop guidance, free estimates, and before and after proof.",
      sections: [
        {
          body: "Bring sofas, dining chairs, lounge chairs, cushions, booths, and commercial upholstery back to life with material guidance and workmanship care.",
          title: "Sofa reupholstery and chair restoration",
          visual: "before and after furniture restoration"
        },
        {
          body: "Choose fabric selection, leather repair, custom cushions, foam replacement, stitching details, and finish options with a clear estimate.",
          title: "Fabric, leather, and cushion options",
          visual: "fabric texture and custom cushions"
        }
      ]
    },
    services: {
      cta: "Book a consultation",
      eyebrow: "Services / restoration process",
      hero: "Upholstery services for sofas, chairs, leather pieces, custom cushions, and commercial seating.",
      lede: "Services include sofa reupholstery, chair restoration, fabric selection, leather repair, custom cushions, foam replacement, stitching, and furniture restoration.",
      sections: [
        {
          body: "The workshop handles sofa reupholstery, chair restoration, dining seats, cushions, leather repair, and commercial upholstery with careful stitching.",
          title: "Furniture repair and restoration",
          visual: "sofa and chair restoration cards"
        },
        {
          body: "Customers receive fabric selection guidance, foam replacement options, before and after expectations, and a free estimate before work begins.",
          title: "Fabric selection and free estimates",
          visual: "fabric samples and estimate notes"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function dentalPageCopy(page: string) {
  const copy: Record<string, ReturnType<typeof upholsteryPageCopy>> = {
    about: {
      cta: "Book appointment",
      eyebrow: "Care team / gentle dentistry",
      hero: "A calm dental clinic built around prevention, comfort, and clear treatment guidance.",
      lede: "Meet licensed dentists focused on routine checkups, hygiene protocols, emergency dental guidance, and patient comfort from first call to follow-up.",
      sections: [
        { body: "Modern treatment rooms, hygiene protocols, and a gentle chairside approach help patients feel informed and safe.", title: "Comfort-first dental care", visual: "calm dental treatment room" },
        { body: "The clinic supports checkups, whitening, fillings, orthodontic referrals, hygiene visits, and urgent dental questions.", title: "Treatments with clear guidance", visual: "dental service cards" }
      ]
    },
    contact: {
      cta: "Book appointment",
      eyebrow: "Appointments / patient comfort",
      hero: "Book an appointment for checkups, hygiene, urgent dental care, or treatment planning.",
      lede: "Share your preferred time, dental concern, comfort needs, and appointment questions so the clinic can respond clearly.",
      sections: [
        { body: "Ask about checkup availability, emergency slots, hygiene visits, whitening, fillings, and follow-up care.", title: "Appointment request", visual: "appointment request panel" },
        { body: "Patient comfort, gentle explanations, and transparent care steps guide every visit.", title: "Comfort and trust", visual: "patient comfort badge row" }
      ]
    },
    home: {
      cta: "Book appointment",
      eyebrow: "Modern dental clinic",
      hero: "Calm dental care, trusted appointments, and clear treatment guidance.",
      lede: "A clean, patient-first dental clinic for checkups, hygiene protocols, whitening, emergency dental questions, patient reviews, and gentle care in a modern setting.",
      sections: [
        { body: "Book checkups, hygiene visits, fillings, whitening consultations, and urgent dental appointments through a clear contact path.", title: "Appointments and treatments", visual: "dental appointment trust badges" },
        { body: "Licensed dentists, patient reviews, clear treatment plans, comfort, and patient communication are visible before the visitor reaches the form.", title: "Patient comfort and trust", visual: "clean clinic comfort proof" }
      ]
    },
    services: {
      cta: "View treatments",
      eyebrow: "Treatments / dental services",
      hero: "Dental treatments organized around prevention, comfort, and confidence.",
      lede: "Services include checkups, hygiene appointments, whitening, fillings, emergency dental guidance, and clear treatment plans.",
      sections: [
        { body: "Preventive checkups, hygiene visits, oral exams, and gentle treatment explanations support long-term dental health.", title: "Preventive dental care", visual: "dental care checklist" },
        { body: "Whitening, fillings, urgent dental questions, and specialist referrals are presented with calm patient guidance.", title: "Treatment support", visual: "treatment comfort cards" }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function cleaningPageCopy(page: string) {
  const copy: Record<string, ReturnType<typeof upholsteryPageCopy>> = {
    about: {
      cta: "Get a free quote",
      eyebrow: "Local cleaners / organized service",
      hero: "A trusted cleaning team for homes, offices, deep cleans, and recurring schedules.",
      lede: "The team brings organized checklists, insured cleaners, local reviews, and dependable scheduling to every cleaning visit.",
      sections: [
        { body: "Home cleaning, office cleaning, deep clean visits, and move-in cleaning are planned with room-by-room checklists.", title: "Organized cleaning process", visual: "fresh cleaning checklist" },
        { body: "Trusted cleaners, recurring cleaning options, and local reviews give customers confidence before booking.", title: "Local trust and reviews", visual: "local cleaning review cards" }
      ]
    },
    contact: {
      cta: "Book a cleaning",
      eyebrow: "Quotes / cleaning schedule",
      hero: "Book a cleaning or request a free quote for home, office, or move-out service.",
      lede: "Share rooms, schedule, deep clean needs, office cleaning details, and preferred visit times for a clear quote.",
      sections: [
        { body: "Ask for home cleaning, office cleaning, recurring cleaning, move-in cleaning, move-out cleaning, or deep clean support.", title: "Cleaning quote request", visual: "cleaning booking form" },
        { body: "The team confirms scope, schedule, checklist, and visit expectations before arrival.", title: "Schedule with confidence", visual: "fresh service calendar" }
      ]
    },
    home: {
      cta: "Book a cleaning",
      eyebrow: "Fresh local cleaning",
      hero: "Reliable cleaning for brighter homes, offices, and move-in days.",
      lede: "Book trusted cleaners for home cleaning, office cleaning, deep clean visits, move-in cleaning, move-out cleaning, and recurring cleaning schedules.",
      sections: [
        { body: "Choose home cleaning, office cleaning, deep clean, move-in cleaning, move-out cleaning, and recurring cleaning packages.", title: "Cleaning packages", visual: "bright cleaning package cards" },
        { body: "Insured cleaners, clear schedules, trusted local reviews, and organized checklists make booking feel simple.", title: "Insured local proof", visual: "insured cleaning proof row" }
      ]
    },
    services: {
      cta: "Schedule recurring cleaning",
      eyebrow: "Services / cleaning packages",
      hero: "Cleaning packages for homes, offices, deep cleans, and recurring schedules.",
      lede: "Services include home cleaning, office cleaning, kitchen and bathroom focus, deep clean support, move-out cleaning, and recurring visits.",
      sections: [
        { body: "Recurring cleaning keeps high-use rooms fresh with weekly, biweekly, or monthly schedules.", title: "Recurring home and office cleaning", visual: "clean room service cards" },
        { body: "Move-in, move-out, and deep clean visits focus on kitchens, bathrooms, floors, dust, and reset details.", title: "Deep clean and moving support", visual: "before and after cleaning proof" }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function floristPageCopy(page: string) {
  const copy: Record<string, ReturnType<typeof upholsteryPageCopy>> = {
    about: {
      cta: "Request an arrangement",
      eyebrow: "Florist story / seasonal design",
      hero: "A floral studio for emotional gifts, weddings, events, sympathy, and seasonal arrangements.",
      lede: "Every bouquet, arrangement, and event piece is guided by freshness, occasion, color, and delivery needs.",
      sections: [
        { body: "Seasonal flowers, bouquet design, wedding flowers, sympathy arrangements, and event florals are tailored to each message.", title: "Occasion-led flowers", visual: "seasonal floral worktable" },
        { body: "Freshness, careful wrapping, delivery timing, and arrangement guidance shape the customer experience.", title: "Freshness and delivery care", visual: "floral delivery proof" }
      ]
    },
    contact: {
      cta: "Order flowers",
      eyebrow: "Orders / floral delivery",
      hero: "Order flowers, request an arrangement, or discuss wedding and event florals.",
      lede: "Share occasion, delivery date, bouquet style, color palette, budget, and message so the florist can prepare the right arrangement.",
      sections: [
        { body: "Ask about bouquets, sympathy flowers, wedding arrangements, seasonal collections, and same-day delivery.", title: "Arrangement inquiry", visual: "florist order form" },
        { body: "Delivery windows, freshness care, and occasion notes are confirmed before the flowers leave the studio.", title: "Delivery and care", visual: "wrapped bouquet delivery" }
      ]
    },
    home: {
      cta: "Order flowers",
      eyebrow: "Elegant floral design",
      hero: "Seasonal flowers for gifts, weddings, events, and meaningful moments.",
      lede: "A florist website shaped around fresh bouquets, wedding flowers, event arrangements, sympathy flowers, delivery, and seasonal collections.",
      sections: [
        { body: "Browse bouquets, seasonal arrangements, wedding flowers, sympathy flowers, and event florals with a clear order path.", title: "Flowers for every occasion", visual: "floral occasion gallery" },
        { body: "Freshness, delivery, arrangement guidance, and event experience build trust before customers order.", title: "Freshness and event proof", visual: "seasonal arrangement proof" }
      ]
    },
    services: {
      cta: "Request an arrangement",
      eyebrow: "Services / floral occasions",
      hero: "Bouquets, weddings, events, sympathy flowers, delivery, and seasonal arrangements.",
      lede: "Services include fresh bouquets, custom arrangements, wedding flowers, event florals, sympathy flowers, delivery, and seasonal collections.",
      sections: [
        { body: "Bouquets and custom arrangements are designed around occasion, color, budget, and recipient message.", title: "Bouquets and custom arrangements", visual: "bouquet design cards" },
        { body: "Wedding flowers, event florals, sympathy arrangements, and delivery timing are handled with calm detail.", title: "Events, sympathy, and delivery", visual: "event floral gallery" }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function realEstatePageCopy(page: string) {
  const copy: Record<string, ReturnType<typeof upholsteryPageCopy>> = {
    about: {
      cta: "Schedule a consultation",
      eyebrow: "Local market / property guidance",
      hero: "Real estate guidance for buyers, sellers, listings, valuations, and neighborhood decisions.",
      lede: "The agency combines local market expertise, property listings, buyer guidance, seller strategy, and viewing coordination.",
      sections: [
        { body: "Agents guide buyers through neighborhoods, viewings, pricing context, offer steps, and property comparisons.", title: "Buyer guidance", visual: "buyer consultation cards" },
        { body: "Sellers receive valuation advice, listing preparation, local market positioning, and viewing strategy.", title: "Seller strategy", visual: "property valuation proof" }
      ]
    },
    contact: {
      cta: "Schedule a consultation",
      eyebrow: "Consultation / viewings",
      hero: "Schedule a consultation for listings, valuations, buying, selling, or local market guidance.",
      lede: "Share your property goals, neighborhood, budget, timeline, viewing needs, or valuation questions for a focused response.",
      sections: [
        { body: "Ask about listings, viewings, valuations, buyer consultation, seller strategy, and neighborhood expertise.", title: "Property inquiry", visual: "real estate contact panel" },
        { body: "Agents respond with next steps for viewings, listing preparation, market context, and consultation timing.", title: "Next-step guidance", visual: "local market guidance notes" }
      ]
    },
    home: {
      cta: "View listings",
      eyebrow: "Premium real estate guidance",
      hero: "Find the right property path with listings, local expertise, and calm guidance.",
      lede: "A premium real estate website for property listings, buyers, sellers, valuations, neighborhood guidance, viewings, and agent consultations.",
      sections: [
        { body: "Guide buyers and sellers through listings, property viewings, neighborhood decisions, valuations, and next steps.", title: "Buyer and seller paths", visual: "property path cards" },
        { body: "Local market expertise, agent guidance, listing preparation, and testimonials make the consultation path trustworthy.", title: "Local property proof", visual: "premium property proof cards" }
      ]
    },
    services: {
      cta: "Request a valuation",
      eyebrow: "Services / property strategy",
      hero: "Real estate services for listings, valuations, buyers, sellers, and viewings.",
      lede: "Services include buyer guidance, seller strategy, property listings, valuations, neighborhood advice, viewings, and agent consultation.",
      sections: [
        { body: "Buyers compare listings, neighborhoods, budgets, property features, and viewing schedules with agent guidance.", title: "Buyer and listing support", visual: "listing comparison cards" },
        { body: "Sellers receive valuation, preparation, pricing strategy, local market advice, and viewing coordination.", title: "Seller valuation strategy", visual: "valuation and market cards" }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function toyStorePageCopy(page: string) {
  const copy: Record<string, {
    cta: string;
    eyebrow: string;
    hero: string;
    lede: string;
    sections: Array<{
      body: string;
      title: string;
      visual: string;
    }>;
  }> = {
    about: {
      cta: "Meet the toy team",
      eyebrow: "Toy shop / age-group guidance",
      hero: "A premium toy shop built around safe picks, playful learning, and easy gifting.",
      lede: "We help families choose toys by age group, interest, and occasion, from educational toys and puzzles to plush toys, building blocks, and birthday gift picks.",
      sections: [
        {
          body: "Every category is organized around kids, age groups, and gift moments so shoppers can compare quickly without noisy generic ecommerce filler.",
          title: "Curated for kids and families",
          visual: "age-group toy shelves"
        },
        {
          body: "Delivery, returns, safe checkout, and customer support are visible so parents can shop with confidence.",
          title: "Trust before checkout",
          visual: "safe checkout and returns badges"
        }
      ]
    },
    cart: {
      cta: "Review gift basket",
      eyebrow: "Cart / safe checkout",
      hero: "Build a gift-ready cart with toy categories, delivery notes, and safe checkout clarity.",
      lede: "Preview plush toys, educational toys, puzzles, and building blocks with clear delivery, returns, and support details before checkout.",
      sections: [
        {
          body: "The cart path highlights gift picks, age-group notes, and delivery timing for parents and gift buyers.",
          title: "Basket confidence",
          visual: "toy basket checkout"
        },
        {
          body: "Returns and safe checkout guidance are presented early so families understand the purchase path.",
          title: "Clear delivery and returns",
          visual: "delivery and returns cards"
        }
      ]
    },
    contact: {
      cta: "Ask about a toy",
      eyebrow: "Support / delivery",
      hero: "Contact the toy shop for age-group recommendations, delivery, returns, and gift help.",
      lede: "Ask about educational toys, puzzles, plush toys, building blocks, safe checkout, delivery windows, and returns before placing an order.",
      sections: [
        {
          body: "Share the child age group, interests, budget, and event date so the team can suggest better gift picks.",
          title: "Gift help that feels human",
          visual: "toy support counter"
        },
        {
          body: "Delivery questions, returns, and category guidance stay visible instead of being hidden behind generic support copy.",
          title: "Support for parents",
          visual: "delivery support badges"
        }
      ]
    },
    home: {
      cta: "Shop toy categories",
      eyebrow: "Toy shop / premium ecommerce",
      hero: "A bright toy shop for educational toys, plush friends, puzzles, and building blocks.",
      lede: "Explore toys by age group, category, and gift moment with safe checkout, delivery, returns, and family-friendly support built into the shopping path.",
      sections: [
        {
          body: "Educational toys, plush toys, puzzles, building blocks, and gift picks are grouped into clear categories for kids and parents.",
          title: "Toy categories that make choosing easy",
          visual: "premium toy category grid"
        },
        {
          body: "Age groups, delivery, returns, and safe checkout details help shoppers move from discovery to purchase with confidence.",
          title: "Safe shopping for families",
          visual: "family shopping trust row"
        }
      ]
    },
    products: {
      cta: "Browse featured toys",
      eyebrow: "Products / categories",
      hero: "Featured toys for kids, learning, gifting, and creative play.",
      lede: "Browse educational toys, plush toys, puzzles, building blocks, and age-group categories with gift-ready toy picks.",
      sections: [
        {
          body: "Toy tiles can group picks by toddlers, preschool, school-age kids, creative play, STEM learning, and cozy plush gifts.",
          title: "Age groups and categories",
          visual: "age-filtered toy cards"
        },
        {
          body: "Delivery, returns, safe checkout, and customer support sit close to the catalog so the ecommerce path feels complete.",
          title: "Checkout confidence",
          visual: "checkout support strip"
        }
      ]
    }
  };

  return copy[page] ?? copy.home;
}

function renderVisual(label: string, index: number) {
  return `<div class="visual visual-${(index % 4) + 1}" aria-label="${escapeHtml(label)}">
            <span>${escapeHtml(label)}</span>
          </div>`;
}

function className(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
}

function rhythmLabel(direction: WebsiteCreativeDirection) {
  return direction.rhythm.homeSections.join(" -> ");
}

function renderProofSection(input: {
  cta: string;
  direction: WebsiteCreativeDirection;
  page: string;
  plan: WebsitePlan;
}) {
  if (input.page !== "home") return "";

  const proofItems = [
    input.direction.proof.visualTreatment,
    input.direction.proof.sectionTitle,
    input.direction.conversion.ctaStyle
  ];

  return `<section class="proof-band" data-proof-type="${escapeHtml(input.direction.proof.type)}">
        <div>
          <p class="eyebrow">${escapeHtml(input.direction.visualArchetype)}</p>
          <h2>${escapeHtml(input.direction.proof.sectionTitle)}</h2>
        </div>
        <div class="proof-list">
${proofItems.map((item, index) => `          <article>
            <span>${String(index + 1).padStart(2, "0")}</span>
            <p>${escapeHtml(item)}</p>
          </article>`).join("\n")}
        </div>
        <a class="button button-secondary" href="./${input.plan.pages.includes("contact") ? "contact.html" : pageToPath(input.plan.pages[input.plan.pages.length - 1] ?? "contact")}">${escapeHtml(input.cta)}</a>
      </section>`;
}

function renderPage(input: {
  brandName: string;
  page: string;
  plan: WebsitePlan;
}) {
  const isHome = input.page === "home";
  const pageTitle = titleCase(input.page);
  const pageSections = sectionsForPage(input.plan, input.page);
  const leadSection = pageSections[0] ?? input.plan.requiredSections[0];
  const direction = getWebsiteCreativeDirection({ plan: input.plan });
  const seafoodCopy = isSeafoodPlan(input.plan) ? seafoodPageCopy(input.page) : null;
  const beverageCopy = isBeveragePlan(input.plan) ? beveragePageCopy(input.page) : null;
  const carRentalCopy = isCarRentalPlan(input.plan) ? carRentalPageCopy(input.page) : null;
  const mobilePhoneCopy = isMobilePhonePlan(input.plan) ? mobilePhonePageCopy(input.page) : null;
  const upholsteryCopy = isUpholsteryPlan(input.plan) ? upholsteryPageCopy(input.page) : null;
  const dentalCopy = isDentalPlan(input.plan) ? dentalPageCopy(input.page) : null;
  const cleaningCopy = isCleaningPlan(input.plan) ? cleaningPageCopy(input.page) : null;
  const floristCopy = isFloristPlan(input.plan) ? floristPageCopy(input.page) : null;
  const toyStoreCopy = isToyStorePlan(input.plan) ? toyStorePageCopy(input.page) : null;
  const realEstateCopy = isRealEstatePlan(input.plan) ? realEstatePageCopy(input.page) : null;
  const domainCopy = upholsteryCopy ?? dentalCopy ?? mobilePhoneCopy ?? carRentalCopy ?? seafoodCopy ?? cleaningCopy ?? floristCopy ?? toyStoreCopy ?? realEstateCopy ?? beverageCopy;
  const heroTitle = domainCopy?.hero ?? (isHome ? leadSection.title : `${pageTitle} built around ${leadSection.title.toLowerCase()}`);
  const lede = domainCopy?.lede ?? (isHome ? leadSection.intent : leadSection.contentAngle);
  const cta = domainCopy?.cta ?? input.plan.goal;
  const eyebrow = domainCopy?.eyebrow ?? `${industryLabel(input.plan)} / ${publicLayoutLabel(input.plan)}`;
  const sectionCards = domainCopy?.sections.map((section, index) => ({
    contentAngle: section.body,
    id: `${input.page}-${index + 1}`,
    title: section.title,
    visualIntent: section.visual
  })) ?? pageSections;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(isHome ? input.brandName : `${pageTitle} - ${input.brandName}`)}</title>
    <meta name="description" content="${escapeHtml(input.plan.goal)}" />
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="creative-${escapeHtml(className(direction.hero.layout))} proof-${escapeHtml(className(direction.proof.type))}" data-archetype="${escapeHtml(direction.visualArchetype)}" data-industry="${input.plan.industry}" data-layout="${input.plan.layoutType}" data-rhythm="${escapeHtml(rhythmLabel(direction))}">
    <header class="site-header">
      <a class="brand" href="./index.html">${escapeHtml(input.brandName)}</a>
      <nav aria-label="Primary navigation">
        ${nav(input.plan)}
      </nav>
    </header>
    <main>
      <section class="hero" data-section-id="${escapeHtml(leadSection.id)}">
        <div class="hero-copy">
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h1>${escapeHtml(heroTitle)}</h1>
          <p class="lede">${escapeHtml(lede)}</p>
          <div class="hero-actions">
            <a class="button" href="./${input.plan.pages.includes("contact") ? "contact.html" : pageToPath(input.plan.pages[input.plan.pages.length - 1] ?? "contact")}">${escapeHtml(cta)}</a>
            <span class="proof-pill">${escapeHtml(direction.proof.sectionTitle)}</span>
          </div>
        </div>
        ${renderVisual(domainCopy?.sections[0]?.visual ?? leadSection.visualIntent, 0)}
      </section>
      ${renderProofSection({ cta, direction, page: input.page, plan: input.plan })}
      <section class="section-grid" aria-label="${escapeHtml(pageTitle)} sections">
${sectionCards
  .map((section, index) => `        <article class="section-card" data-section-id="${escapeHtml(section.id)}">
          <span>${String(index + 1).padStart(2, "0")}</span>
          <p class="eyebrow">${escapeHtml(section.visualIntent)}</p>
          <h2>${escapeHtml(section.title)}</h2>
          <p>${escapeHtml(section.contentAngle)}</p>
          ${renderVisual(section.visualIntent, index + 1)}
        </article>`)
  .join("\n")}
      </section>
      ${domainCopy && input.page === "contact" ? `<section class="contact-form" aria-label="${upholsteryCopy ? "Upholstery estimate" : dentalCopy ? "Dental appointment" : beverageCopy ? "Partner inquiry" : carRentalCopy ? "Rental inquiry" : mobilePhoneCopy ? "Phone shop inquiry" : cleaningCopy ? "Cleaning quote" : floristCopy ? "Floral order" : toyStoreCopy ? "Toy shop support" : realEstateCopy ? "Property consultation" : "Reservation request"}">
        <div>
          <p class="eyebrow">${upholsteryCopy ? "Upholstery estimate" : dentalCopy ? "Dental appointment" : beverageCopy ? "Partner inquiry" : carRentalCopy ? "Rental inquiry" : mobilePhoneCopy ? "Phone shop inquiry" : cleaningCopy ? "Cleaning quote" : floristCopy ? "Floral order" : toyStoreCopy ? "Toy shop support" : realEstateCopy ? "Property consultation" : "Reservation request"}</p>
          <h2>${upholsteryCopy ? "Tell us about the furniture, fabric, leather repair, or custom cushion work you need." : dentalCopy ? "Tell us about the dental appointment, treatment, hygiene visit, or comfort need you want to plan." : beverageCopy ? "Tell us about your retail, distributor, or campaign partnership needs." : carRentalCopy ? "Tell us your pickup date, dropoff location, and preferred vehicle category." : mobilePhoneCopy ? "Tell us which phone, accessory, repair, warranty, or setup support you need." : cleaningCopy ? "Tell us about rooms, schedule, deep clean needs, and recurring cleaning preferences." : floristCopy ? "Tell us about the flowers, occasion, delivery date, colors, and arrangement style." : toyStoreCopy ? "Tell us about the age group, toy category, gift moment, delivery question, return question, or checkout support you need." : realEstateCopy ? "Tell us about listings, valuations, viewings, neighborhoods, or consultation timing." : "Tell us your preferred date, party size, and seafood notes."}</h2>
          <p>${upholsteryCopy ? "Share photos, measurements, fabric preferences, foam replacement notes, and pickup needs for a free estimate." : dentalCopy ? "Share appointment timing, dental concerns, patient comfort needs, and treatment questions before your visit." : beverageCopy ? "Share region, store count, campaign timing, and preferred cola lineup details." : carRentalCopy ? "Share driver details, airport timing, mileage questions, insurance needs, and rental plan preferences." : mobilePhoneCopy ? "Share model, storage, color, accessory needs, repair issue, trade-in question, installment plan, or warranty detail before visiting." : cleaningCopy ? "Share home cleaning, office cleaning, move-in cleaning, move-out cleaning, or recurring cleaning details for a quote." : floristCopy ? "Share bouquet, wedding, event, sympathy, delivery, and seasonal arrangement notes." : toyStoreCopy ? "Share kids' ages, preferred toys, educational goals, plush or puzzle interests, building block sets, delivery timing, and return questions." : realEstateCopy ? "Share property goals, listing questions, valuation needs, buyer plans, seller plans, and viewing requests." : "Share allergies, raw bar preferences, private dining requests, or seasonal catch questions before your visit."}</p>
        </div>
        <form>
          <label>Name <input type="text" name="name" autocomplete="name" /></label>
          <label>Email <input type="email" name="email" autocomplete="email" /></label>
          <label>${upholsteryCopy ? "Furniture and fabric notes" : dentalCopy ? "Appointment notes" : beverageCopy ? "Partnership notes" : carRentalCopy ? "Rental notes" : mobilePhoneCopy ? "Phone shop notes" : cleaningCopy ? "Cleaning notes" : floristCopy ? "Arrangement notes" : toyStoreCopy ? "Toy and gift notes" : realEstateCopy ? "Property notes" : "Reservation notes"} <textarea name="notes" rows="4"></textarea></label>
          <button class="button" type="button">${upholsteryCopy ? "Send estimate request" : dentalCopy ? "Book appointment" : beverageCopy ? "Send partnership inquiry" : carRentalCopy ? "Send rental inquiry" : mobilePhoneCopy ? "Send phone inquiry" : cleaningCopy ? "Book a cleaning" : floristCopy ? "Order flowers" : toyStoreCopy ? "Ask about toys" : realEstateCopy ? "Schedule a consultation" : "Send reservation request"}</button>
        </form>
      </section>` : ""}
    </main>
    <footer>
      <span>${escapeHtml(input.brandName)}</span>
      <span>${escapeHtml(upholsteryCopy ? "Sofa reupholstery, chair restoration, fabric selection, leather repair, custom cushions, free estimates, and before and after workmanship." : dentalCopy ? "Dental appointments, hygiene, treatments, comfort, emergency guidance, and patient trust." : beverageCopy ? "Bold cola flavor, sparkling bottles, campaign launches, and regional distribution partnerships." : carRentalCopy ? "Rental cars, vehicle fleet, booking, pickup and dropoff, insurance, mileage, and roadside support." : mobilePhoneCopy ? "Smartphones, iPhone, Samsung, Android phones, accessories, warranty, repairs, trade-ins, and device setup support." : seafoodCopy ? "Ocean-inspired seafood dining, seasonal catch, reservations, and warm hospitality." : cleaningCopy ? "Home cleaning, office cleaning, deep clean visits, trusted cleaners, local reviews, and recurring schedules." : floristCopy ? "Fresh flowers, bouquets, wedding arrangements, event florals, delivery, and seasonal collections." : toyStoreCopy ? "Toy shop categories, educational toys, plush toys, puzzles, building blocks, age groups, safe checkout, delivery, returns, and gift picks." : realEstateCopy ? "Property listings, buyers, sellers, viewings, valuations, neighborhoods, and agent consultation." : input.plan.visualStrategy)}</span>
      <a href="mailto:hello@example.com">hello@example.com</a>
    </footer>
    <script src="./main.js"></script>
  </body>
</html>
`;
}

export function renderWebsitePlanFiles(input: {
  brandName: string;
  plan: WebsitePlan;
}) {
  const files: Record<string, string> = {
    "main.js": `document.querySelectorAll(".section-card, .visual").forEach((element, index) => {
  element.style.setProperty("--stagger", String(index));
});
`,
    "styles.css": renderWebsitePlanCss(input.plan)
  };

  input.plan.pages.forEach((page) => {
    files[pageToPath(page)] = renderPage({
      brandName: input.brandName,
      page,
      plan: input.plan
    });
  });

  if (!files["index.html"]) {
    files["index.html"] = renderPage({
      brandName: input.brandName,
      page: "home",
      plan: input.plan
    });
  }

  return files;
}

function renderWebsitePlanCss(plan: WebsitePlan) {
  const cssVariables = Object.entries(plan.designTokens.cssVariables)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
  const direction = getWebsiteCreativeDirection({ plan });
  const colorScheme = direction.palette.background.toLowerCase().startsWith("#0") ? "dark" : "light";

  return `:root {
  color-scheme: ${colorScheme};
${cssVariables}
  --color-bg: ${direction.palette.background};
  --color-surface: ${direction.palette.surface};
  --color-surface-alt: ${direction.palette.surfaceAlt};
  --color-text: ${direction.palette.text};
  --color-muted: ${direction.palette.mutedText};
  --color-primary: ${direction.palette.primary};
  --color-primary-dark: ${direction.palette.primaryDark};
  --color-accent: ${direction.palette.accent};
  --color-border: ${direction.palette.border};
  --font-heading: ${direction.typography.headingFont};
  --font-body: ${direction.typography.bodyFont};
  --font-size-body: ${direction.typography.baseSizePx}px;
  --line-height-body: ${direction.typography.lineHeight};
  --scale-h1: ${direction.typography.scale.h1};
  --scale-h2: ${direction.typography.scale.h2};
  --scale-h3: ${direction.typography.scale.h3};
  --scale-body: ${direction.typography.scale.body};
  --scale-small: ${direction.typography.scale.small};
  --display-weight: ${direction.typography.displayWeight};
  --heading-weight: ${direction.typography.headingWeight};
  --body-weight: ${direction.typography.bodyWeight};
  --radius-card: ${direction.spacing.cardRadius};
  --radius-button: var(--token-radius-pill);
  --shadow-soft: 0 24px 70px color-mix(in srgb, var(--color-primary-dark) 18%, transparent);
  --container: ${direction.spacing.containerWidth};
  --section-padding: ${direction.spacing.sectionPadding};
  --card-padding: ${direction.spacing.cardPadding};
  --hero-treatment: ${direction.hero.backgroundTreatment};
  --proof-treatment: ${direction.proof.visualTreatment};
  font-family: var(--font-body);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: var(--font-body);
  font-size: var(--font-size-body);
  font-weight: var(--body-weight);
  line-height: var(--line-height-body);
  background:
    radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--color-accent) 22%, transparent), transparent 30rem),
    radial-gradient(circle at 82% 16%, color-mix(in srgb, var(--color-primary) 18%, transparent), transparent 27rem),
    linear-gradient(135deg, var(--color-bg), color-mix(in srgb, var(--color-bg) 78%, var(--color-surface-alt))),
    var(--color-bg);
  color: var(--color-text);
}
a { color: inherit; text-decoration: none; }
.site-header, main, footer { margin: 0 auto; max-width: var(--token-layout-max-width); }
.site-header, footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.1rem clamp(1rem, 4vw, 2rem);
}
.brand { font-family: var(--font-heading); font-weight: var(--heading-weight); letter-spacing: 0; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--color-muted); font-size: 0.92rem; }
main { max-width: var(--container); padding: var(--token-spacing-xl) var(--token-spacing-page); }
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(17rem, 0.72fr);
  gap: clamp(1.5rem, 5vw, 4rem);
  align-items: center;
  padding: var(--section-padding);
  border-radius: calc(var(--radius-card) * 1.35);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--color-surface) 88%, transparent), color-mix(in srgb, var(--color-surface-alt) 52%, transparent));
}
.hero-copy { min-width: 0; }
.eyebrow {
  color: var(--color-accent);
  font-size: 0.76rem;
  font-weight: 850;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1, h2, p { margin: 0; }
h1, h2, h3 { font-family: var(--font-heading); letter-spacing: 0; }
h1 {
  max-width: 13ch;
  font-size: var(--scale-h1);
  font-weight: var(--display-weight);
  line-height: 0.95;
}
h2 { margin-top: 0.5rem; font-size: var(--scale-h2); font-weight: var(--heading-weight); line-height: 1.08; }
h3 { font-size: var(--scale-h3); }
.lede, .section-card p, footer { color: var(--color-muted); line-height: 1.72; }
.lede { margin-top: 1rem; max-width: 650px; font-size: clamp(1rem, 1.8vw, 1.2rem); }
.hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem; margin-top: 1.25rem; }
.button {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--color-accent) 60%, transparent);
  border-radius: var(--radius-button);
  background: var(--color-accent);
  color: var(--color-primary-dark);
  padding: var(--button-padding);
  font-weight: 850;
}
.button-secondary { background: transparent; color: var(--color-text); }
.proof-pill {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  color: var(--color-muted);
  padding: 0.7rem 0.95rem;
  font-size: var(--scale-small);
}
.section-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 1rem;
  margin-top: clamp(2rem, 5vw, 4rem);
}
.section-card, .visual, .proof-band {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  backdrop-filter: blur(16px) saturate(120%);
  box-shadow: var(--shadow-soft);
}
.section-card { display: grid; gap: 0.9rem; padding: var(--card-padding); }
.section-card span { color: var(--color-primary); font-size: 0.76rem; font-weight: 900; }
.proof-band {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: clamp(1rem, 3vw, 2rem);
  margin-top: clamp(1.4rem, 4vw, 3rem);
  padding: var(--card-padding);
}
.proof-list { display: grid; gap: 0.75rem; }
.proof-list article { border-left: 3px solid var(--color-accent); padding-left: 0.85rem; }
.proof-list span { color: var(--color-accent); font-size: var(--scale-small); font-weight: 900; }
.contact-form {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(18rem, 1fr);
  gap: var(--token-spacing-lg);
  margin-top: var(--token-spacing-xl);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  padding: var(--card-padding);
}
form { display: grid; gap: 0.85rem; }
label { display: grid; gap: 0.35rem; color: var(--color-muted); font-size: 0.9rem; }
input, textarea {
  width: 100%;
  border: 1px solid var(--color-border);
  border-radius: var(--token-radius-md);
  background: color-mix(in srgb, var(--color-surface-alt) 48%, transparent);
  color: var(--color-text);
  padding: 0.85rem 0.9rem;
  font: inherit;
}
.visual {
  display: grid;
  min-height: 18rem;
  place-items: center;
  overflow: hidden;
  padding: 1.5rem;
  text-align: center;
  font-size: clamp(1.3rem, 4vw, 3rem);
  font-weight: 950;
}
.visual span { max-width: 10ch; }
.visual-1 { background: radial-gradient(circle at 22% 18%, color-mix(in srgb, var(--color-accent) 34%, transparent), transparent 8rem), linear-gradient(135deg, color-mix(in srgb, var(--color-surface-alt) 84%, var(--color-accent)), color-mix(in srgb, var(--color-surface) 72%, var(--color-primary))); }
.visual-2 { background: radial-gradient(circle at 70% 20%, color-mix(in srgb, var(--color-accent) 32%, transparent), transparent 9rem), linear-gradient(145deg, var(--color-surface-alt), color-mix(in srgb, var(--color-surface) 78%, var(--color-primary))); }
.visual-3 { background: radial-gradient(circle at 32% 70%, color-mix(in srgb, var(--color-primary) 30%, transparent), transparent 10rem), linear-gradient(145deg, var(--color-surface-alt), color-mix(in srgb, var(--color-surface) 78%, var(--color-accent))); }
.visual-4 { background: linear-gradient(135deg, color-mix(in srgb, var(--color-text) 8%, transparent), color-mix(in srgb, var(--color-accent) 22%, transparent), color-mix(in srgb, var(--color-primary) 22%, transparent)); }
.creative-trust-clinic .hero { grid-template-columns: minmax(0, 1fr); text-align: center; }
.creative-booking-focused .hero { grid-template-columns: minmax(0, 0.82fr) minmax(18rem, 1fr); }
.creative-retail-showcase .visual { min-height: 23rem; border-radius: 28px; }
.creative-luxury-gallery .section-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); }
.creative-service-local .hero { border-radius: 26px; }
body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 2; }
@media (max-width: 860px) {
  .site-header, footer { align-items: flex-start; flex-direction: column; }
  .hero, .contact-form, .proof-band { grid-template-columns: 1fr; }
  .creative-luxury-gallery .section-grid { grid-template-columns: 1fr; }
  body[data-layout="${plan.layoutType}"] .section-card:first-child { grid-column: span 1; }
}
`;
}
