import type { OwnedMemorySnapshot } from "@hassali/database";
import { containsForbiddenMemorySecret } from "@/lib/server/user-memory/user-memory";

export function buildMemoryExport(snapshot: OwnedMemorySnapshot, exportedAt = new Date()) {
  const safeUserMemories = snapshot.userMemories.filter(
    (record) => !containsForbiddenMemorySecret(`${record.key} ${record.value}`)
  );
  const safeProjectMemories = snapshot.projectMemories.filter(
    (record) => !containsForbiddenMemorySecret(`${record.title} ${record.content}`)
  );
  return {
    exportedAt: exportedAt.toISOString(),
    exportType: "hassali-memory",
    note: "This export contains derived Hassali Memory, not complete chat, project, billing, or account data.",
    preferences: snapshot.preferences,
    aboutMe: safeUserMemories.map((record) => ({
      captureMethod: record.captureMethod,
      category: record.category,
      currentStatus: record.status,
      key: record.key,
      person: record.person
        ? {
            aliases: record.person.aliases,
            name: record.person.canonicalName,
            relationship: record.person.relationship
          }
        : null,
      savedAt: record.createdAt,
      sensitivity: record.sensitivity,
      sourceType: record.sourceType,
      updatedAt: record.updatedAt,
      value: record.value
    })),
    people: snapshot.people.map((person) => ({
      aliases: person.aliases,
      name: person.canonicalName,
      relationship: person.relationship
    })),
    projects: safeProjectMemories.map((record) => ({
      category: record.category,
      content: record.content,
      conversation: record.conversationTitle,
      createdAt: record.createdAt,
      project: record.projectName,
      sourceType: record.sourceType,
      status: record.status,
      title: record.title,
      updatedAt: record.updatedAt
    })),
    conversations: snapshot.conversations
      .filter((memory) => !containsForbiddenMemorySecret(memory.summary))
      .map((memory) => ({
        lastActivityAt: memory.lastActivityAt,
        project: memory.projectName,
        status: memory.status,
        summary: memory.summary,
        title: memory.title
      })),
    verifiedProjectHistory: snapshot.episodes
      .filter((episode) => !containsForbiddenMemorySecret(episode.description))
      .map((episode) => ({
        description: episode.description,
        occurredAt: episode.occurredAt,
        project: episode.projectName,
        status: episode.status
      }))
  };
}
