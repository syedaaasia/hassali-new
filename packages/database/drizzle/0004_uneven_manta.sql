CREATE TABLE "conversation_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"title" varchar(160) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"key_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"important_references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checkpoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_source_message_id" uuid,
	"last_source_message_id" uuid,
	"source_message_count" integer DEFAULT 0 NOT NULL,
	"source_fingerprint" varchar(64) NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid,
	"source_message_id" uuid,
	"event_type" varchar(40) NOT NULL,
	"description" text NOT NULL,
	"outcome" text,
	"status" varchar(24) NOT NULL,
	"importance" varchar(16) DEFAULT 'normal' NOT NULL,
	"checkpoint" varchar(180),
	"related_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_memory_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"conversation_id" uuid,
	"source_message_id" uuid,
	"previous_record_id" uuid,
	"memory_type" varchar(32) NOT NULL,
	"category" varchar(40) NOT NULL,
	"title" varchar(180) NOT NULL,
	"normalized_key" varchar(180) NOT NULL,
	"content" text NOT NULL,
	"normalized_content" text NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"importance" varchar(16) DEFAULT 'normal' NOT NULL,
	"confidence_bps" integer DEFAULT 9000 NOT NULL,
	"source_type" varchar(32) DEFAULT 'user_message' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_conversation_id_chat_sessions_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_first_source_message_id_chat_messages_id_fk" FOREIGN KEY ("first_source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_memories" ADD CONSTRAINT "conversation_memories_last_source_message_id_chat_messages_id_fk" FOREIGN KEY ("last_source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_episodes" ADD CONSTRAINT "project_episodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_episodes" ADD CONSTRAINT "project_episodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_episodes" ADD CONSTRAINT "project_episodes_conversation_id_chat_sessions_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_episodes" ADD CONSTRAINT "project_episodes_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_records" ADD CONSTRAINT "project_memory_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_records" ADD CONSTRAINT "project_memory_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_records" ADD CONSTRAINT "project_memory_records_conversation_id_chat_sessions_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_records" ADD CONSTRAINT "project_memory_records_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory_records" ADD CONSTRAINT "project_memory_records_previous_record_id_project_memory_records_id_fk" FOREIGN KEY ("previous_record_id") REFERENCES "public"."project_memory_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_memories_conversation_unique_idx" ON "conversation_memories" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_memories_owner_project_idx" ON "conversation_memories" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "conversation_memories_project_activity_idx" ON "conversation_memories" USING btree ("project_id","last_activity_at");--> statement-breakpoint
CREATE INDEX "project_episodes_owner_project_idx" ON "project_episodes" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "project_episodes_project_status_idx" ON "project_episodes" USING btree ("project_id","status","occurred_at");--> statement-breakpoint
CREATE INDEX "project_episodes_conversation_idx" ON "project_episodes" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "project_episodes_source_message_idx" ON "project_episodes" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "project_memory_owner_project_idx" ON "project_memory_records" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "project_memory_project_status_idx" ON "project_memory_records" USING btree ("project_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "project_memory_project_category_idx" ON "project_memory_records" USING btree ("project_id","category");--> statement-breakpoint
CREATE INDEX "project_memory_conversation_idx" ON "project_memory_records" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "project_memory_source_message_idx" ON "project_memory_records" USING btree ("source_message_id");