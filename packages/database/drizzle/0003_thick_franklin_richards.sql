CREATE TABLE "memory_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"canonical_name" varchar(160) NOT NULL,
	"normalized_name" varchar(160) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship" varchar(80),
	"normalized_relationship" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memory_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid,
	"previous_record_id" uuid,
	"category" varchar(32) NOT NULL,
	"key" varchar(160) NOT NULL,
	"normalized_key" varchar(160) NOT NULL,
	"value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"sensitivity" varchar(24) DEFAULT 'standard' NOT NULL,
	"confidence_bps" integer NOT NULL,
	"capture_method" varchar(24) NOT NULL,
	"source_type" varchar(24) DEFAULT 'user_message' NOT NULL,
	"source_message_id" uuid,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"forgotten_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_people" ADD CONSTRAINT "memory_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_records" ADD CONSTRAINT "user_memory_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_records" ADD CONSTRAINT "user_memory_records_person_id_memory_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."memory_people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_records" ADD CONSTRAINT "user_memory_records_previous_record_id_user_memory_records_id_fk" FOREIGN KEY ("previous_record_id") REFERENCES "public"."user_memory_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memory_records" ADD CONSTRAINT "user_memory_records_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memory_people_user_name_idx" ON "memory_people" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE INDEX "memory_people_user_relationship_idx" ON "memory_people" USING btree ("user_id","normalized_relationship");--> statement-breakpoint
CREATE INDEX "user_memory_category_idx" ON "user_memory_records" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "user_memory_person_status_idx" ON "user_memory_records" USING btree ("person_id","status");--> statement-breakpoint
CREATE INDEX "user_memory_source_message_idx" ON "user_memory_records" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "user_memory_status_updated_idx" ON "user_memory_records" USING btree ("user_id","status","updated_at");