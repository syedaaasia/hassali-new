import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

export type StoredIntelligenceAttempt = {
  computeSource: string;
  failureCategory: string | null;
  model: string;
  provider: string;
  sourceId: string;
  status: "failed" | "succeeded";
};

export const intelligenceUsageRecords = pgTable(
  "intelligence_usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    traceId: varchar("trace_id", { length: 191 }).notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    sourceId: varchar("source_id", { length: 80 }).notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    model: varchar("model", { length: 240 }).notNull(),
    computeSource: varchar("compute_source", { length: 40 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    attemptCount: integer("attempt_count").notNull(),
    fallbackUsed: boolean("fallback_used").notNull().default(false),
    attempts: jsonb("attempts").$type<StoredIntelligenceAttempt[]>().notNull().default([]),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    costAmountMicros: bigint("cost_amount_micros", { mode: "number" }),
    costCurrency: varchar("cost_currency", { length: 12 }),
    costSource: varchar("cost_source", { length: 24 }).notNull(),
    costScope: varchar("cost_scope", { length: 24 }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    intelligenceUsageProjectCreatedIdx: index("intelligence_usage_project_created_idx").on(table.projectId, table.createdAt),
    intelligenceUsageProviderModelIdx: index("intelligence_usage_provider_model_idx").on(table.provider, table.model),
    intelligenceUsageUserCreatedIdx: index("intelligence_usage_user_created_idx").on(table.userId, table.createdAt),
    intelligenceUsageUserTraceIdx: uniqueIndex("intelligence_usage_user_trace_idx").on(table.userId, table.traceId)
  })
);
