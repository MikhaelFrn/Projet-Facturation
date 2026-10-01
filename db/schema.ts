import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Livrable 1: data model for Invoice, Invoice_items, Payment, Tax.
// All money is stored in cents (integer) and all rates in micros of the
// decimal fraction (integer, divisor 1_000_000) — see requis doc section 7.3.
// Example: 9.975% => fraction 0.09975 => rateMicros 99750.
//
// This file is the single source of truth for the schema: run
// `npx drizzle-kit generate` after editing it to produce the SQL migration
// under drizzle/migrations, and `npx drizzle-kit push` (or apply the
// generated SQL) once a real DATABASE_URL is available.

export type InvoiceStatus =
  | "draft"
  | "unpaid"
  | "partially_paid"
  | "paid"
  | "refunded"
  | "voided";

export type InvoiceItemType = "service" | "product";

export type DiscountType = "none" | "amount" | "percent";

export type PaymentMethod =
  | "cash"
  | "credit_card"
  | "debit_card"
  | "interac"
  | "square"
  | "gift_card"
  | "package"
  | "store_credit";

export type PaymentStatus = "pending" | "completed" | "refunded" | "voided";

export type TaxAppliesTo = "services" | "products" | "both";

// Livrable 3: catalog of services/products a réceptionniste can search and
// add to an invoice (requis doc section 4.4). No other module owns this data
// (unlike Appointment — see features/appointments/types.ts), so it lives here.
export const catalogItems = pgTable(
  "catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    itemType: text("item_type").notNull().$type<InvoiceItemType>(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    taxExempt: boolean("tax_exempt").notNull().default(false), // requis doc section 5 "Exemptions"
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("catalog_items_sku_key").on(table.sku),
    index("catalog_items_name_idx").on(table.name),
    check("catalog_items_item_type_check", sql`${table.itemType} in ('service', 'product')`),
  ]
);

// 5. Tax profiles (Paramètres > Taxes)
export const taxes = pgTable(
  "taxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    rateMicros: integer("rate_micros").notNull(),
    country: text("country").notNull().default("CA"),
    region: text("region"), // null = applies to all regions of the country
    appliesTo: text("applies_to").notNull().default("both").$type<TaxAppliesTo>(),
    includedInPrice: boolean("included_in_price").notNull().default(false),
    calculationOrder: integer("calculation_order").notNull().default(1), // lets TVQ compute on the pre-TPS subtotal
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("taxes_rate_micros_check", sql`${table.rateMicros} >= 0`),
    check("taxes_applies_to_check", sql`${table.appliesTo} in ('services', 'products', 'both')`),
  ]
);

// 4.2 / 4.3 Invoice header
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull(), // e.g. INV-2026-00412
    status: text("status").notNull().default("draft").$type<InvoiceStatus>(),

    // Customer/appointment modules are out of scope for this livrable; keep a
    // loose reference plus a denormalized snapshot so the invoice still reads
    // correctly even if those rows change or don't exist yet.
    customerId: uuid("customer_id"),
    customerName: text("customer_name"),
    appointmentId: uuid("appointment_id"),

    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxTotalCents: integer("tax_total_cents").notNull().default(0),
    tipCents: integer("tip_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),

    notesInternal: text("notes_internal"),
    notesCustomer: text("notes_customer"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
  },
  (table) => [
    unique("invoices_invoice_number_key").on(table.invoiceNumber),
    // Postgres treats NULLs as distinct from each other in a unique
    // constraint, so this only blocks a *second* invoice for the same
    // appointment — invoices with no appointment (appointmentId null) are
    // unaffected. Backstops the application-level check in
    // createInvoiceFromAppointment() against a race between the read and
    // the insert.
    unique("invoices_appointment_id_key").on(table.appointmentId),
    index("invoices_status_idx").on(table.status),
    index("invoices_customer_id_idx").on(table.customerId),
    check(
      "invoices_status_check",
      sql`${table.status} in ('draft', 'unpaid', 'partially_paid', 'paid', 'refunded', 'voided')`
    ),
  ]
);

// 4.2 / 4.4 / 7.2 Invoice lines (one per service or product, prices snapshotted)
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    lineNumber: integer("line_number").notNull(),

    itemType: text("item_type").notNull().$type<InvoiceItemType>(),
    catalogItemId: uuid("catalog_item_id"), // loose reference to the future services/products catalog
    description: text("description").notNull(), // snapshot: name at time of sale

    employeeId: uuid("employee_id"),
    employeeName: text("employee_name"), // snapshot: needed for commission reports even if employee is later renamed/removed

    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(), // snapshot: price at time of sale

    discountType: text("discount_type").notNull().default("none").$type<DiscountType>(),
    discountAmountCents: integer("discount_amount_cents").notNull().default(0), // used when discountType = 'amount'
    discountPercentMicros: integer("discount_percent_micros").notNull().default(0), // used when discountType = 'percent'

    packageRedemptionId: uuid("package_redemption_id"), // set when this line was covered by a pre-sold package instead of charged (4.10)

    tipCents: integer("tip_cents").notNull().default(0), // this line's employee's share of the invoice tip (4.6)
    subtotalCents: integer("subtotal_cents").notNull(), // (quantity * unitPriceCents) - discount, before tax
    taxAmountCents: integer("tax_amount_cents").notNull().default(0), // sum of invoiceItemTaxes for this line

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("invoice_items_invoice_id_line_number_key").on(table.invoiceId, table.lineNumber),
    index("invoice_items_invoice_id_idx").on(table.invoiceId),
    check("invoice_items_item_type_check", sql`${table.itemType} in ('service', 'product')`),
    check(
      "invoice_items_discount_type_check",
      sql`${table.discountType} in ('none', 'amount', 'percent')`
    ),
    check("invoice_items_quantity_check", sql`${table.quantity} > 0`),
  ]
);

// 7.2 Per-line tax breakdown, snapshotted so later rate changes don't rewrite history
export const invoiceItemTaxes = pgTable(
  "invoice_item_taxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceItemId: uuid("invoice_item_id")
      .notNull()
      .references(() => invoiceItems.id, { onDelete: "cascade" }),
    taxId: uuid("tax_id").references(() => taxes.id), // loose reference to the profile that produced this line
    taxName: text("tax_name").notNull(), // snapshot
    taxRateMicros: integer("tax_rate_micros").notNull(), // snapshot
    // Livrable 3: snapshotted so updateInvoiceItem can reprice a line (new
    // quantity/discount) using the SAME tax rules that applied when the line
    // was added, without re-reading (and trusting) the current taxes table.
    taxIncludedInPrice: boolean("tax_included_in_price").notNull().default(false),
    calculationOrder: integer("calculation_order").notNull().default(1),
    taxAmountCents: integer("tax_amount_cents").notNull(),
  },
  (table) => [index("invoice_item_taxes_invoice_item_id_idx").on(table.invoiceItemId)]
);

// 4.7 / 4.8 Payments (one invoice can have several, i.e. split payment)
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    method: text("method").notNull().$type<PaymentMethod>(),
    status: text("status").notNull().default("completed").$type<PaymentStatus>(),

    amountCents: integer("amount_cents").notNull(),
    amountTenderedCents: integer("amount_tendered_cents"), // cash/interac: what the client handed over
    changeGivenCents: integer("change_given_cents"), // cash/interac: change returned

    reference: text("reference"), // gift card code, external transaction id, etc.

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_invoice_id_idx").on(table.invoiceId),
    check(
      "payments_method_check",
      sql`${table.method} in ('cash', 'credit_card', 'debit_card', 'interac', 'square', 'gift_card', 'package', 'store_credit')`
    ),
    check(
      "payments_status_check",
      sql`${table.status} in ('pending', 'completed', 'refunded', 'voided')`
    ),
    check("payments_amount_cents_check", sql`${table.amountCents} > 0`),
  ]
);

// 7.4 / 11: a refund is its own ledger entry against an invoice (doc:
// "Créer un Refund lié à la facture originale"), not a flag flipped on an
// existing payment — a payment row stays the historical record of what was
// collected, a refund row records what was given back, and the two are
// summed independently (see features/invoicing/repository.ts's
// refundInvoice). No "partially_refunded" status exists in the invoices
// check constraint above, so a partial refund leaves the invoice's status
// untouched; only a refund that matches everything paid so far flips it to
// 'refunded'.
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("refunds_invoice_id_idx").on(table.invoiceId),
    check("refunds_amount_cents_check", sql`${table.amountCents} > 0`),
  ]
);

// Backs generateInvoiceNumber() (features/invoicing/invoice-number.ts): one
// row per calendar year, incremented atomically via an upsert so concurrent
// checkouts never get the same number. Produces INV-{year}-{lastValue,
// zero-padded to 5 digits}, e.g. INV-2026-00412.
export const invoiceNumberCounters = pgTable("invoice_number_counters", {
  year: integer("year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
});

export type GiftCardStatus = "active" | "expired" | "depleted";

// Livrable 8 (4.9): a prepaid credit identified by a unique code, redeemed
// against an invoice's balance at checkout. Issuance isn't itself a listed
// livrable (the doc only describes redemption), so this table exists mainly
// to make redemption testable — see features/gift-cards/repository.ts.
export const giftCards = pgTable(
  "gift_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    initialValueCents: integer("initial_value_cents").notNull(),
    remainingBalanceCents: integer("remaining_balance_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
    status: text("status").notNull().default("active").$type<GiftCardStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("gift_cards_code_key").on(table.code),
    check("gift_cards_status_check", sql`${table.status} in ('active', 'expired', 'depleted')`),
    check("gift_cards_initial_value_cents_check", sql`${table.initialValueCents} > 0`),
    check("gift_cards_remaining_balance_cents_check", sql`${table.remainingBalanceCents} >= 0`),
  ]
);

export type PackageStatus = "active" | "expired" | "completed";

// Livrable 9 (4.10): a pre-sold bundle of services/products tied to one
// customer, redeemed by quantity rather than by dollar amount (unlike gift
// cards). discountPercentMicros is the doc's optional "10% off additional
// purchases" perk — stored, but NOT applied anywhere yet: that's a
// materially different feature (discounting unrelated lines) than
// redemption itself, deliberately deferred.
export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    customerId: uuid("customer_id").notNull(), // loose reference, same as invoices.customerId
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never expires
    status: text("status").notNull().default("active").$type<PackageStatus>(),
    discountPercentMicros: integer("discount_percent_micros"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("packages_customer_id_idx").on(table.customerId),
    check("packages_status_check", sql`${table.status} in ('active', 'expired', 'completed')`),
  ]
);

// One row per included service/product (doc: "6 × Massages suédois, il en
// reste 4" is exactly initialQuantity=6, remainingQuantity=4). A single
// table for both services and products, matching invoiceItems/catalogItems'
// own itemType convention rather than two near-identical tables.
export const packageItems = pgTable(
  "package_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    packageId: uuid("package_id")
      .notNull()
      .references(() => packages.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull().$type<InvoiceItemType>(),
    catalogItemId: uuid("catalog_item_id").notNull(), // loose reference, same as invoiceItems.catalogItemId
    description: text("description").notNull(), // snapshot name, e.g. "Massage suédois"
    initialQuantity: integer("initial_quantity").notNull(),
    remainingQuantity: integer("remaining_quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("package_items_package_id_idx").on(table.packageId),
    index("package_items_catalog_item_id_idx").on(table.catalogItemId),
    check("package_items_item_type_check", sql`${table.itemType} in ('service', 'product')`),
    check("package_items_initial_quantity_check", sql`${table.initialQuantity} > 0`),
    check("package_items_remaining_quantity_check", sql`${table.remainingQuantity} >= 0`),
  ]
);

export const packagesRelations = relations(packages, ({ many }) => ({
  items: many(packageItems),
}));

export const packageItemsRelations = relations(packageItems, ({ one }) => ({
  package: one(packages, {
    fields: [packageItems.packageId],
    references: [packages.id],
  }),
}));

export const taxesRelations = relations(taxes, ({ many }) => ({
  invoiceItemTaxes: many(invoiceItemTaxes),
}));

export const invoicesRelations = relations(invoices, ({ many }) => ({
  items: many(invoiceItems),
  payments: many(payments),
  refunds: many(refunds),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one, many }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  taxes: many(invoiceItemTaxes),
}));

export const invoiceItemTaxesRelations = relations(invoiceItemTaxes, ({ one }) => ({
  invoiceItem: one(invoiceItems, {
    fields: [invoiceItemTaxes.invoiceItemId],
    references: [invoiceItems.id],
  }),
  tax: one(taxes, {
    fields: [invoiceItemTaxes.taxId],
    references: [taxes.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  invoice: one(invoices, {
    fields: [refunds.invoiceId],
    references: [invoices.id],
  }),
}));