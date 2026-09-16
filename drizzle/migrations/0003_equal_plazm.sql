CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"item_type" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"tax_exempt" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_items_sku_key" UNIQUE("sku"),
	CONSTRAINT "catalog_items_item_type_check" CHECK ("catalog_items"."item_type" in ('service', 'product'))
);
--> statement-breakpoint
CREATE INDEX "catalog_items_name_idx" ON "catalog_items" USING btree ("name");