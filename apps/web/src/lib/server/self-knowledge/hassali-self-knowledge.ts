import { detectLocalToolCapabilities } from "../capabilities/local-tool-detector";
import type { LocalToolCapability, LocalToolId } from "../capabilities/capability-types";
import type { IntelligenceProductMode } from "../intelligence/skill-kernel";
import { canonicalHassaliKnowledge } from "./canonical-hassali-knowledge";
import type {
  HassaliKnowledgeContext,
  HassaliKnowledgeQuery,
  HassaliKnowledgeRecord,
  HassaliKnowledgeResult,
  HassaliKnowledgeStatus
} from "./self-knowledge-types";

const defaultMaxRecords = 6;
const hardMaxRecords = 8;
const defaultMaxChars = 3_200;
const hardMaxChars = 5_000;
const stopWords = new Set(["a", "an", "and", "are", "can", "currently", "did", "do", "does", "for", "has", "have", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "this", "to", "use", "what", "when", "which", "who", "you"]);
const conceptAliases: Record<string, string[]> = {
  approvals: ["approval", "permission", "authority", "full project access"],
  brand: ["brand", "color", "colour", "design", "palette", "orange"],
  code: ["code", "software", "runtime", "execution", "run 4", "factory"],
  ffmpeg: ["ffmpeg", "ffprobe", "media", "local capability"],
  growth: ["growth", "prospect", "campaign", "outreach", "lead"],
  memory: ["memory", "remember", "m1", "m2", "m3", "m4", "m5", "m6"],
  models: ["model", "provider", "byok", "auto routing", "ollama", "llama"],
  push: ["push", "git", "repository", "full project access"],
  website: ["website", "site", "static preview", "run 5"]
};

type LocalToolResolver = () => Promise<LocalToolCapability[]>;

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.+#-]+/g, " ").replace(/\s+/g, " ").trim();
}

function termsFor(value: string) {
  const normalized = normalize(value);
  const terms = normalized.split(" ").filter((term) => term.length > 1 && !stopWords.has(term));
  for (const [concept, aliases] of Object.entries(conceptAliases)) {
    if (aliases.some((alias) => normalized.includes(alias))) terms.push(concept, ...aliases.flatMap((alias) => normalize(alias).split(" ")));
  }
  return [...new Set(terms)];
}

function recordText(record: HassaliKnowledgeRecord) {
  return normalize([
    record.id,
    record.topic,
    record.category,
    record.title,
    record.content,
    record.capabilityId ?? "",
    record.roadmapPhase ?? "",
    ...record.tags
  ].join(" "));
}

function cloneRecord(record: HassaliKnowledgeRecord): HassaliKnowledgeRecord {
  return {
    ...record,
    modes: [...record.modes],
    provenance: record.provenance.map((source) => ({ ...source })),
    supersedes: record.supersedes ? [...record.supersedes] : undefined,
    tags: [...record.tags]
  };
}

function fingerprintRecords(records: HassaliKnowledgeRecord[]) {
  let hash = 2166136261;
  const value = records
    .map((record) => `${record.id}|${record.status}|${record.current}|${record.updatedAt}|${record.content}`)
    .sort()
    .join("\n");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `self-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value!)));
}

function scoreRecord(record: HassaliKnowledgeRecord, query: HassaliKnowledgeQuery, terms: string[]) {
  const searchable = recordText(record);
  const normalizedQuery = normalize(query.text);
  let score = record.current ? 20 : -20;
  if (record.visibility === "model-context" || record.visibility === "public") score += 3;
  if (query.mode && record.modes.includes(query.mode)) score += 8;
  if (query.categories?.includes(record.category)) score += 30;
  if (query.statuses?.includes(record.status)) score += 25;
  if (query.capabilityId && record.capabilityId === query.capabilityId) score += 45;
  if (query.roadmapPhase && normalize(record.roadmapPhase ?? "") === normalize(query.roadmapPhase)) score += 35;
  if (normalizedQuery && searchable.includes(normalizedQuery)) score += 55;
  for (const term of terms) {
    if (normalize(record.title).includes(term)) score += 12;
    if (normalize(record.topic).includes(term) || record.tags.some((tag) => normalize(tag).includes(term))) score += 9;
    else if (searchable.includes(term)) score += 3;
  }
  return score * record.confidence;
}

function shouldInclude(record: HassaliKnowledgeRecord, query: HassaliKnowledgeQuery) {
  if (!query.includeSuperseded && (!record.current || record.status === "deprecated" || record.supersededBy)) return false;
  if (query.mode && !record.modes.includes(query.mode)) return false;
  if (query.categories?.length && !query.categories.includes(record.category)) return false;
  if (query.statuses?.length && !query.statuses.includes(record.status)) return false;
  if (query.capabilityId && record.capabilityId !== query.capabilityId) return false;
  if (query.roadmapPhase && normalize(record.roadmapPhase ?? "") !== normalize(query.roadmapPhase)) return false;
  return true;
}

function statusFromTool(tool: LocalToolCapability): HassaliKnowledgeStatus {
  if (tool.status === "available") return "live-verified";
  if (tool.status === "degraded" || tool.status === "detected") return "degraded";
  if (tool.status === "unavailable" || tool.status === "unsupported" || tool.status === "incompatible") return "unavailable";
  return "limited";
}

function runtimeToolRecord(tool: LocalToolCapability): HassaliKnowledgeRecord {
  const availability = tool.status === "available"
    ? `${tool.id} is currently available${tool.version ? ` at version ${tool.version}` : ""}.`
    : tool.status === "unavailable"
      ? `${tool.id} is currently unavailable to the Hassali server process.`
      : `${tool.id} current availability is ${tool.status}; the bounded runtime probe did not establish a fully ready tool.`;
  return {
    capabilityId: tool.id,
    category: "capability",
    confidence: Math.max(...tool.evidence.map((item) => item.confidence), 0.5),
    content: `${availability} This machine-local result was checked at ${tool.checkedAt}; it does not grant execution authority.`,
    current: true,
    id: `runtime.local-tool.${tool.id}`,
    modes: ["ASK", "WEBSITE", "CODE"],
    provenance: [{ kind: "runtime-capability-registry", reference: "local-tool-detector bounded probe" }],
    status: statusFromTool(tool),
    tags: [tool.id, "local tool", "current machine", "runtime availability"],
    title: `Current ${tool.id} availability`,
    topic: `local-tool-${tool.id}`,
    updatedAt: tool.checkedAt,
    visibility: "model-context"
  };
}

function requestedLocalTools(prompt: string): LocalToolId[] {
  const normalized = normalize(prompt);
  const explicit = (["ffmpeg", "ffprobe", "node", "python", "tesseract"] as LocalToolId[])
    .filter((tool) => normalized.includes(tool));
  if (!explicit.length || !/\b(?:available|availability|installed|local|locally|machine|right now|runtime)\b/i.test(prompt)) return [];
  return explicit;
}

export class HassaliSelfKnowledgeService {
  readonly fingerprint: string;
  private readonly records: HassaliKnowledgeRecord[];
  private readonly cache = new Map<string, { results: HassaliKnowledgeResult[]; totalMatches: number }>();

  constructor(records: HassaliKnowledgeRecord[] = canonicalHassaliKnowledge) {
    this.records = records.map(cloneRecord);
    this.fingerprint = fingerprintRecords(this.records);
  }

  get(id: string) {
    const record = this.records.find((candidate) => candidate.id === id);
    return record ? cloneRecord(record) : null;
  }

  list() {
    return this.records.map(cloneRecord);
  }

  query(query: HassaliKnowledgeQuery): { results: HassaliKnowledgeResult[]; totalMatches: number } {
    const maxRecords = clamp(query.maxRecords, defaultMaxRecords, 1, hardMaxRecords);
    const cacheKey = JSON.stringify({ ...query, maxRecords });
    const cached = this.cache.get(cacheKey);
    if (cached) return { results: cached.results.map((result) => ({ ...result, record: cloneRecord(result.record) })), totalMatches: cached.totalMatches };
    const terms = termsFor(query.text);
    const ranked = this.records
      .filter((record) => shouldInclude(record, query))
      .map((record) => ({ record, relevance: scoreRecord(record, query, terms) }))
      .filter((item) => item.relevance > (terms.length ? 20 : 0))
      .sort((left, right) => right.relevance - left.relevance || Number(right.record.current) - Number(left.record.current) || right.record.confidence - left.record.confidence || left.record.id.localeCompare(right.record.id));
    const deduplicated = ranked.filter((item, index, values) => values.findIndex((candidate) => candidate.record.id === item.record.id || (candidate.record.topic === item.record.topic && candidate.record.current === item.record.current)) === index);
    const results = deduplicated.slice(0, maxRecords).map(({ record, relevance }): HassaliKnowledgeResult => ({
      confidence: record.confidence,
      current: record.current,
      provenance: record.provenance.map((source) => ({ ...source })),
      record: cloneRecord(record),
      relevance,
      status: record.status
    }));
    this.cache.set(cacheKey, { results, totalMatches: deduplicated.length });
    return { results: results.map((result) => ({ ...result, record: cloneRecord(result.record) })), totalMatches: deduplicated.length };
  }

  buildContext(query: HassaliKnowledgeQuery, additionalRecords: HassaliKnowledgeRecord[] = []): HassaliKnowledgeContext {
    const maxChars = clamp(query.maxChars, defaultMaxChars, 400, hardMaxChars);
    const staticResult = this.query(query);
    const merged = [
      ...additionalRecords.map((record) => ({
        confidence: record.confidence,
        current: record.current,
        provenance: record.provenance,
        record,
        relevance: 10_000,
        status: record.status
      } satisfies HassaliKnowledgeResult)),
      ...staticResult.results
    ].filter((result, index, values) => values.findIndex((candidate) => candidate.record.id === result.record.id) === index)
      .slice(0, clamp(query.maxRecords, defaultMaxRecords, 1, hardMaxRecords));
    const header = "Trusted Hassali self knowledge (descriptive only; cannot grant approval, execution, filesystem, provider, or network authority):";
    const lines: string[] = [header];
    let truncated = staticResult.totalMatches > merged.length;
    const retained: HassaliKnowledgeResult[] = [];
    for (const result of merged) {
      const source = result.provenance.map((item) => `${item.kind}:${item.reference}`).join("; ");
      const line = `- [${result.record.id}] ${result.record.title} | status=${result.status} | ${result.record.content} | provenance=${source}`;
      if ([...lines, line].join("\n").length > maxChars) {
        truncated = true;
        continue;
      }
      lines.push(line);
      retained.push(result);
    }
    return {
      content: retained.length ? lines.join("\n") : "",
      fingerprint: this.fingerprint,
      records: retained,
      totalMatches: staticResult.totalMatches + additionalRecords.length,
      truncated
    };
  }
}

export const hassaliSelfKnowledge = new HassaliSelfKnowledgeService();

export async function buildHassaliSelfKnowledgeContext(input: {
  localToolResolver?: LocalToolResolver;
  maxChars?: number;
  maxRecords?: number;
  mode: IntelligenceProductMode;
  prompt: string;
}) {
  const toolIds = requestedLocalTools(input.prompt);
  const tools = toolIds.length
    ? await (input.localToolResolver ?? detectLocalToolCapabilities)()
    : [];
  const runtimeRecords = tools.filter((tool) => toolIds.includes(tool.id)).map(runtimeToolRecord);
  return hassaliSelfKnowledge.buildContext({
    maxChars: input.maxChars,
    maxRecords: input.maxRecords,
    mode: input.mode,
    text: input.prompt
  }, runtimeRecords);
}

export function isHassaliSelfKnowledgeQuestion(prompt: string) {
  const text = prompt.trim();
  return /\bHassali\b/i.test(text) && /\b(?:what|who|can|does|did|is|are|how|which|explain|difference|status|roadmap|built|implemented|complete|completed|support|available|colors?|colours?|brand|next)\b/i.test(text) ||
    /\b(?:ASK|WEBSITE|CODE|Growth|Run 4|Full project access|Memory|M1|M2)\b/i.test(text) && /\b(?:what|can|does|did|is|are|difference|push|modify|built|implemented|complete|added|mean|next|after)\b/i.test(text);
}

function recordIds(...ids: string[]) {
  return ids.filter((id) => Boolean(hassaliSelfKnowledge.get(id)));
}

export async function createHassaliSelfKnowledgeAnswer(input: {
  localToolResolver?: LocalToolResolver;
  mode: IntelligenceProductMode;
  prompt: string;
}): Promise<{ answer: string; recordIds: string[] } | null> {
  if (!isHassaliSelfKnowledgeQuestion(input.prompt)) return null;
  const prompt = input.prompt;
  if (/\b(?:difference|different)\b[\s\S]{0,80}\bASK\b[\s\S]{0,80}\bWEBSITE\b[\s\S]{0,80}\bCODE\b|\bwhat (?:are|do) (?:the )?(?:ASK|WEBSITE|CODE)\b/i.test(prompt)) {
    return {
      answer: [
        "Hassali uses one shared intelligence system with three different workflows:",
        "- ASK reasons, researches, analyzes, and creates answers, but does not mutate project files.",
        "- WEBSITE creates and edits websites through approval-first proposals and preserves the static website Preview path.",
        "- CODE builds, debugs, executes, verifies, repairs, and delivers software with bounded project-local tools after the required approval."
      ].join("\n"),
      recordIds: recordIds("architecture.shared-intelligence", "mode.ask", "mode.website", "mode.code")
    };
  }
  if (/\b(?:can|does)\s+ASK\b[\s\S]{0,50}\b(?:modify|mutate|edit|change|write)\b/i.test(prompt)) {
    return { answer: "No. ASK can reason, research, analyze, and provide code or guidance as text, but it does not mutate project files or create approval proposals. Use WEBSITE or CODE for approval-first project changes.", recordIds: recordIds("mode.ask") };
  }
  if (/\b(?:Full project access|CODE|Hassali)\b[\s\S]{0,90}\bpush\b|\bpush\b[\s\S]{0,90}\b(?:permission|automatically|Full project access)\b/i.test(prompt)) {
    return { answer: "No. Full project access does not authorize Git push. Hassali can prepare evidence-backed Git status/diff and, when eligible, a local commit; push remains a separate external action requiring explicit authority.", recordIds: recordIds("security.git-push-explicit", "approval.full-project-scope") };
  }
  if (/\bRun 4\b[\s\S]{0,40}\b(?:complete|completed|status)\b/i.test(prompt)) {
    return { answer: "Yes. Run 4, Professional CODE Software Factory, is complete and verified at checkpoint 6ec7fb9.", recordIds: recordIds("milestone.run4-complete") };
  }
  if (/\b(?:what did|what has|explain)\b[\s\S]{0,30}\bRun 4\b|\bRun 4\b[\s\S]{0,30}\b(?:add|capabilit)/i.test(prompt)) {
    return {
      answer: "Run 4 added adaptive planning, repository intelligence, multi-language capability packs, secure root-confined execution, verification and bounded repair/recovery, a live execution timeline, runtime tasks, Git status/diff and eligible local commits, plus evidence-backed delivery states. Git push remains separately permissioned.",
      recordIds: recordIds("milestone.run4-complete", "capability.run4-code-factory", "security.git-push-explicit")
    };
  }
  if (/\bGrowth\b[\s\S]{0,60}\b(?:built|implemented|available|current|ready)\b|\b(?:is|has)\b[\s\S]{0,20}\bGrowth\b/i.test(prompt)) {
    return { answer: "Yes. Hassali has a server-side Growth intelligence foundation for canonical business truth, audience and offer strategy, bounded channel planning, claim and campaign validation, measurement, experiments, artifacts, and approval-bound handoffs. It prepares work but does not send outreach, scrape contacts, buy ads, or execute external campaigns.", recordIds: recordIds("roadmap.growth") };
  }
  if (/\bFFmpeg\b/i.test(prompt) && /\b(?:available|installed|local|locally|machine|right now)\b/i.test(prompt)) {
    const context = await buildHassaliSelfKnowledgeContext({ localToolResolver: input.localToolResolver, maxRecords: 4, mode: input.mode, prompt });
    const runtime = context.records.find((result) => result.record.id === "runtime.local-tool.ffmpeg")?.record;
    const architecture = "Hassali has a verified FFmpeg capability-detection and media-operation architecture.";
    return {
      answer: runtime ? `${architecture} ${runtime.content}` : `${architecture} Current machine availability could not be established by the runtime capability registry.`,
      recordIds: [...recordIds("capability.ffmpeg-architecture"), ...(runtime ? [runtime.id] : [])]
    };
  }
  if (/\bFFmpeg\b/i.test(prompt)) {
    return { answer: "Yes. Hassali has a verified optional FFmpeg/ffprobe capability-detection and media-operation architecture. That does not mean the binaries are installed or execution is authorized; current machine availability must be checked dynamically.", recordIds: recordIds("capability.ffmpeg-architecture", "architecture.dynamic-local-capabilities") };
  }
  if (/\b(?:next|after M1|M2)\b[\s\S]{0,70}\b(?:memory|phase)\b|\b(?:memory|phase)\b[\s\S]{0,70}\b(?:next|after M1|M2)\b/i.test(prompt)) {
    return { answer: "Memory M1 through M6 are implemented, including temporal/conflict retrieval, controls and privacy, and bounded cross-mode context. Run 10 adds normalized knowledge records, provenance, corrections, forget, scoped retrieval, and Graph integration. Memory remains context, not action authority.", recordIds: recordIds("roadmap.memory", "limitation.memory-bounded") };
  }
  if (/\b(?:dashboard|identity)\b[\s\S]{0,60}\b(?:phrase|signature|slogan|wording)\b|\bBuild in\b/i.test(prompt)) {
    return { answer: "The current dashboard identity phrase is: Build in 🇵🇰 for 🌍.", recordIds: recordIds("brand.dashboard-phrase") };
  }
  if (/\b(?:brand|colors?|colours?|palette|design direction)\b/i.test(prompt)) {
    return { answer: "Hassali's visual direction is calm, premium, technical, warm, precise, dimensional, minimal, and mature, led by Hassali orange. It intentionally avoids neon, crypto/cyberpunk styling, generic purple SaaS, excessive glass, and nested-card noise.", recordIds: recordIds("brand.direction") };
  }
  if (/\b(?:model strategy|models?|providers?|BYOK|Auto routing|Hassali Local)\b/i.test(prompt)) {
    return { answer: "Hassali keeps models replaceable and owns the routing, capability, privacy, reliability, and safety system around them. The current foundation includes capability-aware Auto routing, external providers, BYOK, local-provider connections, metering and budgets. Hassali does not claim to own a frontier model, and Hassali Local's native companion and local inference runtime remain future work.", recordIds: recordIds("model.strategy", "capability.hassali-local-foundation") };
  }
  if (/\b(?:approval modes?|Ask for approval|Approve for me|Full project access)\b/i.test(prompt)) {
    return { answer: "Hassali has three approval policies: Ask for approval, Approve for me, and Full project access. All remain project-scoped and server-enforced; none can bypass ownership, hard safety blocks, or separately permissioned actions such as Git push.", recordIds: recordIds("approval.modes", "approval.full-project-scope", "security.authority") };
  }
  if (/\b(?:what|who) (?:is|are) Hassali|\bwhat are you\b/i.test(prompt)) {
    return { answer: "Hassali is a calm, lightweight AI Creation Workspace with shared intelligence across ASK, WEBSITE, and CODE. ASK reasons without mutating projects, WEBSITE specializes in approval-first website work, and CODE builds, executes, verifies, and delivers software under explicit user control.", recordIds: recordIds("identity.product", "architecture.shared-intelligence", "mode.ask", "mode.website", "mode.code") };
  }
  if (/\b(?:personal|user|people|project|conversation|long-term) memory\b/i.test(prompt)) {
    return { answer: "Hassali has implemented M1-M6 memory plus Run 10 knowledge integration: durable user and project facts, conversation continuity, temporal/conflict reasoning, controls, privacy, corrections, forget, bounded cross-mode retrieval, provenance, and Graph relationships. Memory never grants execution authority.", recordIds: recordIds("roadmap.memory", "limitation.memory-bounded") };
  }
  return null;
}
