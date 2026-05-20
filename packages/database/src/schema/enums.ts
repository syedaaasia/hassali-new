import { pgEnum } from "drizzle-orm/pg-core";

export const aiRequestStatus = pgEnum("ai_request_status", [
  "queued",
  "running",
  "completed",
  "failed"
]);
export const aiMode = pgEnum("ai_mode", ["ASK", "SUGGEST", "EXECUTE"]);
export const chatMessageRole = pgEnum("chat_message_role", ["user", "assistant"]);
export const fileKind = pgEnum("file_kind", ["file", "directory"]);
export const snapshotKind = pgEnum("snapshot_kind", ["manual", "system"]);
export const usageEventKind = pgEnum("usage_event_kind", ["token", "request", "storage"]);
