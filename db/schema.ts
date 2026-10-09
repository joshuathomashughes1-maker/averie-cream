import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const productType = pgEnum("product_type", ["signature-cheesecake", "cheesecake-cup", "custom-full-cheesecake"]);
export const orderStatus = pgEnum("order_status", ["new", "confirmed", "baking", "ready", "completed", "cancelled"]);
export const rushType = pgEnum("rush_type", ["standard", "next-day", "same-day"]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  pickupDate: date("pickup_date").notNull(),
  rushType: rushType("rush_type").notNull().default("standard"),
  rushFeeCents: integer("rush_fee_cents").notNull().default(0),
  orderDetails: text("order_details").notNull().default(""),
  customerNotes: text("customer_notes").notNull().default(""),
  status: orderStatus("status").notNull().default("new"),
  cashPaid: boolean("cash_paid").notNull().default(false),
  ownerNotes: text("owner_notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("orders_pickup_date_idx").on(table.pickupDate),
  index("orders_status_created_at_idx").on(table.status, table.createdAt),
  check("orders_rush_fee_check", sql`(${table.rushType} = 'standard' AND ${table.rushFeeCents} = 0) OR (${table.rushType} = 'next-day' AND ${table.rushFeeCents} = 800) OR (${table.rushType} = 'same-day' AND ${table.rushFeeCents} = 2000)`),
]);

export const orderItems = pgTable("order_items", {
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  product: productType("product").notNull(),
  quantity: integer("quantity").notNull(),
}, (table) => [
  primaryKey({ columns: [table.orderId, table.product] }),
  check("order_items_quantity_check", sql`${table.quantity} BETWEEN 1 AND 100`),
]);
