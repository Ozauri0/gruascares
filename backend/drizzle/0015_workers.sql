CREATE TYPE "public"."worker_type" AS ENUM('mecanico', 'gruero');--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"rut" varchar(15) NOT NULL,
	"phone" varchar(50),
	"types" "worker_type"[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workers_rut_unique" UNIQUE("rut")
);
--> statement-breakpoint
DROP INDEX "service_records_mechanic_id_idx";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "worker_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "managed_by" uuid;--> statement-breakpoint
ALTER TABLE "service_records" ADD COLUMN "worker_id" uuid;--> statement-breakpoint
ALTER TABLE "service_records" ADD COLUMN "authored_by" uuid;--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workers_is_active_idx" ON "workers" USING btree ("is_active");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_managed_by_users_id_fk" FOREIGN KEY ("managed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_authored_by_users_id_fk" FOREIGN KEY ("authored_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_records_worker_id_idx" ON "service_records" USING btree ("worker_id");
--> statement-breakpoint
-- Conserva las asignaciones actuales: cada cuenta que figuraba como mecánico a cargo (o en un informe) pasa a ser un trabajador.
INSERT INTO "workers" ("name", "rut", "phone", "types")
SELECT u."name", u."rut", u."phone",
  COALESCE(
    NULLIF(
      ARRAY(
        SELECT DISTINCT (CASE s."category" WHEN 'grua' THEN 'gruero' ELSE 'mecanico' END)::worker_type
        FROM "appointments" a JOIN "services" s ON s."id" = a."service_id"
        WHERE a."mechanic_id" = u."id"
      ),
      '{}'::worker_type[]
    ),
    CASE WHEN u."role"::text = 'grua' THEN ARRAY['gruero']::worker_type[] ELSE ARRAY['mecanico']::worker_type[] END
  )
FROM "users" u
WHERE u."id" IN (
  SELECT "mechanic_id" FROM "appointments" WHERE "mechanic_id" IS NOT NULL
  UNION
  SELECT "mechanic_id" FROM "service_records"
)
ON CONFLICT ("rut") DO NOTHING;
--> statement-breakpoint
UPDATE "appointments" a SET "worker_id" = w."id", "managed_by" = a."mechanic_id"
FROM "users" u JOIN "workers" w ON w."rut" = u."rut"
WHERE u."id" = a."mechanic_id";
--> statement-breakpoint
UPDATE "service_records" r SET "worker_id" = w."id", "authored_by" = r."mechanic_id"
FROM "users" u JOIN "workers" w ON w."rut" = u."rut"
WHERE u."id" = r."mechanic_id";
