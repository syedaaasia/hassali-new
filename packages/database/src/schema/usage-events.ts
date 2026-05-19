import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { aiRequests } from "./ai-requests";
import { usageEventKind } from "./enums";
import { users } from "./users";

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    aiRequestId: uuid("ai_request_id").references(() => aiRequests.id, { onDelete: "set null" }),
    kind: usageEventKind("kind").notNull(),
    quantity: integer("quantity").notNull().default(0),
    unit: varchar("unit", { length: 40 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    usageEventsAiRequestIdIdx: index("usage_events_ai_request_id_idx").on(table.aiRequestId),
    usageEventsKindIdx: index("usage_events_kind_idx").on(table.kind),
    usageEventsUserIdIdx: index("usage_events_user_id_idx").on(table.userId)
  })
);
