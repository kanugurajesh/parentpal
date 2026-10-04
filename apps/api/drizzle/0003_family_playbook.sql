CREATE TYPE "public"."caregiver_relation" AS ENUM('grandparent', 'parent', 'nanny', 'teacher', 'other');--> statement-breakpoint
ALTER TYPE "public"."safety_surface" ADD VALUE 'caregiver';--> statement-breakpoint
CREATE TABLE "caregivers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" "caregiver_relation" NOT NULL,
	"token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_wins" (
	"user_id" uuid NOT NULL,
	"win_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playbook_wins_user_id_win_id_pk" PRIMARY KEY("user_id","win_id")
);
--> statement-breakpoint
ALTER TABLE "moments" ADD COLUMN "caregiver_id" uuid;--> statement-breakpoint
ALTER TABLE "moments" ADD COLUMN "logged_by" text;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "caregivers" ADD CONSTRAINT "caregivers_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_wins" ADD CONSTRAINT "playbook_wins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_wins" ADD CONSTRAINT "playbook_wins_win_id_wins_id_fk" FOREIGN KEY ("win_id") REFERENCES "public"."wins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "caregivers_token_idx" ON "caregivers" USING btree ("token");--> statement-breakpoint
CREATE INDEX "caregivers_user_idx" ON "caregivers" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "moments" ADD CONSTRAINT "moments_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE set null ON UPDATE no action;