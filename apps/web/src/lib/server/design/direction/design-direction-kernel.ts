import { createHash } from "node:crypto";
import { analyzeWebsiteRequestObjective } from "@/lib/server/ai/website-request-objective";
import type { DesignDirectionRequest, ReferenceDesignProfile } from "@/lib/server/design/reference/design-reference-contract";
import type {
  DesignEvidenceValue,
  DesignValueOrigin,
  ProjectDesignConflict,
  ProjectDesignContract,
  SemanticColorRole
} from "./project-design-contract";

type WorkspaceDesignEvidence = {
  fileContents?: Record<string, string>;
  fileList?: string[];
};

export type BuildProjectDesignContractInput = {
  domain?: string | null;
  now?: () => Date;
  request: DesignDirectionRequest;
  workspace?: WorkspaceDesignEvidence;
};

type DirectionPreset = {
  archetype: string;
  atmosphere: string[];
  colors: Pick<Record<SemanticColorRole, string>, "accent" | "background" | "border" | "surface" | "textMuted" | "textPrimary" | "textSecondary">;
  components: Pick<ProjectDesignContract["components"], "buttons" | "cards" | "navigation">;
  geometry: ProjectDesignContract["geometry"];
  hero: string;
  imagery: string;
  rhythm: string[];
  typography: Pick<ProjectDesignContract["typography"], "body" | "display" | "labels">;
};

const presets: Record<string, DirectionPreset> = {
  apple: {
    archetype: "quiet product storytelling",
    atmosphere: ["quiet", "precise", "product-first", "spacious"],
    colors: { accent: "#0071e3", background: "#f5f5f7", border: "#d2d2d7", surface: "#ffffff", textMuted: "#6e6e73", textPrimary: "#1d1d1f", textSecondary: "#424245" },
    components: { buttons: "compact high-clarity actions with restrained rounding", cards: "large product story panels used selectively", navigation: "compact quiet navigation with focused utility" },
    geometry: { borders: "minimal hairline separators", buttonRadius: "999px", cardRadius: "18px", imageMask: "clean rectangular product stages", surfaceTreatment: "flat neutral surfaces with limited chrome" },
    hero: "single product idea with controlled negative space",
    imagery: "isolated product imagery with generous breathing room",
    rhythm: ["focused hero", "single-idea product chapters", "comparison", "clear action"],
    typography: { body: "system sans-serif", display: "system sans-serif with strong weight discipline", labels: "compact neutral UI labels" }
  },
  ferrari: {
    archetype: "cinematic luxury editorial",
    atmosphere: ["cinematic", "premium", "expressive", "image-led", "restrained utility"],
    colors: { accent: "#d71920", background: "#0b0b0c", border: "rgba(255,255,255,0.18)", surface: "#171719", textMuted: "#aaa8a4", textPrimary: "#f7f5f1", textSecondary: "#d8d4cf" },
    components: { buttons: "sharp editorial actions with concise labels", cards: "mostly unframed image stories; cards only for contained facts", navigation: "overlay navigation with compact utility labels" },
    geometry: { borders: "restrained separators", buttonRadius: "4px", cardRadius: "6px", imageMask: "full-bleed rectangular crops", surfaceTreatment: "flat image-led sections with dark overlays" },
    hero: "full-bleed cinematic hero with strong subject focus and restrained copy",
    imagery: "large cinematic photography with deliberate crops and visual weight",
    rhythm: ["full-bleed hero", "editorial story", "asymmetric media transition", "product proof", "restrained action"],
    typography: { body: "system grotesk sans-serif", display: "condensed editorial sans-serif", labels: "compact uppercase utility labels" }
  },
  snapchat: {
    archetype: "playful social product",
    atmosphere: ["playful", "immediate", "expressive", "youth-oriented", "mobile-first"],
    colors: { accent: "#fffc00", background: "#fffc00", border: "rgba(0,0,0,0.2)", surface: "#ffffff", textMuted: "#555555", textPrimary: "#000000", textSecondary: "#202020" },
    components: { buttons: "bold touch-first actions with friendly rounding", cards: "simple camera and story-led feature blocks", navigation: "simple high-contrast mobile-oriented navigation" },
    geometry: { borders: "high-contrast flat dividers", buttonRadius: "999px", cardRadius: "22px", imageMask: "rounded mobile frames", surfaceTreatment: "flat high-contrast identity fields" },
    hero: "large friendly statement paired with people-first mobile product imagery",
    imagery: "people-first mobile imagery and expressive graphic moments",
    rhythm: ["bold statement", "mobile product story", "people-led feature", "simple action"],
    typography: { body: "friendly system sans-serif", display: "bold friendly sans-serif", labels: "direct conversational labels" }
  },
  soundcloud: {
    archetype: "creator media platform",
    atmosphere: ["energetic", "creator-focused", "dense", "media-led"],
    colors: { accent: "#ff5500", background: "#f2f2f2", border: "#d8d8d8", surface: "#ffffff", textMuted: "#767676", textPrimary: "#222222", textSecondary: "#4d4d4d" },
    components: { buttons: "compact media actions", cards: "creator and track rows with artwork", navigation: "persistent playback-oriented hierarchy" },
    geometry: { borders: "compact feed separators", buttonRadius: "4px", cardRadius: "4px", imageMask: "square creator artwork", surfaceTreatment: "flat feed surfaces" },
    hero: "media-led creator entry with immediate playback hierarchy",
    imagery: "square creator artwork and dense media thumbnails",
    rhythm: ["creator hero", "track feed", "discovery rows", "creator action"],
    typography: { body: "compact system sans-serif", display: "strong track-title sans-serif", labels: "dense utility labels" }
  },
  stripe: {
    archetype: "technical commercial editorial",
    atmosphere: ["technical", "confident", "polished", "information-rich"],
    colors: { accent: "#635bff", background: "#f6f9fc", border: "#d9e2ec", surface: "#ffffff", textMuted: "#697386", textPrimary: "#0a2540", textSecondary: "#425466" },
    components: { buttons: "precise compact commercial actions", cards: "structured comparison panels with restrained depth", navigation: "clear technical navigation" },
    geometry: { borders: "crisp subtle dividers", buttonRadius: "8px", cardRadius: "12px", imageMask: "clean diagram and interface frames", surfaceTreatment: "layered light panels with restrained depth" },
    hero: "structured technical value proposition with clear information architecture",
    imagery: "product diagrams and interface-led technical visuals",
    rhythm: ["technical hero", "structured product grid", "developer proof", "comparison", "commercial action"],
    typography: { body: "clear system sans-serif", display: "technical display sans-serif", labels: "precise compact labels" }
  }
};

const originalPreset: DirectionPreset = {
  archetype: "original premium editorial",
  atmosphere: ["calm", "premium", "human", "editorial", "purposeful"],
  colors: { accent: "#8e3d48", background: "#f6f0e7", border: "rgba(49,34,30,0.16)", surface: "#fffaf3", textMuted: "#756964", textPrimary: "#241c19", textSecondary: "#554843" },
  components: { buttons: "clear editorial actions without excessive pills", cards: "selective content containment with quiet geometry", navigation: "calm compact navigation" },
  geometry: { borders: "quiet separators", buttonRadius: "6px", cardRadius: "10px", imageMask: "editorial rectangular crops", surfaceTreatment: "mostly flat sections with subtle elevation only where useful" },
  hero: "editorial hero led by the user brand and the primary offer",
  imagery: "purposeful editorial photography tied to the business",
  rhythm: ["editorial hero", "offer narrative", "visual proof", "process", "clear action"],
  typography: { body: "system humanist sans-serif", display: "editorial serif", labels: "quiet uppercase labels" }
};

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function presetFor(name: string | undefined) {
  const key = normalized(name ?? "");
  return presets[key] ?? originalPreset;
}

function evidenceValue(value: string, origin: DesignValueOrigin, evidenceIds: string[] = []): DesignEvidenceValue {
  return { evidenceIds, origin, status: origin === "reference-profile" ? "inferred" : "project-selected", value };
}

function explicitColor(prompt: string) {
  const hex = prompt.match(/#[0-9a-f]{3,8}\b/i)?.[0];
  if (hex) return hex;
  const colors: Record<string, string> = { blue: "#2563eb", cream: "#f6f0e7", green: "#16805d", orange: "#de7356", pink: "#e64f8d", purple: "#7c3aed", red: "#d71920", teal: "#0f8f8a", yellow: "#f4c430" };
  const match = Object.keys(colors).find((name) => new RegExp(`\\b${name}\\b`, "i").test(prompt));
  return match ? colors[match] : null;
}

function roleColor(text: string, role: "accent" | "background") {
  const colors: Record<string, string> = { blue: "#2563eb", cream: "#f6f0e7", green: "#16805d", orange: "#de7356", pink: "#e64f8d", purple: "#7c3aed", red: "#d71920", teal: "#0f8f8a", white: "#ffffff", yellow: "#f4c430" };
  const rolePattern = role === "background"
    ? /\b(?:backgrounds?|canvas|page|surface)\b/i
    : /\b(?:accents?|actions?|buttons?|brand|highlight)\b/i;
  for (const [name, value] of Object.entries(colors)) {
    for (const match of text.matchAll(new RegExp(`\\b${name}\\b`, "gi"))) {
      const context = text.slice(Math.max(0, match.index - 42), Math.min(text.length, match.index + name.length + 42));
      if (rolePattern.test(context)) return value;
    }
  }
  const hex = text.match(/#[0-9a-f]{3,8}\b/i)?.[0] ?? null;
  return hex && rolePattern.test(text) ? hex : null;
}

function typographyDirection(text: string) {
  if (/\bserif\s+(?:display|headings?|type|typography)|(?:display|headings?|type|typography)\s+(?:in\s+)?serif\b/i.test(text)) return "editorial serif";
  if (/\bsans(?:-serif)?\s+(?:display|headings?|type|typography)|(?:display|headings?|type|typography)\s+(?:in\s+)?sans(?:-serif)?\b/i.test(text)) return "system sans-serif";
  return null;
}

function existingDesign(workspace: WorkspaceDesignEvidence | undefined) {
  const files = workspace?.fileContents ?? {};
  const css = Object.entries(files).filter(([path]) => /\.css$/i.test(path)).map(([, content]) => content).join("\n").slice(0, 50_000);
  const designMd = Object.entries(files).find(([path]) => /(?:^|\/)DESIGN\.md$/i.test(path))?.[1] ?? "";
  const variables = [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]{1,80})/gi)].slice(0, 30).map((match) => `${match[1]}=${match[2].trim()}`);
  const variableEntries = [...css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]{1,80})/gi)].slice(0, 30).map((match) => ({ name: match[1].toLowerCase(), value: match[2].trim() }));
  const semanticColors = {
    accent: variableEntries.find((entry) => /(?:accent|brand|primary|action)/.test(entry.name) && /^(?:#|rgb|hsl)/i.test(entry.value))?.value ?? null,
    background: variableEntries.find((entry) => /(?:background|canvas|page)/.test(entry.name) && /^(?:#|rgb|hsl)/i.test(entry.value))?.value ?? null,
    surface: variableEntries.find((entry) => /(?:surface|panel|card)/.test(entry.name) && /^(?:#|rgb|hsl)/i.test(entry.value))?.value ?? null,
    text: variableEntries.find((entry) => /(?:text|ink|foreground)/.test(entry.name) && /^(?:#|rgb|hsl)/i.test(entry.value))?.value ?? null
  };
  const colors = [...css.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0]).slice(0, 8);
  const radii = [...css.matchAll(/border-radius\s*:\s*([^;]{1,40})/gi)].map((match) => match[1].trim()).slice(0, 5);
  const fingerprint = designMd.match(/^fingerprint:\s*(\S+)/mi)?.[1] ?? null;
  const userBrand = designMd.match(/^userBrand:\s*(.+)$/mi)?.[1]?.trim() ?? null;
  const version = Number(designMd.match(/^version:\s*(\d+)/mi)?.[1] ?? 0);
  const preservedRules = designMd.split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 8 && /\b(?:avoid|do not|don't|keep|must|prefer|use)\b/i.test(line))
    .slice(0, 8);
  return { colors, designMd, fingerprint, preservedRules, radii, semanticColors, userBrand, variables, version };
}

function facts(profile: ReferenceDesignProfile | undefined, dimension: keyof ReferenceDesignProfile) {
  const value = profile?.[dimension];
  return Array.isArray(value) ? value.map((item) => typeof item === "object" && item && "value" in item ? String(item.value) : "").filter(Boolean) : [];
}

function tokenValue(profile: ReferenceDesignProfile | undefined, names: string[]) {
  const colors = profile?.knowledge?.colors ?? {};
  for (const name of names) {
    const exact = Object.entries(colors).find(([key]) => normalized(key) === normalized(name));
    if (exact?.[1]) return exact[1];
  }
  return null;
}

function typographyToken(profile: ReferenceDesignProfile | undefined, pattern: RegExp) {
  const entries = Object.values(profile?.knowledge?.typography ?? {});
  return entries.find((entry) => pattern.test(entry.name)) ?? entries[0] ?? null;
}

function typographyDescription(token: ReturnType<typeof typographyToken>, fallback: string) {
  if (!token) return fallback;
  return [token.family, token.weight ? `weight ${token.weight}` : "", token.lineHeight ? `line-height ${token.lineHeight}` : "", token.letterSpacing ? `tracking ${token.letterSpacing}` : ""].filter(Boolean).join("; ");
}

function firstTokenValue(values: Record<string, string> | undefined, names: string[]) {
  if (!values) return null;
  for (const name of names) {
    const exact = Object.entries(values).find(([key]) => normalized(key) === normalized(name));
    if (exact?.[1]) return exact[1];
  }
  return Object.values(values)[0] ?? null;
}

function provisionalProjectName(request: DesignDirectionRequest, domain: string | null | undefined) {
  if (request.userBrand?.trim()) return request.userBrand.trim();
  const objective = analyzeWebsiteRequestObjective(request.currentRequest);
  const phrase = objective.explicitBrandName ?? objective.subject ?? domain;
  const cleaned = phrase?.replace(/\b(?:beautiful|premium|responsive|modern|website|site)\b/gi, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Project Website";
  return cleaned.split(/\s+/).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ");
}

function fidelity(mode: DesignDirectionRequest["fidelity"]): ProjectDesignContract["fidelity"] {
  const strength = { inspired: 0.45, "style-match": 0.68, "close-replica": 0.84, "reference-clone": 0.94 }[mode];
  const summary = mode === "inspired"
    ? "Use broad principles while preserving substantial Hassali originality."
    : mode === "style-match"
      ? "Preserve recognizable visual language without copying reference content or identity."
      : mode === "close-replica"
        ? "Preserve strong structure, proportions, and visual character within safe reconstruction boundaries."
        : "Treat supplied evidence as a high-fidelity visual target without copying protected identity, claims, or code.";
  return { mode, strength, summary };
}

function createFingerprint(contract: Omit<ProjectDesignContract, "fingerprint">) {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex").slice(0, 20);
}

export function buildProjectDesignContract(input: BuildProjectDesignContractInput): ProjectDesignContract {
  const request = input.request;
  const globalReference = request.references.find((reference) => reference.role === "global");
  const externalGlobalReference = globalReference && !["existing-project", "existing-project-page", "user-description"].includes(globalReference.sourceType)
    ? globalReference
    : null;
  const profile = request.profiles.find((candidate) => candidate.referenceId === globalReference?.id);
  const profileKnowledge = profile?.knowledge;
  const tokenKnowledge = globalReference && ["uploaded-design-md", "internal-design-knowledge"].includes(globalReference.sourceType)
    ? profileKnowledge
    : undefined;
  const tokenProfile = tokenKnowledge ? profile : undefined;
  const base = profileKnowledge?.archetypes.includes("cinematic")
    ? presets.ferrari
    : presetFor(profileKnowledge?.name.replace(/-design-analysis$/i, "") ?? globalReference?.name);
  const existing = existingDesign(input.workspace);
  const original = !request.references.some((reference) => reference.sourceType === "named-brand" || reference.sourceType === "public-url");
  const projectName = request.userBrand ?? existing.userBrand ?? provisionalProjectName(request, input.domain);
  const current = [request.currentRequest, ...request.constraints.currentRequest].join(" ");
  const noteText = request.constraints.projectNotes.join(" ");
  const memoryText = request.constraints.memory.join(" ");
  const hasRoundedOverride = /rounded/i.test(current);
  const hasSquareOverride = /square|sharp/i.test(current);
  const hasSavedSquarePreference = /square|sharp/i.test(noteText) || /square|sharp/i.test(memoryText);
  const currentAccent = roleColor(current, "accent") ?? (roleColor(current, "background") ? null : explicitColor(current));
  const noteAccent = roleColor(noteText, "accent");
  const memoryAccent = roleColor(memoryText, "accent");
  const currentBackground = roleColor(current, "background");
  const noteBackground = roleColor(noteText, "background");
  const memoryBackground = roleColor(memoryText, "background");
  const referenceBackground = tokenValue(tokenProfile, ["canvas-night", "canvas", "background", "canvas-dark", "primary"]);
  const referenceSurface = tokenValue(tokenProfile, ["canvas-parchment", "surface-pearl", "canvas-night-elevated", "canvas-elevated", "surface-card", "surface-elevated-dark", "surface"]);
  const referenceText = tokenValue(tokenProfile, ["ink", "body-strong", "text-primary", "on-dark", "on-primary"]);
  const referenceMuted = tokenValue(tokenProfile, ["ink-muted-48", "body-muted", "shade-40", "muted", "text-muted", "body"]);
  const referenceBorder = tokenValue(tokenProfile, ["hairline-dark", "hairline", "border", "hairline-light"]);
  const referenceAccent = tokenValue(tokenProfile, ["primary", "primary-focus", "primary-on-dark", "link-cool-1", "link-cool-2", "link-mint", "accent", "on-dark"]);
  const referencePrimaryAction = tokenKnowledge?.components["button-primary-pill"]?.resolvedProperties.backgroundColor
    ?? Object.entries(tokenKnowledge?.components ?? {}).find(([name]) => /button-primary/i.test(name))?.[1]?.resolvedProperties.backgroundColor
    ?? tokenValue(tokenProfile, ["primary", "accent"]);
  const background = currentBackground
    ?? (/\blight\b/i.test(current) ? originalPreset.colors.background : /\bdark\b/i.test(current) ? presets.ferrari.colors.background : null)
    ?? noteBackground
    ?? memoryBackground
    ?? (externalGlobalReference ? referenceBackground ?? base.colors.background : existing.semanticColors.background)
    ?? base.colors.background;
  const accent = currentAccent ?? noteAccent ?? memoryAccent ?? (externalGlobalReference ? referenceAccent ?? base.colors.accent : existing.semanticColors.accent) ?? base.colors.accent;
  const accentOrigin: DesignValueOrigin = currentAccent ? "current-request" : noteAccent ? "project-note" : memoryAccent ? "project-memory" : externalGlobalReference ? "reference-profile" : existing.semanticColors.accent ? "existing-project" : "professional-default";
  const backgroundOrigin: DesignValueOrigin = currentBackground || /\b(?:light|dark)\b/i.test(current) ? "current-request" : noteBackground ? "project-note" : memoryBackground ? "project-memory" : externalGlobalReference ? "reference-profile" : existing.semanticColors.background ? "existing-project" : "professional-default";
  const displayToken = typographyToken(tokenProfile, /display|hero|heading/i);
  const bodyToken = typographyToken(tokenProfile, /body|paragraph|ui/i);
  const labelToken = typographyToken(tokenProfile, /label|caption|eyebrow|nav/i);
  const displayTypography = typographyDirection(current) ?? typographyDirection(noteText) ?? typographyDirection(memoryText) ?? typographyDescription(displayToken, base.typography.display);
  const sectionSpecific: Record<string, string> = {};
  for (const reference of request.references.filter((candidate) => candidate.role !== "global")) {
    const rolePreset = presetFor(reference.name);
    sectionSpecific[reference.pageTarget ?? reference.role] = `${reference.name} influences only ${reference.role}: ${rolePreset.components.cards}; ${rolePreset.rhythm.join(" -> ")}.`;
  }
  const conflicts: ProjectDesignConflict[] = request.conflicts.map((conflict) => ({
    dimension: conflict.dimension,
    resolution: "Current explicit instruction, Project Notes, current memory, scoped reference roles, global references, existing-project evidence, then professional defaults; unresolved equal-authority global conflicts block generation.",
    severity: request.references.filter((reference) => reference.role === "global").length > 1 ? "blocking" : "warning",
    sources: conflict.referenceIds
  }));
  if (request.constraints.overriddenMemory.length) {
    conflicts.push({ dimension: "saved-preference", resolution: "Current request wins for the requested target; saved preference remains historical.", severity: "resolved", sources: request.constraints.overriddenMemory });
  }
  const priorVersion = existing.version || 0;
  const provenance: ProjectDesignContract["provenance"] = [
    ...request.references.map((reference) => ({ label: reference.provenance.sourceLabel, private: reference.provenance.private, referenceId: reference.id, role: reference.role, status: reference.resolutionStatus })),
    ...request.constraints.projectNotes.map((label) => ({ label, private: true, referenceId: null, role: "constraint" as const, status: "current" })),
    ...request.constraints.memory.map((label) => ({ label, private: true, referenceId: null, role: "constraint" as const, status: "current" })),
    ...request.constraints.overriddenMemory.map((label) => ({ label, private: true, referenceId: null, role: "constraint" as const, status: "historical-overridden" }))
  ].slice(0, 18);
  if (existing.variables.length || existing.designMd) provenance.push({ label: "Current project visual system", private: true, referenceId: null, role: "existing-project", status: "observed" });
  const partial: Omit<ProjectDesignContract, "fingerprint"> = {
    accessibility: {
      contrast: "Meet WCAG-readable contrast; visual fidelity never preserves inaccessible contrast.",
      focus: "Every interactive control has a visible keyboard focus treatment.",
      reducedMotion: "Respect prefers-reduced-motion and preserve content without animation.",
      semantics: "Use semantic landmarks, headings, labels, and meaningful alternative text.",
      touchTargets: "Keep primary touch targets at least 44px where practical."
    },
    colors: {
      accent: evidenceValue(accent, accentOrigin, externalGlobalReference && accentOrigin === "reference-profile" ? [externalGlobalReference.id] : []),
      background: evidenceValue(background, backgroundOrigin, externalGlobalReference && backgroundOrigin === "reference-profile" ? [externalGlobalReference.id] : []),
      border: evidenceValue(referenceBorder ?? base.colors.border, globalReference ? "reference-profile" : "professional-default", globalReference ? [globalReference.id] : []),
      destructive: evidenceValue("#b42318", "professional-default"),
      elevatedSurface: evidenceValue(!externalGlobalReference && existing.semanticColors.surface ? existing.semanticColors.surface : referenceSurface ?? base.colors.surface, !externalGlobalReference && existing.semanticColors.surface ? "existing-project" : externalGlobalReference ? "reference-profile" : "professional-default"),
      positive: evidenceValue("#16805d", "professional-default"),
      primaryAction: evidenceValue(externalGlobalReference ? referencePrimaryAction ?? accent : accent, externalGlobalReference ? "reference-profile" : accentOrigin, externalGlobalReference ? [externalGlobalReference.id] : []),
      secondaryAction: evidenceValue("transparent with text-primary border", "professional-default"),
      surface: evidenceValue(!externalGlobalReference && existing.semanticColors.surface ? existing.semanticColors.surface : referenceSurface ?? base.colors.surface, !externalGlobalReference && existing.semanticColors.surface ? "existing-project" : externalGlobalReference ? "reference-profile" : "professional-default"),
      textMuted: evidenceValue(referenceMuted ?? base.colors.textMuted, globalReference ? "reference-profile" : "professional-default"),
      textPrimary: evidenceValue(!externalGlobalReference && existing.semanticColors.text ? existing.semanticColors.text : referenceText ?? base.colors.textPrimary, !externalGlobalReference && existing.semanticColors.text ? "existing-project" : externalGlobalReference ? "reference-profile" : "professional-default"),
      textSecondary: evidenceValue(referenceMuted ?? base.colors.textSecondary, globalReference ? "reference-profile" : "professional-default"),
      warning: evidenceValue("#b54708", "professional-default")
    },
    components: {
      buttons: tokenKnowledge && Object.keys(tokenKnowledge.components).some((name) => /button/i.test(name)) ? `Use supplied button tokens: ${Object.keys(tokenKnowledge.components).filter((name) => /button/i.test(name)).slice(0, 4).join(", ")}.` : base.components.buttons,
      cards: tokenKnowledge && Object.keys(tokenKnowledge.components).some((name) => /card/i.test(name)) ? `Use supplied card tokens: ${Object.keys(tokenKnowledge.components).filter((name) => /card/i.test(name)).slice(0, 4).join(", ")}.` : base.components.cards,
      footer: "A quiet full-width close with real routes and no fabricated trust claims.",
      forms: "Clear labels, visible focus, restrained fields, and honest submit behavior.",
      navigation: tokenKnowledge && Object.keys(tokenKnowledge.components).some((name) => /nav/i.test(name)) ? `Use supplied navigation tokens: ${Object.keys(tokenKnowledge.components).filter((name) => /nav/i.test(name)).slice(0, 4).join(", ")}.` : base.components.navigation,
      sectionSpecific
    },
    conflicts,
    contentHierarchy: {
      bodyWidth: "60-72ch for long reading copy",
      primaryMessage: `Lead with ${projectName}'s actual offer, not the reference brand.`,
      readingOrder: "One dominant message per section with a clear action hierarchy.",
      supportingMessage: "Use evidence-backed benefits and process details; avoid invented proof."
    },
    createdAt: (input.now ?? (() => new Date()))().toISOString(),
    doRules: [
      `Keep ${projectName} as the visible brand identity.`,
      `Use ${base.archetype} as one coherent system.`,
      `Use section containment only when the content needs it.`,
      ...(tokenKnowledge?.doRules ?? []),
      ...facts(profile, "doRules"),
      ...existing.preservedRules,
      ...request.constraints.projectNotes,
      ...request.constraints.currentRequest
    ].filter(Boolean).slice(0, 16),
    dontRules: [
      "Do not copy reference trademarks, company copy, product names, or unsupported claims.",
      "Do not add random purple gradients, neon glow, floating blobs, or glassmorphism without evidence.",
      "Do not put every section inside a rounded card or repeat generic three-column feature grids.",
      "Do not invent testimonials, customer logos, awards, partnerships, metrics, or revenue.",
      "Do not mix unrelated type, icon, radius, or shadow systems.",
      ...(tokenKnowledge?.dontRules ?? []),
      ...facts(profile, "dontRules")
    ].slice(0, 16),
    fidelity: fidelity(request.fidelity),
      geometry: {
        ...base.geometry,
        buttonRadius: firstTokenValue(tokenKnowledge?.geometry, ["pill", "full", "button"]) ?? base.geometry.buttonRadius,
        cardRadius: hasRoundedOverride
          ? "18px for the explicitly rounded target only"
          : hasSquareOverride || hasSavedSquarePreference
            ? "2px"
            : existing.radii[0] ?? firstTokenValue(tokenKnowledge?.geometry, ["md", "lg", "card"]) ?? base.geometry.cardRadius
      },
    identity: {
      archetype: base.archetype,
      original,
      projectName,
      referenceBrands: request.references.filter((reference) => reference.sourceType === "named-brand").map((reference) => reference.name),
      userBrand: projectName
    },
    imagery: {
      aspectRatios: ["16:9 or 3:2 for narrative media", "1:1 only for true catalog/creator items"],
      crop: globalReference ? base.imagery : "subject-aware editorial crops",
      density: /dense|media/i.test(base.atmosphere.join(" ")) ? "dense where content requires scanning" : "one strong visual idea per section",
      direction: [...facts(profile, "imagery"), base.imagery].filter(Boolean).join("; "),
      provenancePolicy: "Use supplied or licensed assets with provenance; generated placeholders must never imply factual proof."
    },
    intent: {
      audience: input.domain ? `${input.domain} customers and decision makers` : "the project's intended visitors",
      personality: [...base.atmosphere, ...facts(profile, "atmosphere")].slice(0, 8),
      purpose: `Express ${projectName}'s offer through a coherent ${base.archetype} experience.`
    },
    layout: {
      alignment: /asymmetric/i.test(base.rhythm.join(" ")) ? "controlled asymmetry with anchored text" : "clear editorial alignment",
      container: "Full-bleed narrative bands with a bounded readable inner container.",
      grid: globalReference?.name.toLowerCase() === "stripe" ? "structured 12-column commercial grid" : "responsive editorial grid with purposeful variation",
      hero: base.hero,
      sectionRhythm: tokenKnowledge?.canvasStrategy.length ? [...tokenKnowledge.canvasStrategy.slice(0, 4), ...base.rhythm].slice(0, 7) : base.rhythm
    },
    motion: {
      evidence: facts(profile, "motion").some((value) => /unavailable|requires/i.test(value)) ? "unavailable" : "project-designed",
      hover: "Short transform/color feedback without layout shift.",
      personality: /playful/i.test(base.atmosphere.join(" ")) ? "playful but controlled" : /cinematic/i.test(base.atmosphere.join(" ")) ? "smooth cinematic restraint" : "immediate and restrained",
      reveal: "Optional bounded reveal only where it supports reading order.",
      timing: "140-320ms for controls; longer narrative motion only with explicit evidence."
    },
    previousFingerprint: existing.fingerprint,
    provenance,
    references: request.references.map((reference) => ({ fidelity: reference.fidelity, name: reference.name, referenceId: reference.id, role: reference.role, scope: reference.role === "global" ? "global" : "section", sourceAttachmentId: reference.sourceAttachmentId ?? null, sourceFingerprint: reference.provenance.fingerprint, sourceType: reference.sourceType, target: reference.pageTarget })),
    responsive: {
      desktop: ["Preserve the intended visual hierarchy and full-bleed moments.", "Use stable max-widths for readable copy."],
      evidence: facts(profile, "responsive").some((value) => /observed/i.test(value)) ? "observed" : "project-designed",
      mobile: ["Collapse navigation into one accessible control.", "Recompose grids around content priority rather than blindly stacking.", "Keep key imagery and actions visible without overflow."],
      tablet: ["Reduce gutters and columns while retaining section identity.", "Avoid compressed desktop composition."]
    },
    spacing: {
      componentGap: "clamp(1rem, 2vw, 1.5rem)",
      controlGap: "0.5rem",
      pageGutter: "clamp(1rem, 4vw, 4rem)",
      scale: Object.values(tokenKnowledge?.spacing ?? {}).length ? Object.values(tokenKnowledge?.spacing ?? {}).slice(0, 12) : ["0.25rem", "0.5rem", "0.75rem", "1rem", "1.5rem", "2rem", "3rem", "4rem", "6rem"],
      sectionGap: /dense/i.test(base.atmosphere.join(" ")) ? "clamp(2.5rem, 6vw, 5rem)" : "clamp(4rem, 9vw, 8rem)"
    },
    status: conflicts.some((conflict) => conflict.severity === "blocking") ? "draft" : "current",
    typography: {
      body: typographyDescription(bodyToken, base.typography.body),
      display: displayTypography,
      fallbackPolicy: "Use legal local/system alternatives matching the visual character; never assert an unavailable proprietary font.",
      labels: typographyDescription(labelToken, base.typography.labels),
      lineHeight: bodyToken?.lineHeight || displayToken?.lineHeight ? `body ${bodyToken?.lineHeight ?? "1.5"} / display ${displayToken?.lineHeight ?? "1.1"}` : "1.5 body / 1.05-1.2 display",
      scale: { body: "clamp(1rem, 0.96rem + 0.18vw, 1.125rem)", display: "clamp(3rem, 8vw, 7.5rem)", h1: "clamp(2.5rem, 6vw, 6rem)", h2: "clamp(1.8rem, 4vw, 3.5rem)", h3: "clamp(1.2rem, 2vw, 1.6rem)", small: "0.875rem" }
    },
    unresolved: request.unknowns.slice(0, 12),
    version: Math.max(1, priorVersion + 1)
  };
  return { ...partial, fingerprint: createFingerprint(partial) };
}

export function projectDesignVisibleSummary(contract: ProjectDesignContract) {
  const roles = contract.references.map((reference) => `${reference.name}:${reference.role}`).join(", ") || "original direction";
  return [
    `Design contract: ${contract.identity.archetype}`,
    `Brand: ${contract.identity.userBrand}`,
    `Reference composition: ${roles}`,
    `Design version: ${contract.version} (${contract.status})`,
    `Design fingerprint: ${contract.fingerprint}`
  ].join("\n");
}
