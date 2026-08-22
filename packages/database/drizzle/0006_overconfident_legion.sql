CREATE TABLE "github_project_connections" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"repository_owner" varchar(120) NOT NULL,
	"repository_name" varchar(180) NOT NULL,
	"default_branch" varchar(240) NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"html_url" text NOT NULL,
	"last_known_head" varchar(64),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "growth_project_states" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_notes" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"hassali_summary" text DEFAULT '' NOT NULL,
	"manual_notes" text DEFAULT '' NOT NULL,
	"use_as_context" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_project_connections" ADD CONSTRAINT "github_project_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_project_connections" ADD CONSTRAINT "github_project_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_project_states" ADD CONSTRAINT "growth_project_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_project_states" ADD CONSTRAINT "growth_project_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_notes" ADD CONSTRAINT "project_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;