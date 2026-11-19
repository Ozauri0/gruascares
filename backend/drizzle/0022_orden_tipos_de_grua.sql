ALTER TABLE "crane_types" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Orden inicial: alfabético, con «Otro» (el tipo de respaldo) al final.
UPDATE "crane_types" SET "sort_order" = o.n FROM (
  SELECT "id", (row_number() OVER (ORDER BY lower("name") = 'otro', "name") - 1)::int AS n FROM "crane_types"
) o WHERE o."id" = "crane_types"."id";
