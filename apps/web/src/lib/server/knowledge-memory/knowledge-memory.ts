import { createHash, randomUUID } from "node:crypto";
import type { ProjectMemoryRecord } from "@/lib/server/project-memory/project-memory";
import { containsForbiddenMemorySecret, type UserMemoryRecord } from "@/lib/server/user-memory/user-memory";
import type {
  KnowledgeQuery,
  KnowledgeRecord,
  KnowledgeRetrievalResult,
  KnowledgeWriteDecision
} from "./knowledge-types";

const ignoredWords = new Set(["a", "about", "and", "are", "can", "for", "from", "how", "i", "is", "it", "me", "my", "of", "on", "the", "this", "to", "we", "what", "with", "you"]);
const sensitivePattern = /\b(?:address|birthday|date of birth|diagnosis|medical|phone|salary|ssn|national id|passport)\b/i;
const ephemeralPattern = /\b(?:right now|for this reply|for now|temporarily|today only|do not remember|don't remember)\b/i;
const freshnessPattern = /\b(?:latest|live|today|right now|price|weather|president|ceo|version|release)\b/i;

function normalized(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function terms(value: string) {
  return [...new Set(normalized(value).split(" ")
    .filter((term) => term.length > 1 && !ignoredWords.has(term))
    .map((term) => term.length > 4 && term.endsWith("s") ? term.slice(0, -1) : term))];
}

function stableId(parts: string[]) {
  return createHash("sha256").update(parts.join(":"), "utf8").digest("hex").slice(0, 24);
}

function boundedLimit(value = 6) {
  return Math.max(1, Math.min(8, value));
}

function boundedCharacters(value = 1_800) {
  return Math.max(200, Math.min(2_400, value));
}

export function classifyKnowledgeWrite(input: {
  explicit: boolean;
  factState?: KnowledgeRecord["factState"];
  projectId?: string | null;
  text: string;
}): KnowledgeWriteDecision {
  if (containsForbiddenMemorySecret(input.text)) return { action: "do_not_store", reason: "secret" };
  if (ephemeralPattern.test(input.text)) return { action: "do_not_store", reason: "ephemeral" };
  if (sensitivePattern.test(input.text) && !input.explicit) return { action: "do_not_store", reason: "sensitive_requires_explicit" };
  if (input.factState === "inferred" || input.factState === "unknown" || input.factState === "unsupported") {
    return { action: "do_not_store", reason: "unsupported_inference" };
  }
  if (input.explicit) return { action: "store", reason: "explicit_save", scope: input.projectId ? "project" : "user" };
  if (input.projectId) return { action: "store", reason: "project_fact", scope: "project" };
  if (/\b(?:i prefer|my (?:name|role|goal)|always use|please use)\b/i.test(input.text)) {
    return { action: "store", reason: "stable_useful_fact", scope: "user" };
  }
  return { action: "do_not_store", reason: "ephemeral" };
}

export function userMemoryToKnowledgeRecord(ownerId: string, record: UserMemoryRecord): KnowledgeRecord {
  const subject = record.person?.normalizedName ?? record.normalizedKey;
  return {
    authority: { id: ownerId, kind: "user" },
    confidence: record.confidence,
    createdAt: record.createdAt,
    effectiveFrom: record.createdAt,
    expiresAt: null,
    factState: "confirmed",
    id: record.id,
    kind: record.person ? "relationship" : record.category === "preference" ? "preference" : record.category === "instruction" ? "instruction" : "personal_fact",
    ownerId,
    privacy: record.sensitivity,
    projectId: null,
    provenance: { kind: "user_statement", reference: record.sourceMessageId ?? record.id, sourceId: record.sourceMessageId },
    scope: { id: ownerId, kind: "user" },
    statement: record.person ? `${record.person.canonicalName}: ${record.value}` : `${record.key}: ${record.value}`,
    status: record.status,
    subject,
    supersedesId: null,
    tags: [...new Set([record.category, ...terms(`${record.key} ${record.person?.relationship ?? ""}`)])],
    updatedAt: record.updatedAt,
    value: record.value
  };
}

export function projectMemoryToKnowledgeRecord(ownerId: string, record: ProjectMemoryRecord): KnowledgeRecord {
  const kind = record.category === "decision"
    ? "project_decision"
    : record.category === "constraint" || record.category === "requirement"
      ? "project_constraint"
      : "project_state";
  return {
    authority: { id: record.projectId, kind: "project" },
    confidence: record.confidence,
    createdAt: record.createdAt,
    effectiveFrom: record.effectiveFrom,
    expiresAt: null,
    factState: "confirmed",
    id: record.id,
    kind,
    ownerId,
    privacy: "standard",
    projectId: record.projectId,
    provenance: { kind: "project_memory", reference: record.sourceMessageId ?? record.id, sourceId: record.sourceMessageId },
    scope: { id: record.projectId, kind: "project" },
    statement: record.content,
    status: record.status === "resolved" ? "superseded" : record.status,
    subject: record.normalizedKey,
    supersedesId: null,
    tags: [...new Set([record.category, record.importance, ...terms(record.title)])],
    updatedAt: record.updatedAt,
    value: record.content
  };
}

export function createSourceKnowledgeRecord(input: {
  chunkId?: string | null;
  factState?: KnowledgeRecord["factState"];
  ownerId: string;
  projectId?: string | null;
  section?: string | null;
  sourceId: string;
  statement: string;
  subject: string;
  tags?: string[];
}): KnowledgeRecord {
  const now = new Date();
  return {
    authority: { id: input.sourceId, kind: "source" }, confidence: 1, createdAt: now, effectiveFrom: now, expiresAt: null,
    factState: input.factState ?? "confirmed",
    id: `source:${stableId([input.ownerId, input.projectId ?? "", input.sourceId, input.chunkId ?? "", input.subject, input.statement])}`,
    kind: "source_claim", ownerId: input.ownerId, privacy: "standard", projectId: input.projectId ?? null,
    provenance: { chunkId: input.chunkId, kind: "source_document", reference: input.sourceId, section: input.section, sourceId: input.sourceId },
    scope: { id: input.sourceId, kind: "source" }, statement: input.statement, status: "active", subject: normalized(input.subject), supersedesId: null,
    tags: [...new Set(input.tags ?? terms(input.subject))], updatedAt: now, value: input.statement
  };
}

function recordKey(record: KnowledgeRecord) {
  return `${record.scope.kind}:${record.scope.id}:${normalized(record.subject)}:${normalized(record.value)}`;
}

function scoreRecord(record: KnowledgeRecord, query: KnowledgeQuery, queryTerms: string[]) {
  const recordTerms = new Set(terms(`${record.subject} ${record.statement} ${record.tags.join(" ")}`));
  const overlap = queryTerms.reduce((score, term) => score + (recordTerms.has(term) ? 3 : 0), 0);
  const exactSubject = query.subject && normalized(record.subject) === normalized(query.subject) ? 12 : 0;
  const requestedTags = (query.tags ?? []).reduce((score, tag) => score + (record.tags.some((candidate) => normalized(candidate) === normalized(tag)) ? 2 : 0), 0);
  const project = query.projectId && record.projectId === query.projectId ? 8 : record.projectId ? -20 : 0;
  const scope = record.scope.kind === "user" ? 1 : record.scope.kind === "project" ? 3 : 2;
  const authority = record.provenance.kind === "verified" || record.provenance.kind === "project_state" ? 4 : record.factState === "confirmed" ? 2 : 0;
  const graphRelationship = query.relatedRecordIds?.includes(record.id) ? 5 : 0;
  const ageDays = Math.max(0, (Date.now() - record.updatedAt.getTime()) / 86_400_000);
  const recency = Math.max(0, 2 - ageDays / 90);
  return overlap + exactSubject + requestedTags + project + scope + authority + graphRelationship + recency;
}

export function retrieveKnowledge(records: KnowledgeRecord[], query: KnowledgeQuery): KnowledgeRetrievalResult {
  const limit = boundedLimit(query.limit);
  const maxCharacters = boundedCharacters(query.maxCharacters);
  const queryTerms = terms(query.text);
  const freshnessRequired = query.freshnessRequired ?? freshnessPattern.test(query.text);
  let excluded = 0;
  const eligible = records.filter((record) => {
    const allowed = record.ownerId === query.ownerId && record.status === "active" && (!record.expiresAt || record.expiresAt > new Date());
    const privacyAllowed = query.includeSensitive === true || record.privacy === "standard";
    const projectAllowed = !record.projectId || record.projectId === query.projectId;
    const revisionAllowed = !record.provenance.revision || !query.currentRevision || record.provenance.revision === query.currentRevision;
    const freshnessAllowed = !freshnessRequired || record.kind === "verified_outcome" ||
      (record.kind === "project_state" && Boolean(query.currentRevision) && record.provenance.revision === query.currentRevision) ||
      (record.provenance.kind === "source_document" && record.factState === "confirmed" && record.expiresAt !== null && record.expiresAt > new Date());
    if (!allowed || !privacyAllowed || !projectAllowed || !revisionAllowed || !freshnessAllowed) excluded += 1;
    return allowed && privacyAllowed && projectAllowed && revisionAllowed && freshnessAllowed;
  });
  const deduped = new Map<string, KnowledgeRecord>();
  for (const record of eligible) {
    const key = recordKey(record);
    const current = deduped.get(key);
    if (!current || record.updatedAt > current.updatedAt) deduped.set(key, record);
  }
  const allRanked = [...deduped.values()]
    .map((record) => ({
      lexicalMatch: queryTerms.some((term) => terms(`${record.subject} ${record.statement} ${record.tags.join(" ")}`).includes(term)),
      record,
      score: scoreRecord(record, query, queryTerms)
    }))
    .filter((entry) => query.subject
      ? normalized(entry.record.subject) === normalized(query.subject) || entry.lexicalMatch
      : queryTerms.length > 0 && (entry.lexicalMatch || Boolean(query.relatedRecordIds?.includes(entry.record.id))))
    .sort((left, right) => right.score - left.score || right.record.updatedAt.getTime() - left.record.updatedAt.getTime());
  const ranked = allRanked.slice(0, limit);
  const selected: KnowledgeRecord[] = [];
  let context = "";
  for (const { record } of ranked) {
    const provenance = record.provenance.sourceId
      ? ` [source=${record.provenance.sourceId}${record.provenance.chunkId ? ` chunk=${record.provenance.chunkId}` : ""}${record.provenance.section ? ` section=${record.provenance.section}` : ""}]`
      : "";
    const line = `- ${record.statement}${provenance}`;
    if ((context ? context.length + 1 : 0) + line.length > maxCharacters) break;
    selected.push(record);
    context += `${context ? "\n" : ""}${line}`;
  }
  return {
    context,
    diagnostics: {
      candidates: records.length,
      conflicts: [...deduped.values()].reduce<Array<{ recordIds: string[]; subject: string }>>((conflicts, record) => {
        if (conflicts.some((conflict) => normalized(conflict.subject) === normalized(record.subject))) return conflicts;
        const matching = [...deduped.values()].filter((candidate) => normalized(candidate.subject) === normalized(record.subject));
        if (new Set(matching.map((candidate) => normalized(candidate.value))).size > 1) {
          conflicts.push({ recordIds: matching.map((candidate) => candidate.id), subject: record.subject });
        }
        return conflicts;
      }, []),
      deduplicated: eligible.length - deduped.size,
      excluded,
      returned: selected.length,
      truncated: selected.length < allRanked.length
    },
    records: selected
  };
}

export interface KnowledgeRepository {
  forget(input: { ownerId: string; projectId?: string | null; subject?: string; id?: string }): Promise<number>;
  list(input: { ownerId: string; projectId?: string | null; includeHistory?: boolean }): Promise<KnowledgeRecord[]>;
  save(record: Omit<KnowledgeRecord, "createdAt" | "id" | "status" | "supersedesId" | "updatedAt"> & { id?: string }): Promise<{ action: "created" | "deduplicated" | "updated"; record: KnowledgeRecord }>;
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly records: KnowledgeRecord[] = [];
  private version = 0;
  private readonly retrievalCache = new Map<string, { result: KnowledgeRetrievalResult; version: number }>();

  async save(input: Omit<KnowledgeRecord, "createdAt" | "id" | "status" | "supersedesId" | "updatedAt"> & { id?: string }) {
    if (containsForbiddenMemorySecret(`${input.statement} ${input.value}`)) throw new Error("MEMORY_SECRET_REJECTED");
    const current = this.records.find((record) => record.ownerId === input.ownerId && record.projectId === input.projectId && normalized(record.subject) === normalized(input.subject) && record.status === "active");
    if (current && normalized(current.value) === normalized(input.value)) return { action: "deduplicated" as const, record: current };
    const now = new Date();
    if (current) {
      current.status = "superseded";
      current.updatedAt = now;
    }
    const record: KnowledgeRecord = {
      ...input,
      createdAt: now,
      id: input.id ?? `knowledge:${randomUUID()}`,
      status: "active",
      supersedesId: current?.id ?? null,
      updatedAt: now
    };
    this.records.unshift(record);
    this.invalidate();
    return { action: current ? "updated" as const : "created" as const, record };
  }

  async forget(input: { ownerId: string; projectId?: string | null; subject?: string; id?: string }) {
    let forgotten = 0;
    for (const record of this.records) {
      const matches = record.ownerId === input.ownerId && record.status !== "deleted" &&
        (input.projectId === undefined || record.projectId === input.projectId) &&
        (!input.id || record.id === input.id) && (!input.subject || normalized(record.subject) === normalized(input.subject));
      if (matches) {
        record.status = "deleted";
        record.updatedAt = new Date();
        forgotten += 1;
      }
    }
    if (forgotten) this.invalidate();
    return forgotten;
  }

  list(input: { ownerId: string; projectId?: string | null; includeHistory?: boolean }) {
    return Promise.resolve(this.records.filter((record) => record.ownerId === input.ownerId &&
      (input.projectId === undefined || record.projectId === input.projectId) && (input.includeHistory || record.status === "active")));
  }

  async retrieve(query: KnowledgeQuery) {
    const key = JSON.stringify({ ...query, includeSensitive: Boolean(query.includeSensitive) });
    const cached = this.retrievalCache.get(key);
    if (cached?.version === this.version) return cached.result;
    const result = retrieveKnowledge(await this.list({ ownerId: query.ownerId, includeHistory: true }), query);
    this.retrievalCache.set(key, { result, version: this.version });
    return result;
  }

  private invalidate() {
    this.version += 1;
    this.retrievalCache.clear();
  }
}

export type OpenKnowledgeFormatRecord = {
  id: string;
  metadata: { factState: KnowledgeRecord["factState"]; privacy: KnowledgeRecord["privacy"]; status: KnowledgeRecord["status"] };
  provenance: KnowledgeRecord["provenance"];
  scope: KnowledgeRecord["scope"];
  subject: string;
  value: string;
};

export function toOpenKnowledgeFormat(record: KnowledgeRecord): OpenKnowledgeFormatRecord {
  return {
    id: record.id,
    metadata: { factState: record.factState, privacy: record.privacy, status: record.status },
    provenance: { ...record.provenance },
    scope: { ...record.scope },
    subject: record.subject,
    value: record.value
  };
}
