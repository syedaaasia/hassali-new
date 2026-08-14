import type {
  DesignReference,
  ReferenceFact,
  ReferenceDesignProfile,
  ReferenceResolutionStatus
} from "./design-reference-contract";

export type ReferenceCatalogEntry = {
  aliases: string[];
  canonicalDomain: string;
  category: string;
  facts: Pick<ReferenceDesignProfile, "atmosphere" | "colors" | "components" | "imagery" | "layout" | "motion" | "responsive" | "surfaces" | "typography">;
  lastVerified: string | null;
  name: string;
  profileStatus: "partial" | "resolved" | "stale";
  sourceUrl: string;
};

function catalogFact(value: string, status: ReferenceFact["status"] = "inferred"): ReferenceFact {
  return { evidenceIds: ["catalog-profile"], status, value };
}

const entries: ReferenceCatalogEntry[] = [
  {
    aliases: ["ferrari"],
    canonicalDomain: "ferrari.com",
    category: "cinematic automotive",
    facts: {
      atmosphere: [catalogFact("cinematic luxury editorial"), catalogFact("high visual weight with controlled utility density")],
      colors: [catalogFact("dark and neutral foundations with a restrained high-energy red accent"), catalogFact("high-contrast text over image-dominant sections")],
      components: [catalogFact("overlay navigation"), catalogFact("full-bleed vehicle storytelling"), catalogFact("editorial calls to action")],
      imagery: [catalogFact("large cinematic automotive photography with deliberate crops and strong subject focus")],
      layout: [catalogFact("full-bleed hero composition"), catalogFact("long-form editorial section rhythm"), catalogFact("asymmetric image and copy transitions")],
      motion: [catalogFact("cinematic sequencing is characteristic but must be verified against live or motion evidence", "uncertain")],
      responsive: [catalogFact("mobile behavior requires current viewport evidence", "unavailable")],
      surfaces: [catalogFact("mostly flat image-led surfaces with restrained separators")],
      typography: [catalogFact("display-led editorial hierarchy with compact utility labels"), catalogFact("exact font family is not asserted", "uncertain")]
    },
    lastVerified: null,
    name: "Ferrari",
    profileStatus: "partial",
    sourceUrl: "https://www.ferrari.com/"
  },
  {
    aliases: ["apple"],
    canonicalDomain: "apple.com",
    category: "minimal product storytelling",
    facts: {
      atmosphere: [catalogFact("quiet, precise, product-first minimalism")],
      colors: [catalogFact("neutral surfaces with product-specific accent color")],
      components: [catalogFact("product story panels"), catalogFact("compact navigation"), catalogFact("focused comparison blocks")],
      imagery: [catalogFact("large isolated product imagery with controlled negative space")],
      layout: [catalogFact("single-idea sections with generous whitespace and centered product storytelling")],
      motion: [catalogFact("motion behavior requires live evidence", "unavailable")],
      responsive: [catalogFact("content stacks into focused single-column product stories", "inferred")],
      surfaces: [catalogFact("clean flat surfaces with limited decorative chrome")],
      typography: [catalogFact("large direct headlines with concise supporting copy"), catalogFact("exact font family is not asserted", "uncertain")]
    },
    lastVerified: null,
    name: "Apple",
    profileStatus: "partial",
    sourceUrl: "https://www.apple.com/"
  },
  {
    aliases: ["soundcloud", "sound cloud"],
    canonicalDomain: "soundcloud.com",
    category: "creator media platform",
    facts: {
      atmosphere: [catalogFact("energetic creator-focused media utility")],
      colors: [catalogFact("neutral content surfaces with a vivid orange action accent")],
      components: [catalogFact("track rows"), catalogFact("waveform media treatment"), catalogFact("creator cards")],
      imagery: [catalogFact("square creator artwork and dense media thumbnails")],
      layout: [catalogFact("media-feed density with persistent playback-oriented hierarchy")],
      motion: [catalogFact("playback and hover motion require live evidence", "unavailable")],
      responsive: [catalogFact("media rows condense while primary playback actions remain reachable", "inferred")],
      surfaces: [catalogFact("flat feed surfaces with compact separators")],
      typography: [catalogFact("compact utility typography with strong track-title hierarchy")]
    },
    lastVerified: null,
    name: "SoundCloud",
    profileStatus: "partial",
    sourceUrl: "https://soundcloud.com/"
  },
  {
    aliases: ["snapchat", "snap chat"],
    canonicalDomain: "snapchat.com",
    category: "playful social camera",
    facts: {
      atmosphere: [catalogFact("playful, expressive, immediate, and youth-oriented")],
      colors: [catalogFact("bright yellow identity field with strong black and white contrast")],
      components: [catalogFact("bold rounded actions"), catalogFact("camera and story-led feature blocks")],
      imagery: [catalogFact("people-first mobile imagery and expressive graphic moments")],
      layout: [catalogFact("large simple statements with mobile-product storytelling")],
      motion: [catalogFact("playful motion is characteristic but requires observed evidence", "uncertain")],
      responsive: [catalogFact("mobile-first stacking and large touch-oriented actions", "inferred")],
      surfaces: [catalogFact("high-contrast flat surfaces with rounded interactive elements")],
      typography: [catalogFact("bold friendly display text with concise supporting copy")]
    },
    lastVerified: null,
    name: "Snapchat",
    profileStatus: "partial",
    sourceUrl: "https://www.snapchat.com/"
  },
  {
    aliases: ["stripe"],
    canonicalDomain: "stripe.com",
    category: "technical financial infrastructure",
    facts: {
      atmosphere: [catalogFact("technical confidence with polished information density")],
      colors: [catalogFact("light foundations with precise violet, blue, and spectrum accents")],
      components: [catalogFact("pricing comparison"), catalogFact("developer proof blocks"), catalogFact("structured product cards")],
      imagery: [catalogFact("product diagrams and interface-led technical visuals")],
      layout: [catalogFact("structured grid composition with clear information architecture")],
      motion: [catalogFact("motion requires current live evidence", "unavailable")],
      responsive: [catalogFact("comparison grids stack without losing plan hierarchy", "inferred")],
      surfaces: [catalogFact("crisp layered panels with restrained depth")],
      typography: [catalogFact("clear technical hierarchy balancing display and dense supporting text")]
    },
    lastVerified: null,
    name: "Stripe",
    profileStatus: "partial",
    sourceUrl: "https://stripe.com/"
  }
];

const additionalNames = [
  ["Airbnb", "airbnb.com"],
  ["Linear", "linear.app"],
  ["Nike", "nike.com"],
  ["Notion", "notion.so"],
  ["Shopify", "shopify.com"],
  ["Spotify", "spotify.com"],
  ["Vercel", "vercel.com"]
] as const;

for (const [name, domain] of additionalNames) {
  entries.push({
    aliases: [name.toLowerCase()],
    canonicalDomain: domain,
    category: "recognized named visual reference",
    facts: {
      atmosphere: [catalogFact(`${name} is recognized, but its detailed visual profile needs live, screenshot, or DESIGN.md evidence`, "uncertain")],
      colors: [],
      components: [],
      imagery: [],
      layout: [],
      motion: [],
      responsive: [],
      surfaces: [],
      typography: []
    },
    lastVerified: null,
    name,
    profileStatus: "partial",
    sourceUrl: `https://${domain}/`
  });
}

export const designReferenceCatalog = Object.freeze(entries);

export function resolveCatalogReference(name: string): {
  entry: ReferenceCatalogEntry | null;
  status: ReferenceResolutionStatus;
} {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const matches = entries.filter((entry) =>
    entry.name.toLowerCase() === normalized || entry.aliases.some((alias) => alias === normalized)
  );
  if (matches.length === 1) return { entry: matches[0], status: matches[0].profileStatus };
  if (matches.length > 1) return { entry: null, status: "ambiguous" };
  return { entry: null, status: "not-found" };
}

export function catalogProfile(reference: DesignReference, entry: ReferenceCatalogEntry): ReferenceDesignProfile {
  const allFacts = Object.values(entry.facts).flat();
  return {
    accessibility: [catalogFact("Preserve semantic structure, keyboard access, contrast, and reduced motion even when the reference is imperfect")],
    atmosphere: entry.facts.atmosphere,
    colors: entry.facts.colors,
    components: entry.facts.components,
    confidence: entry.profileStatus === "resolved" ? 0.86 : 0.66,
    doRules: [catalogFact(`Preserve ${entry.name} as the named reference identity rather than replacing it with a generic theme`) ],
    dontRules: [catalogFact(`Do not copy ${entry.name} company content or claim proprietary source-code reuse`) ],
    evidenceStatus: allFacts.some((fact) => fact.status === "uncertain" || fact.status === "unavailable") ? "inferred" : "observed",
    id: `profile-${reference.id}`,
    imagery: entry.facts.imagery,
    layout: entry.facts.layout,
    limitations: [
      "Catalog evidence is a bounded independent visual analysis, not the reference brand's official design system.",
      "Current live behavior must be verified when the user asks for the current site."
    ],
    motion: entry.facts.motion,
    referenceId: reference.id,
    responsive: entry.facts.responsive,
    surfaces: entry.facts.surfaces,
    typography: entry.facts.typography
  };
}
