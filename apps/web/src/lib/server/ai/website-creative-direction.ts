import type { WebsiteGenerationBrief } from "@/lib/server/ai/generation-brief";
import type { DomainId } from "@/lib/server/ai/industry-taxonomy";
import type { WebsitePlan } from "@/lib/server/ai/website-planner";

export type WebsiteCreativeDirection = {
  domainId: string;
  visualArchetype: string;
  palette: {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    mutedText: string;
    primary: string;
    primaryDark: string;
    accent: string;
    border: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    displayWeight: number;
    headingWeight: number;
    bodyWeight: number;
    baseSizePx: number;
    lineHeight: number;
    scale: {
      h1: string;
      h2: string;
      h3: string;
      body: string;
      small: string;
    };
  };
  spacing: {
    sectionPadding: string;
    containerWidth: string;
    cardRadius: string;
    cardPadding: string;
    density: "airy" | "balanced" | "compact";
  };
  hero: {
    layout: "booking-focused" | "editorial" | "luxury-gallery" | "retail-showcase" | "service-local" | "split-proof" | "trust-clinic";
    eyebrow: string;
    proofPlacement: "after-services" | "below-hero" | "hero-side";
    backgroundTreatment: string;
  };
  conversion: {
    primaryCtaPlacement: "above-fold-and-repeat";
    secondaryCtaPlacement: "after-proof" | "after-services" | "footer";
    ctaStyle: string;
  };
  proof: {
    type: "before-after" | "fleet-highlights" | "gallery-proof" | "local-reviews" | "menu-signature" | "property-highlights" | "trust-badges";
    sectionTitle: string;
    visualTreatment: string;
  };
  rhythm: {
    homeSections: string[];
    avoidPatterns: string[];
  };
};

const priorityDomains: DomainId[] = [
  "upholstery",
  "dental_clinic",
  "mobile_phone_shop",
  "car_rental",
  "seafood_restaurant",
  "cleaning_service",
  "florist",
  "real_estate"
];

function baseDirection(domainId: string): WebsiteCreativeDirection {
  return {
    conversion: {
      ctaStyle: "high-contrast rounded button with calm hover lift",
      primaryCtaPlacement: "above-fold-and-repeat",
      secondaryCtaPlacement: "after-services"
    },
    domainId,
    hero: {
      backgroundTreatment: "layered surface with subtle radial highlight",
      eyebrow: "Domain-specific service",
      layout: "split-proof",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#b78b4a",
      background: "#fbf7f0",
      border: "rgba(63, 45, 30, 0.14)",
      mutedText: "#6c6258",
      primary: "#8b5e34",
      primaryDark: "#3d291a",
      surface: "rgba(255, 252, 246, 0.86)",
      surfaceAlt: "#efe2d1",
      text: "#241a12"
    },
    proof: {
      sectionTitle: "Proof that makes the next step feel safe",
      type: "trust-badges",
      visualTreatment: "quiet proof cards"
    },
    rhythm: {
      avoidPatterns: ["generic hero", "three identical cards", "generic testimonials"],
      homeSections: ["hero", "services", "proof", "process", "cta"]
    },
    spacing: {
      cardPadding: "clamp(1.2rem, 2.5vw, 2rem)",
      cardRadius: "18px",
      containerWidth: "1180px",
      density: "balanced",
      sectionPadding: "clamp(3.5rem, 8vw, 7rem)"
    },
    typography: {
      baseSizePx: 17,
      bodyFont: "\"Inter\", \"Segoe UI\", Arial, sans-serif",
      bodyWeight: 400,
      displayWeight: 760,
      headingFont: "\"Fraunces\", \"Georgia\", serif",
      headingWeight: 720,
      lineHeight: 1.65,
      scale: {
        body: "1rem",
        h1: "clamp(3rem, 7vw, 6.8rem)",
        h2: "clamp(1.8rem, 4vw, 3.2rem)",
        h3: "clamp(1.1rem, 2vw, 1.35rem)",
        small: "0.86rem"
      }
    },
    visualArchetype: "Premium local service"
  };
}

const directions: Partial<Record<DomainId, WebsiteCreativeDirection>> = {
  upholstery: {
    ...baseDirection("upholstery"),
    hero: {
      backgroundTreatment: "warm fabric texture panels with before/after proof side",
      eyebrow: "Premium upholstery workshop",
      layout: "editorial",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#c17a4b",
      background: "#f5eadb",
      border: "rgba(74, 44, 24, 0.18)",
      mutedText: "#755f4f",
      primary: "#8b4d2a",
      primaryDark: "#3a2116",
      surface: "rgba(255, 248, 238, 0.9)",
      surfaceAlt: "#e4c9aa",
      text: "#28170f"
    },
    proof: {
      sectionTitle: "Before, after, fabric, and workmanship proof",
      type: "before-after",
      visualTreatment: "fabric swatches, restoration cards, and workshop notes"
    },
    rhythm: {
      avoidPatterns: ["techy SaaS blue", "catalog storefront", "clinical white"],
      homeSections: ["hero", "before-after", "services", "fabric-guidance", "process", "estimate-cta"]
    },
    visualArchetype: "Warm craft studio"
  },
  dental_clinic: {
    ...baseDirection("dental_clinic"),
    hero: {
      backgroundTreatment: "clean white surfaces with soft teal trust badges",
      eyebrow: "Modern dental care",
      layout: "trust-clinic",
      proofPlacement: "below-hero"
    },
    palette: {
      accent: "#2bb8a6",
      background: "#f7fbfc",
      border: "rgba(25, 83, 96, 0.12)",
      mutedText: "#61747b",
      primary: "#1f8ea1",
      primaryDark: "#0d4757",
      surface: "rgba(255, 255, 255, 0.92)",
      surfaceAlt: "#e5f5f7",
      text: "#122f38"
    },
    proof: {
      sectionTitle: "Gentle care, credentials, comfort, and appointment trust",
      type: "trust-badges",
      visualTreatment: "clean credential cards and comfort badges"
    },
    rhythm: {
      avoidPatterns: ["rustic craft", "restaurant warmth", "aggressive sales"],
      homeSections: ["hero", "care-highlights", "treatments", "comfort-proof", "patient-trust", "appointment-cta"]
    },
    typography: {
      ...baseDirection("dental_clinic").typography,
      headingFont: "\"Aptos Display\", \"Segoe UI\", Arial, sans-serif",
      bodyFont: "\"Aptos\", \"Segoe UI\", Arial, sans-serif"
    },
    visualArchetype: "Calm clinical trust"
  },
  mobile_phone_shop: {
    ...baseDirection("mobile_phone_shop"),
    hero: {
      backgroundTreatment: "graphite device cards with electric accent rails",
      eyebrow: "Smartphone retail and service",
      layout: "retail-showcase",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#42e8ff",
      background: "#080b10",
      border: "rgba(120, 226, 255, 0.18)",
      mutedText: "#a9b8c5",
      primary: "#5b8cff",
      primaryDark: "#111827",
      surface: "rgba(18, 24, 34, 0.9)",
      surfaceAlt: "#111827",
      text: "#f5fbff"
    },
    proof: {
      sectionTitle: "Repairs, trade-ins, accessories, warranty, and setup support",
      type: "trust-badges",
      visualTreatment: "device cards, repair counter strips, and support badges"
    },
    rhythm: {
      avoidPatterns: ["restaurant menu", "car booking", "rustic craft"],
      homeSections: ["hero", "device-categories", "repair-trade-in", "warranty-proof", "phone-cta"]
    },
    typography: {
      ...baseDirection("mobile_phone_shop").typography,
      headingFont: "\"Sora\", \"Segoe UI\", Arial, sans-serif",
      bodyFont: "\"Inter\", \"Segoe UI\", Arial, sans-serif"
    },
    visualArchetype: "Sharp tech retail"
  },
  car_rental: {
    ...baseDirection("car_rental"),
    hero: {
      backgroundTreatment: "fleet booking panel with route and rate highlights",
      eyebrow: "Fleet booking",
      layout: "booking-focused",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#f6b338",
      background: "#101722",
      border: "rgba(246, 179, 56, 0.2)",
      mutedText: "#b7c1ce",
      primary: "#2f80ed",
      primaryDark: "#07111f",
      surface: "rgba(22, 32, 47, 0.9)",
      surfaceAlt: "#182638",
      text: "#f7fbff"
    },
    proof: {
      sectionTitle: "Fleet categories, insurance, pickup, dropoff, and transparent rates",
      type: "fleet-highlights",
      visualTreatment: "fleet cards and booking proof rows"
    },
    rhythm: {
      avoidPatterns: ["restaurant warmth", "floral palette", "craft language"],
      homeSections: ["hero", "fleet-categories", "rental-benefits", "pickup-insurance", "rates-booking-cta"]
    },
    typography: {
      ...baseDirection("car_rental").typography,
      headingFont: "\"Aptos Display\", \"Segoe UI\", Arial, sans-serif",
      bodyFont: "\"Inter\", \"Segoe UI\", Arial, sans-serif"
    },
    visualArchetype: "Efficient booking and fleet"
  },
  seafood_restaurant: {
    ...baseDirection("seafood_restaurant"),
    hero: {
      backgroundTreatment: "deep ocean editorial surface with menu signature proof",
      eyebrow: "Fresh coastal dining",
      layout: "editorial",
      proofPlacement: "below-hero"
    },
    palette: {
      accent: "#ff8f70",
      background: "#092734",
      border: "rgba(141, 218, 225, 0.18)",
      mutedText: "#c7d7d4",
      primary: "#49c7d8",
      primaryDark: "#04161d",
      surface: "rgba(10, 48, 61, 0.88)",
      surfaceAlt: "#f2ddc3",
      text: "#fff8ee"
    },
    proof: {
      sectionTitle: "Signature dishes, fresh catch, chef specials, and reservations",
      type: "menu-signature",
      visualTreatment: "menu cards, fresh catch highlights, and reservation proof"
    },
    rhythm: {
      avoidPatterns: ["coffee cafe", "fleet booking", "generic restaurant"],
      homeSections: ["hero", "fresh-catch-menu", "chef-specials", "reservation-proof", "location-hours-cta"]
    },
    visualArchetype: "Coastal premium dining"
  },
  cleaning_service: {
    ...baseDirection("cleaning_service"),
    hero: {
      backgroundTreatment: "bright cleaning-team panels with fresh checklist proof",
      eyebrow: "Fresh local cleaning",
      layout: "service-local",
      proofPlacement: "below-hero"
    },
    palette: {
      accent: "#4ecb87",
      background: "#f6fbf9",
      border: "rgba(40, 130, 102, 0.14)",
      mutedText: "#5c746d",
      primary: "#2c9ec5",
      primaryDark: "#145064",
      surface: "rgba(255, 255, 255, 0.92)",
      surfaceAlt: "#def3eb",
      text: "#12352e"
    },
    proof: {
      sectionTitle: "Insured service, recurring cleaning, move-in/move-out, and local reviews",
      type: "local-reviews",
      visualTreatment: "checklist cards and clean-room proof"
    },
    rhythm: {
      avoidPatterns: ["clinical dental", "restaurant dining", "property layout"],
      homeSections: ["hero", "cleaning-packages", "insured-proof", "local-reviews", "booking-cta"]
    },
    typography: {
      ...baseDirection("cleaning_service").typography,
      headingFont: "\"Nunito Sans\", \"Segoe UI\", Arial, sans-serif",
      bodyFont: "\"Inter\", \"Segoe UI\", Arial, sans-serif"
    },
    visualArchetype: "Fresh organized cleaning team"
  },
  florist: {
    ...baseDirection("florist"),
    hero: {
      backgroundTreatment: "soft floral gallery with seasonal arrangement proof",
      eyebrow: "Seasonal floral design",
      layout: "luxury-gallery",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#d76f92",
      background: "#fbf1ea",
      border: "rgba(82, 95, 58, 0.16)",
      mutedText: "#76665f",
      primary: "#54724a",
      primaryDark: "#24351f",
      surface: "rgba(255, 250, 244, 0.9)",
      surfaceAlt: "#ead1d8",
      text: "#2e241f"
    },
    proof: {
      sectionTitle: "Arrangements, weddings, sympathy flowers, delivery, and seasonal collections",
      type: "gallery-proof",
      visualTreatment: "occasion tiles and floral arrangement gallery"
    },
    rhythm: {
      avoidPatterns: ["clinical", "tech retail", "car rental"],
      homeSections: ["hero", "occasions", "featured-arrangements", "delivery-event-proof", "order-cta"]
    },
    visualArchetype: "Elegant seasonal floral gallery"
  },
  real_estate: {
    ...baseDirection("real_estate"),
    hero: {
      backgroundTreatment: "premium property gallery with local market proof",
      eyebrow: "Local property guidance",
      layout: "luxury-gallery",
      proofPlacement: "hero-side"
    },
    palette: {
      accent: "#c2a15a",
      background: "#f8f5ef",
      border: "rgba(25, 39, 55, 0.14)",
      mutedText: "#66707c",
      primary: "#174c4f",
      primaryDark: "#101d2b",
      surface: "rgba(255, 255, 255, 0.92)",
      surfaceAlt: "#e9dfce",
      text: "#17202c"
    },
    proof: {
      sectionTitle: "Listings, local expertise, buyer/seller guidance, and testimonials",
      type: "property-highlights",
      visualTreatment: "property cards and market guidance panels"
    },
    rhythm: {
      avoidPatterns: ["construction generic", "restaurant style", "mobile shop"],
      homeSections: ["hero", "buyer-seller-paths", "property-local-proof", "testimonials", "consultation-cta"]
    },
    visualArchetype: "Premium local property expert"
  }
};

function domainFrom(input: { brief?: WebsiteGenerationBrief | null; plan: WebsitePlan }) {
  return input.brief?.domainId ?? input.plan.sourceOfTruthDomain ?? input.plan.industry;
}

export function isPriorityWebsiteDomain(domainId: string | null | undefined): domainId is DomainId {
  return Boolean(domainId && priorityDomains.includes(domainId as DomainId));
}

export function getWebsiteCreativeDirection(input: {
  brief?: WebsiteGenerationBrief | null;
  plan: WebsitePlan;
}): WebsiteCreativeDirection {
  const domainId = domainFrom(input);

  if (isPriorityWebsiteDomain(domainId)) {
    return directions[domainId] ?? baseDirection(domainId);
  }

  return baseDirection(domainId ?? "generic");
}

export function summarizeCreativeDirection(direction: WebsiteCreativeDirection) {
  return {
    bodyFont: direction.typography.bodyFont,
    ctaPlacement: `Primary CTA ${direction.conversion.primaryCtaPlacement}; secondary CTA ${direction.conversion.secondaryCtaPlacement}`,
    headingFont: direction.typography.headingFont,
    heroLayout: direction.hero.layout,
    palette: `${direction.palette.background}, ${direction.palette.surface}, ${direction.palette.primary}, ${direction.palette.accent}`,
    proofStrategy: `${direction.proof.type}: ${direction.proof.sectionTitle}`,
    rhythm: direction.rhythm.homeSections.join(" -> "),
    visualArchetype: direction.visualArchetype
  };
}
