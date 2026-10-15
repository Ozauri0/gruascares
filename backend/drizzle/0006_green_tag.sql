CREATE TABLE "custom_time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"time_slot" varchar(5) NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "custom_time_slots_date_slot_uq" UNIQUE("date","time_slot")
);
--> statement-breakpoint
ALTER TABLE "custom_time_slots" ADD CONSTRAINT "custom_time_slots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "custom_time_slots_date_idx" ON "custom_time_slots" USING btree ("date");