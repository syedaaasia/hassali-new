import type { HassaliAttachment } from "@/lib/attachments";
import type { MemoryContextCapsule } from "@/lib/server/shared-memory/shared-memory";
import type { VisualArtifact } from "@/lib/server/attachments/visual-contract";
import {
  compactDesignDirectionRequest,
  designReferenceLimits,
  DesignReferenceProviderRegistry,
  type DesignDirectionRequest,
  type DesignReference,
  type ReferenceConflict,
  type ReferenceDesignProfile
} from "./design-reference-contract";
import { classifyDesignReferenceIntent, type ReferenceAttachmentInput } from "./reference-intent";
import {
  createCatalogReferenceProvider,
  createDesignMdReferenceProvider,
  createExistingProjectReferenceProvider,
  createInternalDesignKnowledgeProvider,
  createLiveWebsiteReferenceProvider,
  createUploadedVisualReferenceProvider,
  createUserDescriptionReferenceProvider
} from "./reference-profile";
import { retrieveDesignKnowledge } from "@/lib/server/design/knowledge/design-knowledge-library";

type AttachmentRecord = { bytes: Uint8Array; metadata: HassaliAttachment };

function attachmentInputs(records: AttachmentRecord[]): {
  contentByReferenceName: Map<string, string>;
  inputs: ReferenceAttachmentInput[];
} {
  const contentByReferenceName = new Map<string, string>();
  const inputs = records.map((record) => {
    const isText = record.metadata.kind === "text" || record.metadata.kind === "data";
    const content = isText ? Buffer.from(record.bytes).toString("utf8").slice(0, designReferenceLimits.maxDesignMdBytes) : null;
    if (content) contentByReferenceName.set(record.metadata.safeName.toLowerCase(), content);
    return {
      content,
      id: record.metadata.id,
      kind: record.metadata.kind === "image" ? "image" as const : "other" as const,
      name: record.metadata.safeName
    };
  });
  return { contentByReferenceName, inputs };
}

function designMemoryConstraints(memory: MemoryContextCapsule | null | undefined) {
  if (!memory || memory.policy.state !== "active") return [];
  return Object.values(memory.sections).flat()
    .map((item) => item.content.trim())
    .filter((content) =>
      /\b(?:website|websites|web design|brand design|design system|visual direction|typography|layout|interface|ui|rounded|square|sharp)\b/i.test(content) &&
      !/\b(?:car|cars|suzuki|family|health|food|medical|favorite color)\b/i.test(content)
    )
    .slice(0, 6);
}

function shouldUseAutomaticDesignKnowledge(prompt: string) {
  return /\b(?:build|create|design|make)\b[\s\S]{0,100}\b(?:website|site|landing page|portfolio)\b/i.test(prompt) &&
    /\b(?:cinematic|editorial|brutalist|playful|minimal|luxury|technical|commerce|product-led|photography-first)\b/i.test(prompt) &&
    !/\b(?:original|do not copy|don't copy|dont copy)\b/i.test(prompt);
}

function currentConstraints(prompt: string) {
  const patterns = [
    /\b(?:use|keep|make|prefer|with)\s+(?:very |highly )?(?:rounded|square|sharp)\s+(?:cards?|corners?)\b/gi,
    /\b(?:dark|light|luxury|editorial|minimal|playful|cinematic)\s+(?:theme|direction|style|visuals?)\b/gi,
    /\b(?:do not|don't|dont|avoid)\s+[^.!?\n]{2,100}/gi
  ];
  return [...new Set(patterns.flatMap((pattern) => [...prompt.matchAll(pattern)].map((match) => match[0].trim())))].slice(0, 8);
}

function projectNoteConstraints(notes: string | undefined) {
  if (!notes?.trim()) return [];
  return notes.split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line && /\b(?:accents?|backgrounds?|brands?|buttons?|cards?|colors?|corners?|design|display|fonts?|headings?|imagery|layout|palette|radius|sans(?:-serif)?|serif|surfaces?|theme|typography|visual)\b/i.test(line))
    .slice(0, 5);
}

function oppositeConstraint(left: string, right: string) {
  const pair = `${left.toLowerCase()} ${right.toLowerCase()}`;
  return (/\b(?:square|sharp)\b/.test(pair) && /\brounded\b/.test(pair)) ||
    (/\bdark\b/.test(pair) && /\blight\b/.test(pair));
}

function referenceConflicts(references: DesignReference[], profiles: ReferenceDesignProfile[]): ReferenceConflict[] {
  const globals = references.filter((reference) => reference.role === "global");
  if (globals.length < 2) return [];
  const atmosphere = globals.flatMap((reference) => {
    const values = profiles.find((profile) => profile.referenceId === reference.id)?.atmosphere.map((fact) => fact.value) ?? [];
    return values.map((value) => ({ reference, value }));
  });
  const conflict = atmosphere.some((left, index) =>
    atmosphere.slice(index + 1).some((right) => left.reference.id !== right.reference.id && oppositeConstraint(left.value, right.value))
  );
  return conflict ? [{
    dimension: "atmosphere",
    referenceIds: globals.map((reference) => reference.id),
    resolution: "defer-to-i2",
    summary: "Global references contain different atmosphere signals; preserve both for I2 composition."
  }] : [];
}

function hasWorkspaceVisualSystem(workspace: BuildDesignReferenceIntakeInput["workspace"]) {
  return Boolean(workspace?.fileList.some((path) => /(?:\.css|\.scss|tailwind\.config|DESIGN\.md|HASSALI(?:\.website)?\.md)$/i.test(path)));
}

export type BuildDesignReferenceIntakeInput = {
  attachments?: AttachmentRecord[];
  fetchImpl?: typeof fetch;
  memory?: MemoryContextCapsule | null;
  now?: () => Date;
  projectNotes?: string;
  prompt: string;
  signal?: AbortSignal;
  visionText?: string;
  visualArtifacts?: VisualArtifact[];
  workspace?: {
    activeFileContent: string;
    activePath: string;
    fileContents?: Record<string, string>;
    fileList: string[];
  };
};

export async function buildDesignReferenceIntake(input: BuildDesignReferenceIntakeInput): Promise<DesignDirectionRequest> {
  const now = input.now ?? (() => new Date());
  const attachments = attachmentInputs(input.attachments ?? []);
  const classifiedIntent = classifyDesignReferenceIntent({
    attachments: attachments.inputs,
    prompt: input.prompt,
    workspaceHasVisualSystem: hasWorkspaceVisualSystem(input.workspace)
  });
  const hasExplicitReference = classifiedIntent.references.some((reference) =>
    ["named-brand", "public-url", "uploaded-design-md", "uploaded-image", "uploaded-screenshot"].includes(reference.sourceType)
  );
  const automatic = hasExplicitReference || !shouldUseAutomaticDesignKnowledge(input.prompt)
    ? []
    : retrieveDesignKnowledge({ maximum: 1, prompt: input.prompt });
  const automaticReferences: DesignReference[] = automatic.map(({ profile }) => ({
    canonicalUrl: null,
    confidence: profile.confidence,
    fidelity: classifiedIntent.fidelity,
    id: `internal-design-${profile.fingerprint.slice(0, 12)}`,
    limitations: ["Internal design knowledge is visual-reference-only."],
    name: profile.id,
    pageTarget: null,
    provenance: {
      capturedAt: null,
      fingerprint: profile.fingerprint,
      license: "MIT",
      private: true,
      providerId: "internal-design-knowledge",
      revision: null,
      sourceLabel: "Private Hassali design knowledge",
      sourceUrl: null
    },
    resolutionStatus: "resolved",
    role: "global",
    sourceType: "internal-design-knowledge",
    userSuppliedUrl: null
  }));
  const intent = {
    ...classifiedIntent,
    references: automaticReferences.length
      ? [...automaticReferences, ...classifiedIntent.references.filter((reference) => reference.sourceType !== "user-description")]
      : classifiedIntent.references
  };
  const contentByReferenceId = new Map<string, string>();
  for (const reference of intent.references) {
    if (reference.sourceType !== "uploaded-design-md") continue;
    const content = attachments.contentByReferenceName.get(reference.name.toLowerCase());
    if (content) contentByReferenceId.set(reference.id, content);
  }
  const registry = new DesignReferenceProviderRegistry()
    .register(createCatalogReferenceProvider())
    .register(createDesignMdReferenceProvider(contentByReferenceId))
    .register(createInternalDesignKnowledgeProvider())
    .register(createUploadedVisualReferenceProvider())
    .register(createExistingProjectReferenceProvider())
    .register(createUserDescriptionReferenceProvider())
    .register(createLiveWebsiteReferenceProvider({ fetchImpl: input.fetchImpl }));

  const references: DesignReference[] = [];
  const profiles: ReferenceDesignProfile[] = [];
  for (const candidate of intent.references.slice(0, designReferenceLimits.maxReferences)) {
    const provider = registry.forSource(candidate.sourceType);
    if (!provider) {
      references.push({ ...candidate, resolutionStatus: "not-found" });
      continue;
    }
    const result = await provider.resolve({
      memory: input.memory,
      now,
      projectNotes: input.projectNotes,
      prompt: input.prompt,
      reference: candidate,
      signal: input.signal,
      visionText: input.visionText,
      visualEvidence: (input.visualArtifacts ?? []).map((artifact) => ({
        artifactId: artifact.id,
        height: artifact.height,
        kind: artifact.sourceType === "screenshot" ? "screenshot" : "image",
        warnings: artifact.warnings,
        width: artifact.width
      })),
      workspace: input.workspace ? {
        ...input.workspace,
        fileContents: input.workspace.fileContents ?? {}
      } : undefined
    });
    references.push(result.reference);
    if (result.profile && profiles.length < designReferenceLimits.maxProfiles) profiles.push(result.profile);
  }

  const current = currentConstraints(input.prompt);
  const memory = designMemoryConstraints(input.memory);
  const overriddenMemory = memory.filter((saved) => current.some((constraint) => oppositeConstraint(saved, constraint)));
  const unknowns = references.flatMap((reference) => {
    if (reference.resolutionStatus === "not-found" || reference.resolutionStatus === "ambiguous") {
      return [`${reference.name} could not be resolved. Ask for a URL, screenshot, or DESIGN.md.`];
    }
    return reference.limitations.filter((limitation) => /unavailable|unresolved/i.test(limitation));
  });
  if ((input.visualArtifacts?.length ?? 0) === 1) unknowns.push("One static image cannot prove motion or responsive behavior.");

  return {
    conflicts: referenceConflicts(references, profiles),
    constraints: {
      currentRequest: current,
      memory: memory.filter((constraint) => !overriddenMemory.includes(constraint)),
      overriddenMemory,
      projectNotes: projectNoteConstraints(input.projectNotes)
    },
    createdAt: now().toISOString(),
    currentRequest: input.prompt,
    fidelity: intent.fidelity,
    profiles,
    references,
    security: {
      blocked: Boolean(intent.securityBlockReason),
      reason: intent.securityBlockReason,
      referenceContentAuthority: "untrusted-data-only"
    },
    unknowns: [...new Set(unknowns)].slice(0, 12),
    userBrand: intent.userBrand,
    version: 1
  };
}

export function designReferenceVisibleSummary(request: DesignDirectionRequest | null) {
  if (!request) return "";
  const visibleReferences = request.references.filter((reference) => reference.sourceType !== "internal-design-knowledge");
  const primary = visibleReferences[0];
  if (!primary && request.references.some((reference) => reference.sourceType === "internal-design-knowledge")) {
    return "Design direction: tailored visual system\nEvidence: Hassali design intelligence";
  }
  if (!primary) return "";
  const sourceLabels = [...new Set(visibleReferences.map((reference) => reference.sourceType))];
  const referenceLabel = visibleReferences.length === 1
    ? `${primary.name}${primary.role === "global" ? "" : ` (${primary.role})`}`
    : visibleReferences.map((reference) => `${reference.name} (${reference.role})`).join(", ");
  const lines = [
    `Reference: ${referenceLabel}`,
    `Requested fidelity: ${request.fidelity}`,
    `Evidence: ${sourceLabels.join(" + ")}`,
    request.userBrand ? `User brand: ${request.userBrand}` : null,
    request.unknowns.length ? `Reference limits: ${request.unknowns.slice(0, 2).join(" ")}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

export { compactDesignDirectionRequest };
