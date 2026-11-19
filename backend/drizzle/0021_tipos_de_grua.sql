CREATE TABLE "crane_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "type" SET DATA TYPE varchar(60);--> statement-breakpoint
ALTER TABLE "cranes" ALTER COLUMN "type" SET DEFAULT 'Otro';--> statement-breakpoint
CREATE UNIQUE INDEX "crane_types_name_uq" ON "crane_types" USING btree (lower("name"));--> statement-breakpoint
-- Los tres tipos fijos de antes pasan a la tabla y las grúas guardan el nombre del tipo en lugar de la clave.
ALTER TABLE "cranes" DROP CONSTRAINT IF EXISTS "cranes_type_check";--> statement-breakpoint
INSERT INTO "crane_types" ("name") VALUES ('Plataforma hidráulica'), ('Camión grúa'), ('Otro');--> statement-breakpoint
UPDATE "cranes" SET "type" = CASE "type" WHEN 'plataforma' THEN 'Plataforma hidráulica' WHEN 'camion_grua' THEN 'Camión grúa' ELSE 'Otro' END;
