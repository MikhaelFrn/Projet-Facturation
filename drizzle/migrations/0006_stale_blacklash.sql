CREATE TABLE "package_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"catalog_item_id" uuid NOT NULL,
	"description" text NOT NULL,
	"initial_quantity" integer NOT NULL,
	"remaining_quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "package_items_item_type_check" CHECK ("package_items"."item_type" in ('service', 'product')),
	CONSTRAINT "package_items_initial_quantity_check" CHECK ("package_items"."initial_quantity" > 0),
	CONSTRAINT "package_items_remaining_quantity_check" CHECK ("package_items"."remaining_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"discount_percent_micros" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packages_status_check" CHECK ("packages"."status" in ('active', 'expired', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "package_items" ADD CONSTRAINT "package_items_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "package_items_package_id_idx" ON "package_items" USING btree ("package_id");--> statement-breakpoint
CREATE INDEX "package_items_catalog_item_id_idx" ON "package_items" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "packages_customer_id_idx" ON "packages" USING btree ("customer_id");