CREATE TABLE "memory_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"memory_enabled" boolean DEFAULT true NOT NULL,
	"automatic_memory_enabled" boolean DEFAULT true NOT NULL,
	"sensitive_memory_allowed" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"user_memory_enabled" boolean DEFAULT true NOT NULL,
	"project_memory_enabled" boolean DEFAULT true NOT NULL,
	"conversation_memory_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memory_preferences" ADD CONSTRAINT "memory_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;