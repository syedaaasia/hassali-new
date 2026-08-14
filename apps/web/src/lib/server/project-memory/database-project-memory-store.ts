import {
  listOwnedConversationMemories,
  listOwnedConversationMessagesAfter,
  loadOwnedProjectMessageEvidence,
  loadOwnedConversationMemory,
  listOwnedProjectEpisodes,
  listOwnedProjectMemories,
  persistOwnedProjectEpisode,
  persistOwnedProjectMemory,
  searchOwnedProjectMemories,
  searchProjectsAndChatsForExternalUser,
  upsertOwnedConversationMemory
} from "@hassali/database";
import { isProjectMemoryQuery, projectMemoryEvidenceTerms } from "./project-memory";
import type { ConversationMemory, ProjectMemoryCategory, ProjectMemoryImportance, ProjectMemoryRecord, ProjectMemoryStore, ProjectMemoryStatus, ProjectSourceEvidence } from "./project-memory";

function category(value: string): ProjectMemoryCategory {
  return ["architecture", "checkpoint", "constraint", "decision", "implementation", "issue", "milestone", "next_step", "preference", "reference", "requirement", "workflow"].includes(value) ? value as ProjectMemoryCategory : "reference";
}
function importance(value: string): ProjectMemoryImportance { return ["critical", "high", "low", "normal"].includes(value) ? value as ProjectMemoryImportance : "normal"; }
function status(value: string): ProjectMemoryStatus { return ["active", "resolved", "superseded"].includes(value) ? value as ProjectMemoryStatus : "active"; }
function mapRecord(record: Awaited<ReturnType<typeof listOwnedProjectMemories>>[number]): ProjectMemoryRecord {
  return { ...record, category: category(record.category), confidence: record.confidenceBps / 10_000, importance: importance(record.importance), status: status(record.status) };
}
function mapConversation(memory: Awaited<ReturnType<typeof listOwnedConversationMemories>>[number]): ConversationMemory { return memory; }

export function createDatabaseProjectMemoryStore(externalUserId: string, projectId: string): ProjectMemoryStore {
  return {
    getConversation: async (conversationId) => {
      const memory = await loadOwnedConversationMemory({ conversationId, externalUserId, projectId });
      return memory ? mapConversation(memory) : null;
    },
    listConversations: async (limit) => (await listOwnedConversationMemories({ externalUserId, limit, projectId })).map(mapConversation),
    listEpisodes: async (limit) => (await listOwnedProjectEpisodes({ externalUserId, limit, projectId })).map((episode) => ({ checkpoint: episode.checkpoint, description: episode.description, eventType: episode.eventType, importance: importance(episode.importance), occurredAt: episode.occurredAt, outcome: episode.outcome, status: episode.status as "failed" | "partial" | "resolved" | "verified" })),
    listRecords: async (input) => (await listOwnedProjectMemories({ ...input, externalUserId, projectId })).map(mapRecord),
    listUnsummarizedMessages: (conversationId, offset, limit) => listOwnedConversationMessagesAfter({ conversationId, externalUserId, limit, offset, projectId }),
    saveConversation: (memory) => upsertOwnedConversationMemory({ ...memory, externalUserId, projectId }),
    saveEpisode: async (episode) => {
      const saved = await persistOwnedProjectEpisode({ ...episode, externalUserId, projectId });
      return { checkpoint: saved.checkpoint, description: saved.description, eventType: saved.eventType, importance: importance(saved.importance), occurredAt: saved.occurredAt, outcome: saved.outcome, status: saved.status as "failed" | "partial" | "resolved" | "verified" };
    },
    saveRecord: async (candidate, sourceMessageId, conversationId) => {
      const result = await persistOwnedProjectMemory({
        category: candidate.category, confidenceBps: Math.round(candidate.confidence * 10_000), content: candidate.content,
        conversationId, externalUserId, importance: candidate.importance, memoryType: candidate.category,
        normalizedContent: candidate.content.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(), normalizedKey: candidate.normalizedKey,
        projectId, sourceMessageId, tags: [candidate.category], title: candidate.title
      });
      return { action: result.action, record: mapRecord(result.record) };
    },
    searchAcrossProjects: async (query, limit) => (await searchOwnedProjectMemories({ externalUserId, limit, query })).map(mapRecord),
    searchOriginalMessages: async (query, crossProject, limit = 4, excludeMessageId) => {
      const terms = projectMemoryEvidenceTerms(query).sort((left, right) => right.length - left.length).slice(0, 5);
      const batches = await Promise.all((terms.length ? terms : [query]).map((term) => searchProjectsAndChatsForExternalUser(externalUserId, term)));
      const seen = new Set<string>();
      const results = batches.flat().filter((item) => item.messageId && !seen.has(item.messageId) && (seen.add(item.messageId), true));
      const matches = results.filter((item) => item.kind === "message" && item.role === "user" && item.messageId !== excludeMessageId && item.sessionId && (crossProject || item.projectId === projectId)).slice(0, 8);
      const evidence = await loadOwnedProjectMessageEvidence(externalUserId, matches.map((item) => item.messageId!));
      const order = new Map(matches.map((item, index) => [item.messageId, index]));
      const filtered = evidence.filter((item) => item.role === "user" && !isProjectMemoryQuery(item.content));
      const scored = filtered.map((item) => ({ item, score: terms.reduce((total, term) => total + (item.content.toLowerCase().includes(term) ? 1 : 0), 0) }));
      const maximum = Math.max(0, ...scored.map((entry) => entry.score));
      return scored.filter((entry) => entry.score === maximum && entry.score > 0).map((entry) => entry.item).sort((left, right) => (order.get(left.messageId) ?? 99) - (order.get(right.messageId) ?? 99)).slice(0, limit).map((item): ProjectSourceEvidence => ({
        content: item.content.slice(0, 1_200), conversationId: item.sessionId, conversationTitle: item.sessionTitle,
        createdAt: new Date(item.createdAt), messageId: item.messageId, projectId: item.projectId, projectName: item.projectName,
        role: item.role
      }));
    }
  };
}
