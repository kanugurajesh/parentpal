CREATE TABLE "win_tries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"win_id" text NOT NULL,
	"goal_slug" text NOT NULL,
	"outcome" "worked_outcome",
	"moment_id" uuid,
	"caregiver_id" uuid,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "win_tries" ADD CONSTRAINT "win_tries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_tries" ADD CONSTRAINT "win_tries_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_tries" ADD CONSTRAINT "win_tries_win_id_wins_id_fk" FOREIGN KEY ("win_id") REFERENCES "public"."wins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_tries" ADD CONSTRAINT "win_tries_moment_id_moments_id_fk" FOREIGN KEY ("moment_id") REFERENCES "public"."moments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "win_tries" ADD CONSTRAINT "win_tries_caregiver_id_caregivers_id_fk" FOREIGN KEY ("caregiver_id") REFERENCES "public"."caregivers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "win_tries_user_goal_idx" ON "win_tries" USING btree ("user_id","goal_slug","created_at");