// Row types are inferred straight from db/schema.ts (the Drizzle schema),
// so there is exactly one place — the schema — that defines shape. Editing
// a column there flows through here automatically.
import type { invoiceItems, invoiceItemTaxes, invoices, payments } from "@/db/schema";

export type {
  DiscountType,
  InvoiceItemType,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  TaxAppliesTo,
} from "@/db/schema";

// Canonical definition now lives in features/taxes/types.ts (livrable 4 gave
// taxes their own feature folder, mirroring catalog).
export type { Tax } from "@/features/taxes/types";

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InvoiceItemTax = typeof invoiceItemTaxes.$inferSelect;
export type Payment = typeof payments.$inferSelect;

// Convenience shape for the checkout screen: an invoice with its lines,
// per-line tax breakdown and payments already joined together.
export interface InvoiceWithDetails extends Invoice {
  items: (InvoiceItem & { taxes: InvoiceItemTax[] })[];
  payments: Payment[];
}