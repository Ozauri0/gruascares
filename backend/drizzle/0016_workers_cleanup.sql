ALTER TABLE "appointments" DROP CONSTRAINT "appointments_mechanic_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "service_records" DROP CONSTRAINT "service_records_mechanic_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "service_records" ALTER COLUMN "worker_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN "mechanic_id";--> statement-breakpoint
ALTER TABLE "service_records" DROP COLUMN "mechanic_id";