import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { aiMode, chatMessageRole } from "./enums";
import { chatSessions } from "./chat-sessions";
import { users } from "./users";

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    role: chatMessageRole("role").notNull(),
    mode: aiMode("mode").notNull().default("ASK"),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    chatMessagesCreatedAtIdx: index("chat_messages_created_at_idx").on(table.createdAt),
    chatMessagesSessionIdIdx: index("chat_messages_session_id_idx").on(table.sessionId),
    chatMessagesUserIdIdx: index("chat_messages_user_id_idx").on(table.userId)
  })
);
