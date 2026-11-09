CREATE TABLE "assist_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engagement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"sub_agent" text NOT NULL,
	"recipe_id" text NOT NULL,
	"recipe_version" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"state" text DEFAULT 'READY' NOT NULL,
	"fields_total" integer DEFAULT 0 NOT NULL,
	"fields_filled" integer DEFAULT 0 NOT NULL,
	"heals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"refusals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_calls" integer DEFAULT 0 NOT NULL,
	"ai_tokens" integer DEFAULT 0 NOT NULL,
	"srn" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_recipe_patches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" text NOT NULL,
	"recipe_version" text NOT NULL,
	"field_key" text NOT NULL,
	"proposed" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_tier" text NOT NULL,
	"run_id" uuid,
	"proposed_by" uuid,
	"status" text DEFAULT 'proposed' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assist_agent_runs" ADD CONSTRAINT "assist_agent_runs_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_agent_runs" ADD CONSTRAINT "assist_agent_runs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_recipe_patches" ADD CONSTRAINT "assist_recipe_patches_run_id_assist_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."assist_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_recipe_patches" ADD CONSTRAINT "assist_recipe_patches_proposed_by_profiles_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_recipe_patches" ADD CONSTRAINT "assist_recipe_patches_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assist_agent_runs_engagement_idx" ON "assist_agent_runs" USING btree ("engagement_id","started_at");--> statement-breakpoint
CREATE INDEX "assist_agent_runs_user_idx" ON "assist_agent_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assist_agent_runs_started_idx" ON "assist_agent_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "assist_recipe_patches_status_idx" ON "assist_recipe_patches" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "assist_recipe_patches_recipe_idx" ON "assist_recipe_patches" USING btree ("recipe_id","field_key");--> statement-breakpoint
CREATE INDEX "assist_recipe_patches_run_idx" ON "assist_recipe_patches" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "assist_recipe_patches_proposed_by_idx" ON "assist_recipe_patches" USING btree ("proposed_by");--> statement-breakpoint
CREATE INDEX "assist_recipe_patches_reviewed_by_idx" ON "assist_recipe_patches" USING btree ("reviewed_by");