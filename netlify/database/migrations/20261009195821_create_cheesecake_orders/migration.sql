CREATE TYPE "order_status" AS ENUM('new', 'confirmed', 'baking', 'ready', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "product_type" AS ENUM('signature-cheesecake', 'cheesecake-cup', 'custom-full-cheesecake');--> statement-breakpoint
CREATE TYPE "rush_type" AS ENUM('standard', 'next-day', 'same-day');--> statement-breakpoint
CREATE TABLE "order_items" (
	"order_id" uuid,
	"product" "product_type",
	"quantity" integer NOT NULL,
	CONSTRAINT "order_items_pkey" PRIMARY KEY("order_id","product"),
	CONSTRAINT "order_items_quantity_check" CHECK ("quantity" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text NOT NULL,
	"pickup_date" date NOT NULL,
	"rush_type" "rush_type" DEFAULT 'standard'::"rush_type" NOT NULL,
	"rush_fee_cents" integer DEFAULT 0 NOT NULL,
	"order_details" text DEFAULT '' NOT NULL,
	"customer_notes" text DEFAULT '' NOT NULL,
	"status" "order_status" DEFAULT 'new'::"order_status" NOT NULL,
	"cash_paid" boolean DEFAULT false NOT NULL,
	"owner_notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_rush_fee_check" CHECK (("rush_type" = 'standard' AND "rush_fee_cents" = 0) OR ("rush_type" = 'next-day' AND "rush_fee_cents" = 800) OR ("rush_type" = 'same-day' AND "rush_fee_cents" = 2000))
);
--> statement-breakpoint
CREATE INDEX "orders_pickup_date_idx" ON "orders" ("pickup_date");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" ("status","created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;