ALTER TABLE "users" ADD COLUMN "rut" varchar(15);
--> statement-breakpoint
DO $$
DECLARE
  r RECORD;
  seq INT := 1;
  body INT;
  tmp INT;
  s INT;
  m INT;
  mod11 INT;
  dv TEXT;
  cand TEXT;
BEGIN
  FOR r IN SELECT id FROM "users" WHERE "rut" IS NULL ORDER BY created_at, id LOOP
    LOOP
      body := 10000000 + seq;
      seq := seq + 1;
      tmp := body;
      s := 0;
      m := 2;
      WHILE tmp > 0 LOOP
        s := s + (tmp % 10) * m;
        tmp := tmp / 10;
        IF m = 7 THEN m := 2; ELSE m := m + 1; END IF;
      END LOOP;
      mod11 := 11 - (s % 11);
      IF mod11 = 11 THEN dv := '0';
      ELSIF mod11 = 10 THEN dv := 'K';
      ELSE dv := mod11::text;
      END IF;
      cand := body::text || '-' || dv;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "users" WHERE "rut" = cand);
    END LOOP;
    UPDATE "users" SET "rut" = cand WHERE id = r.id;
  END LOOP;
END $$;
--> statement-breakpoint
UPDATE "users" SET "phone" = '+56 9 0000 0000' WHERE "phone" IS NULL OR btrim("phone") = '';
--> statement-breakpoint
DELETE FROM "appointments" WHERE "user_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "rut" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_rut_unique" UNIQUE("rut");
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_owner_chk";
--> statement-breakpoint
DROP INDEX IF EXISTS "appointments_guest_email_idx";
--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "guest_name";
--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "guest_email";
--> statement-breakpoint
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "guest_phone";
--> statement-breakpoint
ALTER TABLE "appointments" ALTER COLUMN "user_id" SET NOT NULL;
