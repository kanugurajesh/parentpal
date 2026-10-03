CREATE TYPE "public"."mod_status" AS ENUM('live', 'review', 'hidden', 'removed');--> statement-breakpoint
CREATE TYPE "public"."post_kind" AS ENUM('question', 'worked', 'share');--> statement-breakpoint
CREATE TYPE "public"."reaction_kind" AS ENUM('same', 'helpful');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('post', 'reply');--> statement-breakpoint
CREATE TYPE "public"."worked_outcome" AS ENUM('helped', 'somewhat', 'didnt');--> statement-breakpoint
ALTER TYPE "public"."safety_surface" ADD VALUE 'community';--> statement-breakpoint
CREATE TABLE "community_blocks" (
	"user_id" uuid NOT NULL,
	"blocked_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_blocks_user_id_blocked_user_id_pk" PRIMARY KEY("user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "community_notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"for_date" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"guide_replied" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_slug" text NOT NULL,
	"age_band" text,
	"author_label" text NOT NULL,
	"kind" "post_kind" NOT NULL,
	"body" text NOT NULL,
	"win_id" text,
	"outcome" "worked_outcome",
	"status" "mod_status" NOT NULL,
	"mod_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety" jsonb,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reactions" (
	"user_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" "reaction_kind" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reactions_user_id_target_id_kind_pk" PRIMARY KEY("user_id","target_id","kind")
);
--> statement-breakpoint
CREATE TABLE "community_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid,
	"author_label" text,
	"is_guide" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "mod_status" NOT NULL,
	"mod_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"user_id" uuid NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "community_reports_user_id_target_id_pk" PRIMARY KEY("user_id","target_id")
);
--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_blocks" ADD CONSTRAINT "community_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notices" ADD CONSTRAINT "community_notices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_notices" ADD CONSTRAINT "community_notices_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_goal_slug_goals_slug_fk" FOREIGN KEY ("goal_slug") REFERENCES "public"."goals"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_win_id_wins_id_fk" FOREIGN KEY ("win_id") REFERENCES "public"."wins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reactions" ADD CONSTRAINT "community_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_post_id_community_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."community_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_replies" ADD CONSTRAINT "community_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "community_notices_post_day_idx" ON "community_notices" USING btree ("user_id","post_id","for_date");--> statement-breakpoint
CREATE INDEX "community_posts_feed_idx" ON "community_posts" USING btree ("goal_slug","status","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_user_idx" ON "community_posts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "community_reactions_target_idx" ON "community_reactions" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "community_replies_post_idx" ON "community_replies" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "community_replies_user_idx" ON "community_replies" USING btree ("user_id","created_at");