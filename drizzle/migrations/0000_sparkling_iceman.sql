CREATE TABLE "invoice_item_taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_item_id" uuid NOT NULL,
	"tax_id" uuid,
	"tax_name" text NOT NULL,
	"tax_rate_micros" integer NOT NULL,
	"calculation_order" integer DEFAULT 1 NOT NULL,
	"tax_amount_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_type" text NOT NULL,
	"catalog_item_id" uuid,
	"description" text NOT NULL,
	"employee_id" uuid,
	"employee_name" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"discount_type" text DEFAULT 'none' NOT NULL,
	"discount_amount_cents" integer DEFAULT 0 NOT NULL,
	"discount_percent_micros" integer DEFAULT 0 NOT NULL,
	"package_redemption_id" uuid,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_invoice_id_line_number_key" UNIQUE("invoice_id","line_number"),
	CONSTRAINT "invoice_items_item_type_check" CHECK ("invoice_items"."item_type" in ('service', 'product')),
	CONSTRAINT "invoice_items_discount_type_check" CHECK ("invoice_items"."discount_type" in ('none', 'amount', 'percent')),
	CONSTRAINT "invoice_items_quantity_check" CHECK ("invoice_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"customer_id" uuid,
	"customer_name" text,
	"appointment_id" uuid,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_total_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"notes_internal" text,
	"notes_customer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	CONSTRAINT "invoices_invoice_number_key" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('draft', 'unpaid', 'partially_paid', 'paid', 'refunded', 'voided'))
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"amount_cents" integer NOT NULL,
	"amount_tendered_cents" integer,
	"change_given_cents" integer,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_method_check" CHECK ("payments"."method" in ('cash', 'credit_card', 'debit_card', 'interac', 'square', 'gift_card', 'package', 'store_credit')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('pending', 'completed', 'refunded', 'voided')),
	CONSTRAINT "payments_amount_cents_check" CHECK ("payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "taxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"rate_micros" integer NOT NULL,
	"country" text DEFAULT 'CA' NOT NULL,
	"region" text,
	"applies_to" text DEFAULT 'both' NOT NULL,
	"included_in_price" boolean DEFAULT false NOT NULL,
	"calculation_order" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxes_rate_micros_check" CHECK ("taxes"."rate_micros" >= 0),
	CONSTRAINT "taxes_applies_to_check" CHECK ("taxes"."applies_to" in ('services', 'products', 'both'))
);
--> statement-breakpoint
ALTER TABLE "invoice_item_taxes" ADD CONSTRAINT "invoice_item_taxes_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_item_taxes" ADD CONSTRAINT "invoice_item_taxes_tax_id_taxes_id_fk" FOREIGN KEY ("tax_id") REFERENCES "public"."taxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_item_taxes_invoice_item_id_idx" ON "invoice_item_taxes" USING btree ("invoice_item_id");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");