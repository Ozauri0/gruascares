ALTER TABLE "appointments" ADD COLUMN "cargo_type" varchar(20);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "destination" varchar(255);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cargo_details" text;
