CREATE TABLE "budget_variance_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"budget_id" uuid NOT NULL,
	"month_index" integer NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"actor_id" uuid,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_variance_months" (
	"budget_id" uuid NOT NULL,
	"month_index" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"headcount" double precision,
	"advance_tax_paid" double precision,
	"advance_tax_reason" text,
	"note" text,
	"budget_snapshot" jsonb,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_variance_months_budget_id_month_index_pk" PRIMARY KEY("budget_id","month_index")
);
--> statement-breakpoint
ALTER TABLE "budget_variance_log" ADD CONSTRAINT "budget_variance_log_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_variance_log" ADD CONSTRAINT "budget_variance_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_variance_months" ADD CONSTRAINT "budget_variance_months_budget_id_budgets_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_variance_months" ADD CONSTRAINT "budget_variance_months_submitted_by_profiles_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_variance_months" ADD CONSTRAINT "budget_variance_months_decided_by_profiles_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_variance_months" ADD CONSTRAINT "budget_variance_months_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_variance_log_budget_idx" ON "budget_variance_log" USING btree ("budget_id","month_index","created_at");