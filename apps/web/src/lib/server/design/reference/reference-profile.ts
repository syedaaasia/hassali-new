import { createHash } from "node:crypto";
import { extractResearchPageText, retrievePublicResearchPage } from "@/lib/server/ai/ask-research-engine";
import { catalogProfile, resolveCatalogReference } from "./design-reference-catalog";
import {
  designReferenceLimits,
  type DesignReference,
  type DesignReferenceProvider,
  type DesignReferenceProviderInput,
  type ReferenceDesignProfile,
  type ReferenceEvidenceStatus,
  type ReferenceFact
} from "./design-reference-contract";
import { parseDesignMd } from "./design-md-parser";
import { resolveDesignKnowledgeReference } from "@/lib/server/design/knowledge/design-knowledge-library";
import type { DesignKnowledgeProfile } from "@/lib/server/design/knowledge/design-knowledge-profile";

function fact(value: string, evidenceId: string, status: ReferenceEvidenceStatus): ReferenceFact {
  return { evidenceIds: [evidenceId], status, value };
}

function uniqueFacts(facts: ReferenceFact[]) {
  return facts.filter((candidate, index, all) =>
    all.findIndex((other) => other.value.toLowerCase() === candidate.value.toLowerCase()) === index
  );
}

function profile(input: {
  facts?: Partial<Record<keyof Pick<ReferenceDesignProfile, "accessibility" | "atmosphere" | "colors" | "components" | "doRules" | "dontRules" | "imagery" | "layout" | "motion" | "responsive" | "surfaces" | "typography">, ReferenceFact[]>>;
  confidence: number;
  evidenceStatus: ReferenceEvidenceStatus;
  limitations?: string[];
  knowledge?: DesignKnowledgeProfile;
  reference: DesignReference;
}): ReferenceDesignProfile {
  const get = (key: keyof NonNullable<typeof input.facts>) => uniqueFacts(input.facts?.[key] ?? []);
  return {
    accessibility: get("accessibility"),
    atmosphere: get("atmosphere"),
    colors: get("colors"),
    components: get("components"),
    confidence: input.confidence,
    doRules: get("doRules"),
    dontRules: get("dontRules"),
    evidenceStatus: input.evidenceStatus,
    id: `profile-${input.reference.id}`,
    imagery: get("imagery"),
    knowledge: input.knowledge,
    layout: get("layout"),
    limitations: input.limitations ?? [],
    motion: get("motion"),
    referenceId: input.reference.id,
    responsive: get("responsive"),
    surfaces: get("surfaces"),
    typography: get("typography")
  };
}

function factsFromText(text: string, evidenceId: string, status: ReferenceEvidenceStatus) {
  const compact = text.toLowerCase();
  const includes = (pattern: RegExp) => pattern.test(compact);
  const colors = [...text.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => fact(`Observed color ${match[0].toUpperCase()}`, evidenceId, status));
  return {
    atmosphere: [
      includes(/\b(?:luxury|premium|editorial|cinematic)\b/) ? fact("luxury editorial or cinematic character", evidenceId, status) : null,
      includes(/\b(?:playful|bright|friendly|youthful)\b/) ? fact("playful and friendly character", evidenceId, status) : null,
      includes(/\b(?:minimal|clean|quiet|restrained)\b/) ? fact("minimal and restrained character", evidenceId, status) : null,
      includes(/\b(?:dense|compact|data-rich)\b/) ? fact("dense or compact information character", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    colors: [
      ...colors,
      includes(/\bdark (?:background|surface|theme)\b|\bblack background\b/) ? fact("dark background behavior", evidenceId, status) : null,
      includes(/\blight (?:background|surface|theme)\b|\bwhite background\b/) ? fact("light background behavior", evidenceId, status) : null,
      includes(/\b(?:orange|red|yellow|blue|green|purple|violet) accent\b/) ? fact("a named accent color is present in the evidence", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    components: [
      includes(/\bnav(?:bar|igation)?\b/) ? fact("navigation treatment", evidenceId, status) : null,
      includes(/\bcard(?:s)?\b/) ? fact("card treatment", evidenceId, status) : null,
      includes(/\bbutton(?:s)?\b|\bcta\b/) ? fact("button and call-to-action treatment", evidenceId, status) : null,
      includes(/\bpricing\b/) ? fact("pricing structure", evidenceId, status) : null,
      includes(/\b(?:gallery|carousel|slider)\b/) ? fact("gallery or media-rail treatment", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    imagery: [
      includes(/\b(?:full[- ]bleed|large|oversized) (?:image|photo|photography|visual)\b/) ? fact("large image-dominant treatment", evidenceId, status) : null,
      includes(/\b(?:illustration|iconography|icons?)\b/) ? fact("illustration or icon treatment is visible", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    layout: [
      includes(/\bfull[- ]bleed\b/) ? fact("full-bleed layout", evidenceId, status) : null,
      includes(/\b(?:two|2)[- ]column|\bsplit layout\b/) ? fact("split or two-column composition", evidenceId, status) : null,
      includes(/\bcentered\b/) ? fact("centered alignment", evidenceId, status) : null,
      includes(/\bleft[- ]aligned\b/) ? fact("left-aligned composition", evidenceId, status) : null,
      includes(/\b(?:large|generous) (?:space|spacing|whitespace)\b/) ? fact("generous spacing", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    surfaces: [
      includes(/\brounded\b|\bradius\b/) ? fact("rounded surface treatment", evidenceId, status) : null,
      includes(/\bsharp corners?\b|\bsquare corners?\b/) ? fact("sharp surface treatment", evidenceId, status) : null,
      includes(/\bshadow\b|\belevation\b/) ? fact("depth or elevation treatment", evidenceId, status) : null,
      includes(/\bborder(?:s|ed)?\b|\bseparator\b/) ? fact("border or separator treatment", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[],
    typography: [
      includes(/\b(?:large|oversized) (?:headline|heading|type|typography)\b/) ? fact("large display hierarchy", evidenceId, status) : null,
      includes(/\b(?:bold|heavy) (?:headline|heading|type|typography)\b/) ? fact("bold heading weight", evidenceId, status) : null,
      includes(/\b(?:compact|small) (?:label|utility text)\b/) ? fact("compact utility text", evidenceId, status) : null
    ].filter(Boolean) as ReferenceFact[]
  };
}

export function createCatalogReferenceProvider(): DesignReferenceProvider {
  return {
    id: "hassali-reference-catalog",
    sourceTypes: ["hassali-reference-catalog", "named-brand"],
    async resolve(input) {
      const resolution = resolveCatalogReference(input.reference.name);
      const internal = resolveDesignKnowledgeReference(input.reference.name);
      if (internal && resolution.entry) {
        const catalog = catalogProfile(input.reference, resolution.entry);
        return {
          profile: {
            ...catalog,
            confidence: Math.max(catalog.confidence, internal.confidence),
            knowledge: internal,
            limitations: [...catalog.limitations, "The internal profile is visual-reference-only and is not official brand guidance."]
          },
          reference: {
            ...input.reference,
            canonicalUrl: resolution.entry.sourceUrl,
            provenance: {
              ...input.reference.provenance,
              capturedAt: resolution.entry.lastVerified,
              fingerprint: internal.fingerprint,
              license: "MIT",
              sourceUrl: resolution.entry.sourceUrl
            },
            resolutionStatus: resolution.entry.profileStatus
          }
        };
      }
      if (internal) {
        const parsed = parseDesignMd({
          content: [internal.description, ...internal.atmosphere, ...internal.layout, ...internal.imagery].join("\n\n"),
          sourceId: input.reference.id
        });
        return {
          profile: profile({
            confidence: internal.confidence,
            evidenceStatus: "inferred",
            facts: parsed,
            knowledge: internal,
            limitations: ["The internal profile is visual-reference-only and is not official brand guidance."],
            reference: input.reference
          }),
          reference: {
            ...input.reference,
            provenance: {
              ...input.reference.provenance,
              capturedAt: input.now().toISOString(),
              fingerprint: internal.fingerprint,
              license: "MIT"
            },
            resolutionStatus: "resolved"
          }
        };
      }
      if (!resolution.entry) {
        return {
          profile: null,
          reference: {
            ...input.reference,
            limitations: [...input.reference.limitations, "The named reference is unresolved. Supply a public URL, screenshot, or DESIGN.md."],
            resolutionStatus: resolution.status
          }
        };
      }
      return {
        profile: catalogProfile(input.reference, resolution.entry),
        reference: {
          ...input.reference,
          canonicalUrl: resolution.entry.sourceUrl,
          provenance: {
            ...input.reference.provenance,
            capturedAt: resolution.entry.lastVerified,
            sourceUrl: resolution.entry.sourceUrl
          },
          resolutionStatus: resolution.entry.profileStatus
        }
      };
    }
  };
}

export function createDesignMdReferenceProvider(contentByReferenceId: Map<string, string>): DesignReferenceProvider {
  return {
    id: "design-md-reference",
    sourceTypes: ["external-design-reference", "uploaded-design-md"],
    async resolve(input) {
      const content = contentByReferenceId.get(input.reference.id);
      if (!content) return { profile: null, reference: { ...input.reference, resolutionStatus: "partial" } };
      const parsed = parseDesignMd({ content, sourceId: input.reference.id });
      return {
        profile: profile({
          confidence: 0.92,
          evidenceStatus: "directly-specified",
          facts: parsed,
          knowledge: parsed.knowledge,
          limitations: parsed.warnings,
          reference: input.reference
        }),
        reference: {
          ...input.reference,
          name: parsed.knowledge.name || input.reference.name,
          provenance: {
            ...input.reference.provenance,
            capturedAt: input.now().toISOString(),
            fingerprint: parsed.fingerprint,
            sourceLabel: `Current-turn uploaded design document: ${input.reference.name}`
          },
          resolutionStatus: "resolved"
        }
      };
    }
  };
}

export function createInternalDesignKnowledgeProvider(): DesignReferenceProvider {
  return {
    id: "internal-design-knowledge",
    sourceTypes: ["internal-design-knowledge"],
    async resolve(input) {
      const knowledge = resolveDesignKnowledgeReference(input.reference.name);
      if (!knowledge) return { profile: null, reference: { ...input.reference, resolutionStatus: "not-found" } };
      const parsed = parseDesignMd({
        content: [
          `# ${knowledge.name}`,
          `## Visual Theme & Atmosphere\n${knowledge.atmosphere.join("\n")}`,
          `## Colors\n${Object.entries(knowledge.colors).map(([key, value]) => `${key}: ${value}`).join("\n")}`,
          `## Typography\n${Object.values(knowledge.typography).map((token) => `${token.name}: ${token.family ?? ""}; ${token.size ?? ""}; ${token.weight ?? ""}`).join("\n")}`,
          `## Layout\n${knowledge.layout.join("\n")}`,
          `## Components\n${Object.keys(knowledge.components).join("\n")}`,
          `## Responsive\n${knowledge.responsive.join("\n")}`
        ].join("\n\n"),
        sourceId: input.reference.id
      });
      return {
        profile: profile({
          confidence: knowledge.confidence,
          evidenceStatus: "inferred",
          facts: parsed,
          knowledge,
          limitations: ["Internal design knowledge is visual-reference-only and cannot supply business facts."],
          reference: input.reference
        }),
        reference: {
          ...input.reference,
          provenance: {
            ...input.reference.provenance,
            capturedAt: input.now().toISOString(),
            fingerprint: knowledge.fingerprint,
            license: "MIT"
          },
          resolutionStatus: "resolved"
        }
      };
    }
  };
}

export function createUploadedVisualReferenceProvider(): DesignReferenceProvider {
  return {
    id: "uploaded-visual-reference",
    sourceTypes: ["uploaded-image", "uploaded-screenshot"],
    async resolve(input) {
      const evidence = input.visualEvidence ?? [];
      const visionFacts = factsFromText(input.visionText ?? "", input.reference.id, "observed");
      const matching = evidence.find((entry) => input.reference.name.toLowerCase().includes(entry.artifactId.toLowerCase())) ?? evidence[0];
      const geometry = matching?.width && matching.height
        ? [fact(`Reference viewport aspect ratio is approximately ${(matching.width / matching.height).toFixed(2)} (${matching.width} x ${matching.height})`, matching.artifactId, "observed")]
        : [];
      const hasUsefulVision = Object.values(visionFacts).some((facts) => facts.length > 0) || Boolean(input.visionText?.trim());
      return {
        profile: profile({
          confidence: hasUsefulVision ? 0.76 : 0.42,
          evidenceStatus: hasUsefulVision ? "observed" : "uncertain",
          facts: {
            ...visionFacts,
            layout: [...visionFacts.layout, ...geometry],
            motion: [fact("A static image does not prove motion or interaction behavior.", input.reference.id, "unavailable")],
            responsive: evidence.length > 1
              ? [fact("Multiple supplied viewports may support responsive comparison; relationships remain evidence-bounded.", input.reference.id, "inferred")]
              : [fact("Responsive behavior is not observed from one static image.", input.reference.id, "unavailable")],
            typography: [
              ...visionFacts.typography,
              fact("Exact font family is unknown unless separately specified.", input.reference.id, "uncertain")
            ]
          },
          limitations: [
            ...(matching?.warnings ?? []),
            ...(hasUsefulVision ? [] : ["The image was available, but detailed visual analysis was unavailable."])
          ],
          reference: input.reference
        }),
        reference: {
          ...input.reference,
          provenance: { ...input.reference.provenance, capturedAt: input.now().toISOString() },
          resolutionStatus: hasUsefulVision ? "resolved" : "partial"
        }
      };
    }
  };
}

function safeWorkspaceEntries(input: DesignReferenceProviderInput) {
  const workspace = input.workspace;
  if (!workspace) return [];
  const paths = [...new Set([workspace.activePath, ...workspace.fileList])]
    .filter((path) => /(?:\.css|\.scss|\.html|\.tsx?|\.jsx?|tailwind\.config|HASSALI(?:\.website)?\.md)$/i.test(path))
    .slice(0, designReferenceLimits.maxWorkspaceFiles);
  let remaining = designReferenceLimits.maxWorkspaceCharacters;
  return paths.flatMap((path) => {
    if (remaining <= 0) return [];
    const raw = workspace.fileContents[path] ?? (path === workspace.activePath ? workspace.activeFileContent : "");
    const content = raw.slice(0, remaining);
    remaining -= content.length;
    return content ? [{ content, path }] : [];
  });
}

export function createExistingProjectReferenceProvider(): DesignReferenceProvider {
  return {
    id: "existing-project-reference",
    sourceTypes: ["existing-project", "existing-project-page"],
    async resolve(input) {
      const entries = safeWorkspaceEntries(input);
      const corpus = entries.map((entry) => entry.content).join("\n");
      const extracted = factsFromText(corpus, input.reference.id, "observed");
      const colors = [...corpus.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].toUpperCase());
      const fontFamilies = [...corpus.matchAll(/font-family\s*:\s*([^;}\n]+)/gi)].map((match) => match[1].trim());
      return {
        profile: profile({
          confidence: entries.length ? 0.82 : 0.35,
          evidenceStatus: entries.length ? "observed" : "unavailable",
          facts: {
            ...extracted,
            colors: [...extracted.colors, ...[...new Set(colors)].slice(0, 16).map((color) => fact(`Existing project color ${color}`, input.reference.id, "observed"))],
            motion: /\b(?:transition|animation|@keyframes)\b/i.test(corpus)
              ? [fact("Existing project contains transition or animation definitions.", input.reference.id, "observed")]
              : [fact("No motion system was observed in bounded project evidence.", input.reference.id, "unavailable")],
            responsive: /@media\b|\b(?:sm|md|lg|xl):/.test(corpus)
              ? [fact("Existing project contains responsive breakpoint evidence.", input.reference.id, "observed")]
              : [fact("No responsive rules were observed in bounded project evidence.", input.reference.id, "unavailable")],
            typography: [...extracted.typography, ...[...new Set(fontFamilies)].slice(0, 6).map((font) => fact(`Existing project font family: ${font}`, input.reference.id, "observed"))]
          },
          limitations: entries.length ? [] : ["No bounded visual-system source files were available."],
          reference: input.reference
        }),
        reference: {
          ...input.reference,
          provenance: {
            ...input.reference.provenance,
            capturedAt: input.now().toISOString(),
            fingerprint: corpus ? createHash("sha256").update(corpus).digest("hex").slice(0, 16) : null
          },
          resolutionStatus: entries.length ? "resolved" : "partial"
        }
      };
    }
  };
}

export function createUserDescriptionReferenceProvider(): DesignReferenceProvider {
  return {
    id: "user-description-reference",
    sourceTypes: ["user-description"],
    async resolve(input) {
      const extracted = factsFromText(input.prompt, input.reference.id, "directly-specified");
      return {
        profile: profile({
          confidence: 0.84,
          evidenceStatus: "directly-specified",
          facts: {
            ...extracted,
            doRules: [fact("Use the current user's original design description as the design source.", input.reference.id, "directly-specified")],
            dontRules: [fact("Do not force an unrelated named-brand clone or generic AI theme.", input.reference.id, "directly-specified")]
          },
          reference: input.reference
        }),
        reference: { ...input.reference, provenance: { ...input.reference.provenance, capturedAt: input.now().toISOString() } }
      };
    }
  };
}

export function createLiveWebsiteReferenceProvider(input: {
  fetchImpl?: typeof fetch;
  retrieve?: typeof retrievePublicResearchPage;
} = {}): DesignReferenceProvider {
  const retrieve = input.retrieve ?? retrievePublicResearchPage;
  return {
    id: "live-website-reference",
    sourceTypes: ["public-url"],
    async resolve(providerInput) {
      const url = providerInput.reference.userSuppliedUrl ?? providerInput.reference.canonicalUrl;
      if (!url) return { profile: null, reference: { ...providerInput.reference, resolutionStatus: "not-found" } };
      try {
        const source = await retrieve(url, { id: providerInput.reference.id, sourceType: "primary" }, {
          fetchImpl: input.fetchImpl,
          signal: providerInput.signal,
          timeoutMs: 7_000
        });
        const extracted = factsFromText(source.content, providerInput.reference.id, "observed");
        const sourceUrl = source.url ?? url;
        const designMd = /(?:^|\/)design\.md(?:$|[?#])/i.test(sourceUrl) || /^#\s+.*design/im.test(source.content)
          ? parseDesignMd({ content: source.content, sourceId: providerInput.reference.id })
          : null;
        const sourceFingerprint = createHash("sha256").update(source.content).digest("hex").slice(0, 16);
        return {
          profile: profile({
            confidence: designMd ? 0.9 : 0.54,
            evidenceStatus: designMd ? "directly-specified" : "observed",
            facts: designMd ?? {
              ...extracted,
              motion: [fact("Motion was not captured by bounded HTML text retrieval.", providerInput.reference.id, "unavailable")],
              responsive: [fact("Responsive behavior requires viewport or stylesheet evidence.", providerInput.reference.id, "unavailable")],
              typography: [...extracted.typography, fact("Exact font family is unavailable from bounded page text.", providerInput.reference.id, "uncertain")]
            },
            limitations: designMd?.warnings ?? ["Live URL intake used bounded public page evidence; rendered computed-style inspection is deferred."],
            reference: providerInput.reference
          }),
          reference: {
            ...providerInput.reference,
            canonicalUrl: source.canonicalUrl ?? sourceUrl,
            provenance: {
              ...providerInput.reference.provenance,
              capturedAt: source.retrievedAt,
              fingerprint: sourceFingerprint,
              sourceUrl
            },
            resolutionStatus: designMd ? "resolved" : "partial"
          }
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : "REFERENCE_FETCH_FAILED";
        return {
          profile: null,
          reference: {
            ...providerInput.reference,
            limitations: [...providerInput.reference.limitations, `Public reference retrieval unavailable: ${reason}`],
            resolutionStatus: "not-found"
          }
        };
      }
    }
  };
}

export function extractHtmlReferenceText(html: string) {
  return extractResearchPageText(html);
}
