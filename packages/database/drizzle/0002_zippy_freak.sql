CREATE TABLE "intelligence_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"routing_privacy" varchar(24) DEFAULT 'allow-cloud' NOT NULL,
	"budget_mode" varchar(16) DEFAULT 'off' NOT NULL,
	"managed_per_request_limit_micros" bigint,
	"managed_monthly_limit_micros" bigint,
	"byok_monthly_warning_limit_micros" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_source_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"endpoint_url" text,
	"default_model" varchar(240),
	"credential_ciphertext" text,
	"credential_iv" varchar(64),
	"credential_auth_tag" varchar(64),
	"credential_key_version" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"trace_id" varchar(191) NOT NULL,
	"mode" varchar(16) NOT NULL,
	"source_id" varchar(80) NOT NULL,
	"provider" varchar(80) NOT NULL,
	"model" varchar(240) NOT NULL,
	"compute_source" varchar(40) NOT NULL,
	"status" varchar(32) NOT NULL,
	"attempt_count" integer NOT NULL,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"cost_amount_micros" bigint,
	"cost_currency" varchar(12),
	"cost_source" varchar(24) NOT NULL,
	"cost_scope" varchar(24) NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intelligence_preferences" ADD CONSTRAINT "intelligence_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_source_connections" ADD CONSTRAINT "intelligence_source_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_usage_records" ADD CONSTRAINT "intelligence_usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_usage_records" ADD CONSTRAINT "intelligence_usage_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "intelligence_source_connections_source_idx" ON "intelligence_source_connections" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_source_connections_user_source_idx" ON "intelligence_source_connections" USING btree ("user_id","source_id");--> statement-breakpoint
CREATE INDEX "intelligence_usage_project_created_idx" ON "intelligence_usage_records" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "intelligence_usage_provider_model_idx" ON "intelligence_usage_records" USING btree ("provider","model");--> statement-breakpoint
CREATE INDEX "intelligence_usage_user_created_idx" ON "intelligence_usage_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_usage_user_trace_idx" ON "intelligence_usage_records" USING btree ("user_id","trace_id");