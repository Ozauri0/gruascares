ALTER TABLE "appointments" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "guest_name" varchar(255);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "guest_email" varchar(255);--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "guest_phone" varchar(50);--> statement-breakpoint
CREATE INDEX "appointments_guest_email_idx" ON "appointments" USING btree ("guest_email");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_chk" CHECK ("appointments"."user_id" is not null or "appointments"."guest_email" is not null);