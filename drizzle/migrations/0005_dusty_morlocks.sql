CREATE TABLE "gift_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"initial_value_cents" integer NOT NULL,
	"remaining_balance_cents" integer NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_cards_code_key" UNIQUE("code"),
	CONSTRAINT "gift_cards_status_check" CHECK ("gift_cards"."status" in ('active', 'expired', 'depleted')),
	CONSTRAINT "gift_cards_initial_value_cents_check" CHECK ("gift_cards"."initial_value_cents" > 0),
	CONSTRAINT "gift_cards_remaining_balance_cents_check" CHECK ("gift_cards"."remaining_balance_cents" >= 0)
);
