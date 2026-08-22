export type WebsiteMediaProvider =
  | "dicebear"
  | "dummyjson"
  | "fakestore"
  | "local_svg"
  | "picsum"
  | "robohash"
  | "ui_avatars"
  | "unsplash"
  | "workspace";

export type WebsiteMediaAttributionPolicy = {
  creatorName?: string;
  creatorUrl?: string;
  display: "editor_only" | "none" | "required_visible" | "subtle_visible";
  editorWarning?: string;
  label?: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type WebsiteMediaAsset = {
  alt: string;
  aspectRatio: string;
  attributionPolicy: WebsiteMediaAttributionPolicy;
  decorative: boolean;
  fallbackAsset: string;
  forbiddenDomains: string[];
  height: number;
  id: string;
  lastVerifiedAt: string;
  licenseNote?: string;
  provider: WebsiteMediaProvider;
  reliability: "curated" | "placeholder" | "prototype";
  role: "card" | "hero" | "logo" | "team";
  semanticTags: string[];
  url: string;
  width: number;
};

export type WebsiteMediaProviderPolicy = {
  allowedUses: string[];
  forbiddenUses: string[];
  licenseNote: string;
  reliability: WebsiteMediaAsset["reliability"];
};

export const WEBSITE_MEDIA_PROVIDER_POLICIES: Record<WebsiteMediaProvider, WebsiteMediaProviderPolicy> = {
  dicebear: {
    allowedUses: ["deterministic avatar placeholders", "fictional community members", "technology profiles"],
    forbiddenUses: ["unmarked real-person claims", "cartoon legal or medical testimonials"],
    licenseNote: "DiceBear 10.x Initials style is CC0 1.0; keep the style and license record with the project.",
    reliability: "curated"
  },
  dummyjson: {
    allowedUses: ["clearly marked prototype product media"],
    forbiddenUses: ["real inventory claims", "cross-domain product imagery"],
    licenseNote: "DummyJSON content is sample data for prototypes; verify source rights before production use.",
    reliability: "prototype"
  },
  fakestore: {
    allowedUses: ["clearly marked prototype fashion and accessories media"],
    forbiddenUses: ["real inventory claims", "electronics classification for apparel"],
    licenseNote: "Fake Store API media is prototype data; replace or verify rights before production use.",
    reliability: "prototype"
  },
  local_svg: {
    allowedUses: ["domain-aligned fallbacks", "decorative compositions", "offline-safe media"],
    forbiddenUses: ["claims that generated artwork depicts a real product or person"],
    licenseNote: "Generated locally with the website output.",
    reliability: "curated"
  },
  picsum: {
    allowedUses: ["non-critical deterministic placeholder texture"],
    forbiddenUses: ["primary semantic product, clinic, property, vehicle, restaurant, or watch media"],
    licenseNote: "Placeholder service only; source and image rights must be reviewed separately.",
    reliability: "placeholder"
  },
  robohash: {
    allowedUses: ["fictional robotics, AI, and playful developer identities"],
    forbiddenUses: ["human testimonials", "unrelated legal, medical, or service teams"],
    licenseNote: "Robohash output requires CC BY attribution.",
    reliability: "placeholder"
  },
  ui_avatars: {
    allowedUses: ["neutral initials", "editable professional team placeholders"],
    forbiddenUses: ["claims that initials are real staff photographs"],
    licenseNote: "Generated initials are placeholders; review the provider terms before launch.",
    reliability: "placeholder"
  },
  unsplash: {
    allowedUses: ["fixed semantically curated editorial photography"],
    forbiddenUses: ["random image selection", "cross-domain product substitution", "unattributed production launch"],
    licenseNote: "Keep Unsplash attribution and replace or confirm photographer credit before production launch.",
    reliability: "curated"
  },
  workspace: {
    allowedUses: ["user-supplied website media", "product imagery", "brand and editorial artwork"],
    forbiddenUses: ["unrelated uploads", "sequence-frame duplication", "unsupported ownership claims"],
    licenseNote: "Supplied through the selected project workspace; the project owner remains responsible for usage rights.",
    reliability: "curated"
  }
};

const verifiedAt = "2026-07-14";

function fallbackName(domain: string, id: string) {
  const safeDomain = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
  const safeId = id.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "media";
  return `assets/${safeDomain}-${safeId}-fallback.svg`;
}

function asset(input: Omit<WebsiteMediaAsset, "lastVerifiedAt">): WebsiteMediaAsset {
  return { ...input, lastVerifiedAt: verifiedAt };
}

function unsplash(input: {
  alt: string;
  domain: string;
  id: string;
  photoId: string;
  role: WebsiteMediaAsset["role"];
  tags: string[];
  width?: number;
}) {
  const width = input.width ?? 1400;
  return asset({
    alt: input.alt,
    aspectRatio: "3 / 2",
    attributionPolicy: {
      display: "subtle_visible",
      editorWarning: "Confirm the photographer credit and image license before production launch.",
      label: "Image source: Unsplash",
      sourceName: "Unsplash",
      sourceUrl: `https://unsplash.com/photos/${input.photoId}`
    },
    decorative: false,
    fallbackAsset: fallbackName(input.domain, input.id),
    forbiddenDomains: [],
    height: Math.round(width * 2 / 3),
    id: input.id,
    licenseNote: WEBSITE_MEDIA_PROVIDER_POLICIES.unsplash.licenseNote,
    provider: "unsplash",
    reliability: "curated",
    role: input.role,
    semanticTags: input.tags,
    url: `https://images.unsplash.com/${input.photoId}?auto=format&fit=crop&w=${width}&q=82`,
    width
  });
}

function prototypeAsset(input: {
  alt: string;
  domain: string;
  id: string;
  provider: "dummyjson" | "fakestore";
  role: WebsiteMediaAsset["role"];
  tags: string[];
  url: string;
}) {
  return asset({
    alt: input.alt,
    aspectRatio: "1 / 1",
    attributionPolicy: {
      display: "editor_only",
      editorWarning: "Prototype product media must be replaced or its usage rights verified before production launch.",
      sourceName: input.provider === "dummyjson" ? "DummyJSON" : "Fake Store API",
      sourceUrl: input.provider === "dummyjson" ? "https://dummyjson.com/docs/products" : "https://fakestoreapi.com/"
    },
    decorative: false,
    fallbackAsset: fallbackName(input.domain, input.id),
    forbiddenDomains: ["dental", "electronics", "legal", "restaurant"],
    height: 800,
    id: input.id,
    licenseNote: WEBSITE_MEDIA_PROVIDER_POLICIES[input.provider].licenseNote,
    provider: input.provider,
    reliability: "prototype",
    role: input.role,
    semanticTags: input.tags,
    url: input.url,
    width: 800
  });
}

function avatar(input: { brandName: string; domain: string; id: string; legal: boolean }) {
  const name = `${input.brandName} ${input.id.replace(/-/g, " ")}`;
  const provider = input.legal ? "ui_avatars" as const : "dicebear" as const;
  const url = input.legal
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=E8E2D9&color=1A1A1A&size=256&format=svg`
    : `https://api.dicebear.com/10.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundType=gradientLinear`;
  return asset({
    alt: `Editable initials placeholder for ${name}`,
    aspectRatio: "1 / 1",
    attributionPolicy: {
      display: input.legal ? "editor_only" : "subtle_visible",
      editorWarning: input.legal ? "Replace placeholder initials with verified team media before launch." : undefined,
      label: input.legal ? undefined : "Initials by DiceBear",
      sourceName: input.legal ? "UI Avatars" : "DiceBear",
      sourceUrl: input.legal ? "https://ui-avatars.com/" : "https://www.dicebear.com/styles/initials/"
    },
    decorative: false,
    fallbackAsset: fallbackName(input.domain, input.id),
    forbiddenDomains: [],
    height: 256,
    id: input.id,
    licenseNote: WEBSITE_MEDIA_PROVIDER_POLICIES[provider].licenseNote,
    provider,
    reliability: input.legal ? "placeholder" : "curated",
    role: "team",
    semanticTags: ["initials", "placeholder", input.domain],
    url,
    width: 256
  });
}

function domainKey(text: string) {
  const value = text.toLowerCase();
  if (/watch|timepiece|horology|mechanical movement/.test(value)) return "watch";
  if (/tv|television|oled|qled|home cinema|electronics/.test(value)) return "television";
  if (/\b(?:car|automotive|vehicle|sports-car|sports car)\b/.test(value)) return "automotive";
  if (/beauty|cosmetic|mascara|skincare/.test(value)) return "beauty";
  if (/fashion|footwear|sneaker|clothing|backpack/.test(value)) return "fashion";
  if (/restaurant|dining|menu|cafe/.test(value)) return "restaurant";
  if (/real estate|property|architecture|realty/.test(value)) return "real-estate";
  if (/legal|lawyer|attorney|law firm/.test(value)) return "legal";
  if (/developer community|developer-community|community app/.test(value)) return "developer-community";
  if (/dental|clinic|medical|healthcare/.test(value)) return "dental";
  if (/crm|saas|financial workflow|finance software/.test(value)) return "saas";
  if (/portfolio|creative director|art director/.test(value)) return "portfolio";
  return "general";
}

export function buildWebsiteMediaRegistry(input: {
  brandName: string;
  businessType: string;
  domainId: string | null;
  prompt: string;
}): WebsiteMediaAsset[] {
  const domain = domainKey(`${input.prompt} ${input.businessType} ${input.domainId ?? ""}`);

  if (domain === "watch") {
    return [unsplash({ alt: "Mechanical wristwatch shown as an editable product reference", domain, id: "watch-hero", photoId: "photo-1523275335684-37898b6baf30", role: "hero", tags: ["watch", "wearable", "timepiece"] })];
  }
  if (domain === "television") {
    return [
      unsplash({ alt: "Television display in a contemporary living space", domain, id: "tv-hero", photoId: "photo-1593359677879-a4bb92f829d1", role: "hero", tags: ["television", "display", "home cinema"] }),
      unsplash({ alt: "Headphones representing an audio accessory category", domain, id: "audio-accessory", photoId: "photo-1505740420928-5e560c06d30e", role: "card", tags: ["headphones", "audio", "electronics"] })
    ];
  }
  if (domain === "automotive") {
    return [unsplash({ alt: "Sports car photographed on a road", domain, id: "car-hero", photoId: "photo-1503376780353-7e6692767b70", role: "hero", tags: ["car", "automotive", "vehicle"] })];
  }
  if (domain === "beauty") {
    return [unsplash({ alt: "Beauty products arranged for an editorial cosmetics story", domain, id: "beauty-hero", photoId: "photo-1596462502278-27bfdc403348", role: "hero", tags: ["beauty", "cosmetics", "product discovery"] })];
  }
  if (domain === "fashion") {
    return [
      unsplash({ alt: "Sneaker shown as an editable footwear reference", domain, id: "sneaker-hero", photoId: "photo-1542291026-7eec264c27ff", role: "hero", tags: ["sneaker", "footwear", "fashion"] }),
      prototypeAsset({ alt: "Sample backpack for an editable accessories catalog", domain, id: "backpack-sample", provider: "fakestore", role: "card", tags: ["backpack", "accessories", "travel"], url: "https://fakestoreapi.com/img/81fPKd-2AYL._AC_SL1500_t.png" })
    ];
  }
  if (domain === "restaurant") {
    return [unsplash({ alt: "Restaurant dining table prepared for guests", domain, id: "restaurant-hero", photoId: "photo-1414235077428-338989a2e8c0", role: "hero", tags: ["restaurant", "dining", "hospitality"] })];
  }
  if (domain === "real-estate") {
    return [unsplash({ alt: "Contemporary property exterior used as an editable listing reference", domain, id: "property-hero", photoId: "photo-1600585154340-be6161a56a0c", role: "hero", tags: ["property", "architecture", "real estate"] })];
  }
  if (domain === "legal") {
    return [avatar({ brandName: input.brandName, domain, id: "team-placeholder", legal: true })];
  }
  if (domain === "developer-community") {
    return ["member-one", "member-two", "member-three"].map((id) => avatar({ brandName: input.brandName, domain, id, legal: false }));
  }
  if (domain === "portfolio") {
    return [unsplash({ alt: "Creative workspace used as an editable project-story reference", domain, id: "portfolio-hero", photoId: "photo-1497366754035-f200968a6e72", role: "hero", tags: ["creative work", "portfolio", "studio"] })];
  }

  return [];
}
