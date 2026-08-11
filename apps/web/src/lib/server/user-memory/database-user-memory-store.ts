import {
  forgetOwnedUserMemory,
  listOwnedMemoryPeople,
  listOwnedUserMemories,
  persistOwnedUserMemory
} from "@hassali/database";
import type {
  PersonRecord,
  UserMemoryCategory,
  UserMemoryRecord,
  UserMemoryStore
} from "./user-memory";

function category(value: string): UserMemoryCategory {
  if (["fact", "goal", "instruction", "preference", "relationship", "routine", "work"].includes(value)) {
    return value as UserMemoryCategory;
  }
  return "fact";
}

function mapRecord(record: Awaited<ReturnType<typeof listOwnedUserMemories>>[number]): UserMemoryRecord {
  return {
    captureMethod: record.captureMethod === "explicit" ? "explicit" : "automatic",
    category: category(record.category),
    confidence: record.confidenceBps / 10_000,
    id: record.id,
    key: record.key,
    normalizedKey: record.normalizedKey,
    person: record.person,
    sensitivity: record.sensitivity === "sensitive" ? "sensitive" : "standard",
    sourceMessageId: record.sourceMessageId,
    sourceType: "user_message",
    updatedAt: record.updatedAt,
    value: record.value
  };
}

export function createDatabaseUserMemoryStore(externalUserId: string): UserMemoryStore {
  return {
    forget: (input) => forgetOwnedUserMemory({
      externalUserId,
      mode: input.mode,
      normalizedTarget: input.target
    }),
    list: async (limit) => (await listOwnedUserMemories(externalUserId, limit)).map(mapRecord),
    listPeople: async (limit) => (await listOwnedMemoryPeople(externalUserId, limit)) as PersonRecord[],
    save: async (candidate, sourceMessageId) => {
      const result = await persistOwnedUserMemory({
        captureMethod: candidate.captureMethod,
        category: candidate.category,
        confidenceBps: Math.round(candidate.confidence * 10_000),
        externalUserId,
        key: candidate.key,
        normalizedKey: candidate.normalizedKey,
        normalizedValue: candidate.value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
        person: candidate.person,
        sensitivity: candidate.sensitivity,
        sourceMessageId,
        value: candidate.value
      });
      return { action: result.action, record: mapRecord(result.record) };
    }
  };
}
