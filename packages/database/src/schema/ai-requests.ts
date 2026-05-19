import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { aiRequestStatus } from "./enums";
import { projects } from "./projects";
import { prompts } from "./prompts";
import { users } from "./users";

export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    promptId: uuid("prompt_id").references(() => prompts.id, { onDelete: "set null" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 80 }),
    model: varchar("model", { length: 160 }),
    status: aiRequestStatus("status").notNull().default("queued"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true })
  },
  (table) => ({
    aiRequestsProjectIdIdx: index("ai_requests_project_id_idx").on(table.projectId),
    aiRequestsPromptIdIdx: index("ai_requests_prompt_id_idx").on(table.promptId),
    aiRequestsStatusIdx: index("ai_requests_status_idx").on(table.status),
    aiRequestsUserIdIdx: index("ai_requests_user_id_idx").on(table.userId)
  })
);
