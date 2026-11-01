CREATE TABLE "site_content_draft" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_content_draft" ADD CONSTRAINT "site_content_draft_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;