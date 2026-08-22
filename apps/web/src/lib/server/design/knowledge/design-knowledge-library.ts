import compiled from "./compiled-design-knowledge.json";
import type {
  DesignKnowledgeIndex,
  DesignKnowledgeProfile,
  RetrievedDesignKnowledge
} from "./design-knowledge-profile";

export const designKnowledgeLimits = Object.freeze({
  maxContextCharacters: 12_000,
  maxProfiles: 3
});

const index = compiled as unknown as DesignKnowledgeIndex;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function terms(value: string) {
  return new Set(normalize(value).split(" ").filter((term) => term.length >= 4));
}

function exactMatch(profile: DesignKnowledgeProfile, query: string) {
  const normalized = normalize(query);
  return profile.aliases.some((alias) => normalized.includes(normalize(alias)));
}

function scoreProfile(profile: DesignKnowledgeProfile, input: { businessDomain?: string | null; prompt: string }) {
  const queryTerms = terms(`${input.prompt} ${input.businessDomain ?? ""}`);
  const styleText = normalize([
    profile.description,
    ...profile.archetypes,
    ...profile.atmosphere,
    ...profile.canvasStrategy,
    ...profile.layout,
    ...profile.imagery
  ].join(" "));
  const matchedBy: RetrievedDesignKnowledge["matchedBy"] = [];
  let score = 0;
  if (exactMatch(profile, input.prompt)) {
    score += 100;
    matchedBy.push("name", "alias");
  }
  const archetypeMatches = profile.archetypes.filter((value) => queryTerms.has(normalize(value)));
  if (archetypeMatches.length) {
    score += archetypeMatches.length * 8;
    matchedBy.push("archetype");
  }
  const styleMatches = [...queryTerms].filter((term) => styleText.includes(term));
  if (styleMatches.length) {
    score += Math.min(18, styleMatches.length * 2);
    matchedBy.push("style");
  }
  if (input.businessDomain && styleText.includes(normalize(input.businessDomain))) {
    score += 3;
    matchedBy.push("domain");
  }
  return { matchedBy: [...new Set(matchedBy)], profile, score };
}

export function designKnowledgeIndex() {
  return index;
}

export function resolveDesignKnowledgeReference(name: string) {
  const normalized = normalize(name);
  const matches = index.profiles.filter((profile) =>
    normalize(profile.name) === normalized || profile.aliases.some((alias) => normalize(alias) === normalized)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function retrieveDesignKnowledge(input: {
  businessDomain?: string | null;
  maximum?: number;
  prompt: string;
}) {
  const maximum = Math.min(designKnowledgeLimits.maxProfiles, Math.max(1, input.maximum ?? 1));
  const ranked = index.profiles
    .map((profile) => scoreProfile(profile, input))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id));
  const strongNamed = ranked.filter((result) => result.score >= 100);
  return (strongNamed.length ? strongNamed : ranked.filter((result) => result.score >= 8)).slice(0, maximum);
}

export function compactDesignKnowledgeProfile(profile: DesignKnowledgeProfile) {
  const compact = {
    archetypes: profile.archetypes.slice(0, 5),
    atmosphere: profile.atmosphere.slice(0, 4),
    canvasStrategy: profile.canvasStrategy.slice(0, 4),
    colors: Object.fromEntries(Object.entries(profile.colors).slice(0, 18)),
    components: Object.fromEntries(Object.entries(profile.components).slice(0, 10)),
    doRules: profile.doRules.slice(0, 6),
    dontRules: profile.dontRules.slice(0, 6),
    fingerprint: profile.fingerprint,
    geometry: profile.geometry,
    id: profile.id,
    imagery: profile.imagery.slice(0, 5),
    layout: profile.layout.slice(0, 5),
    motion: profile.motion.slice(0, 4),
    name: profile.name,
    responsive: profile.responsive.slice(0, 5),
    sourceFormat: profile.sourceFormat,
    spacing: profile.spacing,
    typography: Object.fromEntries(Object.entries(profile.typography).slice(0, 14))
  };
  const serialized = JSON.stringify(compact);
  return serialized.length <= designKnowledgeLimits.maxContextCharacters
    ? compact
    : { ...compact, components: {}, doRules: [], dontRules: [], imagery: [], layout: [], motion: [], responsive: [] };
}
