CREATE TABLE "cranes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"plate" varchar(10) NOT NULL,
	"type" varchar(20) DEFAULT 'otro' NOT NULL,
	"notes" text,
	"worker_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cranes_plate_unique" UNIQUE("plate"),
	CONSTRAINT "cranes_type_check" CHECK ("type" IN ('plataforma', 'camion_grua', 'otro'))
);
--> statement-breakpoint
ALTER TABLE "cranes" ADD CONSTRAINT "cranes_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cranes" ADD CONSTRAINT "cranes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cranes_worker_id_idx" ON "cranes" USING btree ("worker_id");
