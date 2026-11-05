CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_name_uq" ON "product_categories" USING btree ("name");--> statement-breakpoint
-- Antes de poblar la tabla, las categorías de los productos se normalizan igual que la API (trim, espacios repetidos y mayúsculas); las vacías pasan a GENERAL.
UPDATE "products" SET "category" = COALESCE(NULLIF(upper(regexp_replace(btrim("category"), '[[:space:]]+', ' ', 'g')), ''), 'GENERAL')
WHERE "category" IS DISTINCT FROM COALESCE(NULLIF(upper(regexp_replace(btrim("category"), '[[:space:]]+', ' ', 'g')), ''), 'GENERAL');--> statement-breakpoint
-- Las categorías que ya usan los productos pasan a la tabla, ordenadas por su primera aparición; GENERAL siempre existe (es la de respaldo).
INSERT INTO "product_categories" ("name", "sort_order")
SELECT "category", (row_number() OVER (ORDER BY min("created_at"), "category") - 1)::int
FROM "products" GROUP BY "category";--> statement-breakpoint
INSERT INTO "product_categories" ("name", "sort_order")
SELECT 'GENERAL', (SELECT COALESCE(max("sort_order"), -1) + 1 FROM "product_categories")
WHERE NOT EXISTS (SELECT 1 FROM "product_categories" WHERE "name" = 'GENERAL');
