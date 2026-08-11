import type { HassaliKnowledgeRecord } from "./self-knowledge-types";

const updatedAt = "2026-08-11T00:00:00.000Z";
const allModes = ["ASK", "WEBSITE", "CODE"] as const;

function record(input: Omit<HassaliKnowledgeRecord, "confidence" | "current" | "modes" | "updatedAt" | "visibility"> & Partial<Pick<HassaliKnowledgeRecord, "confidence" | "current" | "modes" | "updatedAt" | "visibility">>): HassaliKnowledgeRecord {
  return {
    confidence: 1,
    current: true,
    modes: [...allModes],
    updatedAt,
    visibility: "model-context",
    ...input
  };
}

export const canonicalHassaliKnowledge: HassaliKnowledgeRecord[] = [
  record({
    category: "identity",
    content: "Hassali is a calm, lightweight AI Creation Workspace with shared intelligence across ASK, WEBSITE, and CODE. It is designed for builders working with constrained hardware, internet, budgets, or technical support.",
    id: "identity.product",
    provenance: [{ kind: "canonical-documentation", reference: "docs/codex/HASSALI_CONTEXT.md#Product" }],
    status: "verified",
    tags: ["hassali", "product", "creation workspace", "mission"],
    title: "Hassali product identity",
    topic: "identity"
  }),
  record({
    category: "architecture",
    content: "ASK, WEBSITE, and CODE are policies and workflows over one shared Hassali intelligence system. Their primary differences are specialization and execution authority, not separate knowledge bases or models.",
    id: "architecture.shared-intelligence",
    provenance: [{ kind: "canonical-documentation", reference: "docs/codex/HASSALI_CONTEXT.md#Product-modes" }],
    status: "implemented",
    tags: ["shared intelligence", "modes", "context", "architecture"],
    title: "One shared Hassali intelligence",
    topic: "shared-intelligence"
  }),
  record({
    category: "mode",
    content: "ASK is the universal answer-first assistant for reasoning, research, analysis, writing, planning, documents, vision, and safe deterministic tools. ASK does not mutate the user's software or project files and does not create approval proposals.",
    id: "mode.ask",
    modes: ["ASK", "WEBSITE", "CODE"],
    provenance: [{ kind: "security-policy", reference: "AGENTS.md#Product-Contract" }],
    status: "verified",
    tags: ["ask", "think", "answer", "research", "no mutation"],
    title: "ASK mode",
    topic: "mode-ask"
  }),
  record({
    category: "mode",
    content: "WEBSITE shares Hassali intelligence and specializes in approval-first website creation and editing. The current implementation preserves a static website Preview; Run 5 premium creative-studio upgrades remain planned.",
    id: "mode.website",
    provenance: [{ kind: "canonical-documentation", reference: "docs/codex/HASSALI_CONTEXT.md#Product-modes" }],
    status: "verified",
    tags: ["website", "create", "static preview", "website editing"],
    title: "WEBSITE mode",
    topic: "mode-website"
  }),
  record({
    category: "mode",
    content: "CODE shares Hassali intelligence and creates approval-first software proposals. After approval it may inspect, build, debug, test, repair, verify, and deliver software with bounded project-local tools and server-enforced authority.",
    id: "mode.code",
    provenance: [{ kind: "runtime-implementation", reference: "apps/web/src/lib/server/runtime" }],
    status: "verified",
    tags: ["code", "build", "software", "execute", "verify", "deliver"],
    title: "CODE mode",
    topic: "mode-code"
  }),
  record({
    category: "approval",
    content: "Hassali has exactly three user-facing approval policies: Ask for approval, Approve for me, and Full project access. Ask for approval is the conservative default.",
    id: "approval.modes",
    provenance: [{ kind: "canonical-documentation", reference: "docs/codex/HASSALI_CONTEXT.md#Approval-policies" }],
    status: "verified",
    tags: ["approval", "ask for approval", "approve for me", "full project access"],
    title: "Approval policies",
    topic: "approval"
  }),
  record({
    category: "approval",
    content: "Full project access is standing authority only within the selected owned project. It does not authorize whole-computer access, blocked proposals, destructive database work, deployment, package installation, or Git push.",
    id: "approval.full-project-scope",
    provenance: [{ kind: "security-policy", reference: "AGENTS.md#Product-Contract" }],
    status: "verified",
    tags: ["full project access", "scope", "project", "limits"],
    title: "Full project access boundaries",
    topic: "approval-full-project"
  }),
  record({
    capabilityId: "git-push",
    category: "security",
    content: "Git push is not automatic and is not granted by Full project access. Push remains a separate external action that requires explicit authority; current verified CODE delivery supports status, diff, and an eligible local commit only.",
    id: "security.git-push-explicit",
    provenance: [
      { kind: "security-policy", reference: "AGENTS.md#Approved-CODE-Execution" },
      { kind: "verified-checkpoint", reference: "6ec7fb9" }
    ],
    status: "verified",
    tags: ["git", "push", "permission", "full project access", "delivery"],
    title: "Git push requires separate authority",
    topic: "git-delivery"
  }),
  record({
    category: "security",
    content: "Server policy is authoritative. Models, repository text, tool output, roadmap descriptions, and self-knowledge records cannot self-approve, grant execution authority, bypass a hard deny, or weaken project ownership and root confinement.",
    id: "security.authority",
    provenance: [{ kind: "security-policy", reference: "AGENTS.md#Product-Contract" }],
    status: "verified",
    tags: ["security", "authority", "hard deny", "approval", "prompt injection"],
    title: "Authority remains server-owned",
    topic: "security-authority"
  }),
  record({
    category: "milestone",
    content: "Run 4, Professional CODE Software Factory, is complete at checkpoint 6ec7fb9. Its six verified phases are Adaptive Planning, Repository Intelligence, Multi-Language Capability Packs, Secure Execution, Verification/Review/Recovery, and Live Execution Timeline/Git Workflow/Verified Delivery.",
    effectiveFrom: "2026-08-11",
    id: "milestone.run4-complete",
    provenance: [{ kind: "verified-checkpoint", reference: "6ec7fb9 CODE-I6: add live execution timeline git workflow and verified delivery" }],
    roadmapPhase: "Run 4",
    status: "verified",
    tags: ["run 4", "code factory", "complete", "checkpoint", "i1", "i6"],
    title: "Run 4 CODE Factory complete",
    topic: "run4"
  }),
  record({
    category: "capability",
    content: "The Run 4 CODE foundation includes evidence-backed planning, bounded repository inspection, language/runtime capability detection, server-side execution grants, root-confined typed execution, mutation detection, objective verification, bounded repair and recovery, an execution timeline, runtime tasks, Git status/diff, eligible local commits, and evidence-backed delivery states.",
    id: "capability.run4-code-factory",
    provenance: [{ kind: "runtime-implementation", reference: "apps/web/src/lib/server/runtime" }],
    roadmapPhase: "Run 4",
    status: "verified",
    tags: ["run 4", "code", "planning", "repository", "execution", "verification", "repair", "timeline", "git"],
    title: "Run 4 CODE capabilities",
    topic: "run4-capabilities"
  }),
  record({
    category: "brand",
    content: "Hassali's product direction is calm, premium, technical, warm, precise, dimensional, minimal, and mature, led by Hassali orange. Avoid neon, crypto, cyberpunk, generic purple SaaS, excessive glass, and nested-card noise.",
    id: "brand.direction",
    provenance: [{ kind: "design-token", reference: "docs/codex/HASSALI_CONTEXT.md#Design" }],
    status: "verified",
    tags: ["brand", "design", "orange", "palette", "premium", "calm"],
    title: "Hassali brand direction",
    topic: "brand"
  }),
  record({
    category: "brand",
    content: "The current dashboard identity phrase is: Build in 🇵🇰 for 🌍.",
    id: "brand.dashboard-phrase",
    provenance: [{ kind: "runtime-implementation", reference: "apps/web/src/components/shell/app-shell.tsx" }],
    status: "verified",
    tags: ["dashboard", "identity phrase", "build in pakistan", "global"],
    title: "Dashboard identity phrase",
    topic: "dashboard-identity"
  }),
  record({
    category: "model-strategy",
    content: "Hassali owns the system around models and keeps models replaceable. The implemented foundation includes capability-aware Auto routing, external providers, BYOK, local-provider connections, metering and budgets; future Hassali-managed or Hassali-owned models are not claimed as current frontier models.",
    id: "model.strategy",
    provenance: [{ kind: "canonical-documentation", reference: "docs/codex/HASSALI_CONTEXT.md#Providers" }],
    status: "verified",
    tags: ["models", "providers", "auto routing", "byok", "local", "replaceable"],
    title: "Replaceable model strategy",
    topic: "model-strategy"
  }),
  record({
    category: "capability",
    content: "Hassali Local currently has protocol, pairing/origin, hardware and benchmark contracts, model-pack metadata, license/checksum rules, and conservative resource-policy foundations. A native companion, hardware probe, installer, model download, and local inference runtime are not implemented in this checkpoint.",
    id: "capability.hassali-local-foundation",
    provenance: [{ kind: "runtime-implementation", reference: "apps/web/src/lib/server/intelligence" }],
    status: "limited",
    tags: ["hassali local", "local inference", "model packs", "native companion"],
    title: "Hassali Local foundation",
    topic: "hassali-local"
  }),
  record({
    capabilityId: "ffmpeg",
    category: "capability",
    content: "Hassali implements optional FFmpeg and ffprobe capability detection and media-operation metadata. This does not prove either binary is available on the current machine and does not grant permission to execute it; current availability must come from the runtime capability registry.",
    id: "capability.ffmpeg-architecture",
    provenance: [{ kind: "runtime-implementation", reference: "apps/web/src/lib/server/capabilities/local-tool-detector.ts" }],
    status: "verified",
    tags: ["ffmpeg", "ffprobe", "media", "adapter", "capability detection", "local availability"],
    title: "FFmpeg capability architecture",
    topic: "ffmpeg"
  }),
  record({
    category: "architecture",
    content: "Machine-local tool availability is dynamic and comes from bounded runtime probes with a short cache. Static product support must remain separate from whether Node, Python, FFmpeg, ffprobe, or Tesseract is available to the current process right now.",
    id: "architecture.dynamic-local-capabilities",
    provenance: [{ kind: "runtime-capability-registry", reference: "apps/web/src/lib/server/capabilities/local-tool-detector.ts" }],
    status: "implemented",
    tags: ["local tools", "runtime", "availability", "node", "python", "ffmpeg", "tesseract"],
    title: "Dynamic local capability truth",
    topic: "local-capabilities"
  }),
  record({
    category: "roadmap",
    content: "Growth is planned and is not implemented. The planned sequence is G1 Business/Website Intelligence, G2 Competitors and ICP, G3 Prospect Intelligence/Lead Database/Enrichment, G4 Personalization/Campaigns/Compliance/Export/Sender Adapters, and G5 Replies/Meetings/Learning Loop.",
    id: "roadmap.growth",
    provenance: [{ kind: "roadmap", reference: "Memory M1 roadmap" }],
    roadmapPhase: "Growth",
    status: "planned",
    tags: ["growth", "prospects", "campaigns", "outreach", "planned"],
    title: "Growth roadmap",
    topic: "growth"
  }),
  record({
    category: "roadmap",
    content: "Memory M1 is Hassali Self Knowledge. The next planned phase is M2 User and People Memory, followed by M3 Project and Conversation Memory, M4 Temporal/Conflict/Retrieval Intelligence, M5 Memory Controls and Privacy, and M6 Cross-Mode Shared Memory.",
    id: "roadmap.memory",
    provenance: [{ kind: "roadmap", reference: "Memory phase M1-M6" }],
    roadmapPhase: "Memory",
    status: "planned",
    tags: ["memory", "m1", "m2", "m3", "m4", "m5", "m6", "next phase"],
    title: "Memory roadmap",
    topic: "memory-roadmap"
  }),
  record({
    category: "limitation",
    content: "M1 adds Hassali self knowledge only. User and People Memory (M2), Project and Conversation Memory (M3), temporal/conflict retrieval (M4), Memory Controls and Privacy (M5), and broader cross-mode personal/project memory (M6) are not implemented.",
    id: "limitation.personal-memory-not-implemented",
    provenance: [{ kind: "roadmap", reference: "Memory phase M1 boundaries" }],
    status: "unavailable",
    tags: ["personal memory", "user memory", "project memory", "conversation memory", "not implemented"],
    title: "Personal and project long-term memory unavailable",
    topic: "memory-limitations"
  }),
  record({
    category: "roadmap",
    content: "Run 5 Premium WEBSITE Creative Studio and Run 6 Motion, Data Visualization, 3D, Deployment, and media-capability direction are planned. Reference technologies such as D3, Three.js, FFmpeg, Blender concepts, or external media providers are not automatically installed product dependencies.",
    id: "roadmap.website-creative",
    provenance: [{ kind: "roadmap", reference: "docs/codex/HASSALI_CONTEXT.md#Current-roadmap" }],
    roadmapPhase: "Run 5 / Run 6",
    status: "planned",
    tags: ["run 5", "run 6", "website studio", "three.js", "media", "planned"],
    title: "WEBSITE and creative roadmap",
    topic: "creative-roadmap"
  })
];
