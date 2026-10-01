import type { InvoiceWithDetails } from "./types";

// Numbers below are taken straight from the requis doc's worked examples
// (section 4.5 "Exemple de calcul (Québec)" and section 4.8 "Paiement
// fractionné") so the totals here can be checked by hand against the doc.
// Tax profiles themselves now live in features/taxes/mock-data.ts.

const now = new Date("2026-08-05T14:30:00Z");

// Facial hydratant (Nathalie, 60$) + Pédicure relaxante (Joanie, 40$)
// + Crème SPF 30 (produit, 45$), with a $10 tip prorated across the two
// services only, paid in full by credit card.
export const mockInvoicePaid: InvoiceWithDetails = {
  id: "inv-1",
  invoiceNumber: "INV-2026-00412",
  status: "paid",
  customerId: null,
  customerName: "Marie Tremblay",
  appointmentId: "appt-1",
  subtotalCents: 14500,
  taxTotalCents: 2172,
  tipCents: 1000,
  totalCents: 17672,
  notesInternal: null,
  notesCustomer: null,
  createdAt: now,
  updatedAt: now,
  paidAt: now,
  voidedAt: null,
  items: [
    {
      id: "inv-1-item-1",
      invoiceId: "inv-1",
      lineNumber: 1,
      itemType: "service",
      catalogItemId: "service-facial-hydratant",
      description: "Facial hydratant",
      employeeId: "employee-nathalie",
      employeeName: "Nathalie",
      quantity: 1,
      unitPriceCents: 6000,
      discountType: "none",
      discountAmountCents: 0,
      discountPercentMicros: 0,
      packageRedemptionId: null,
      tipCents: 600, // (60 / 100) * 10
      subtotalCents: 6000,
      taxAmountCents: 899,
      createdAt: now,
      taxes: [
        {
          id: "inv-1-item-1-tax-tps",
          invoiceItemId: "inv-1-item-1",
          taxId: "tax-tps",
          taxName: "TPS",
          taxRateMicros: 50_000,
          taxIncludedInPrice: false,
          calculationOrder: 1,
          taxAmountCents: 300,
        },
        {
          id: "inv-1-item-1-tax-tvq",
          invoiceItemId: "inv-1-item-1",
          taxId: "tax-tvq",
          taxName: "TVQ",
          taxRateMicros: 99_750,
          taxIncludedInPrice: false,
          calculationOrder: 2,
          taxAmountCents: 599,
        },
      ],
    },
    {
      id: "inv-1-item-2",
      invoiceId: "inv-1",
      lineNumber: 2,
      itemType: "service",
      catalogItemId: "service-pedicure-relaxante",
      description: "Pédicure relaxante",
      employeeId: "employee-joanie",
      employeeName: "Joanie",
      quantity: 1,
      unitPriceCents: 4000,
      discountType: "none",
      discountAmountCents: 0,
      discountPercentMicros: 0,
      packageRedemptionId: null,
      tipCents: 400, // (40 / 100) * 10
      subtotalCents: 4000,
      taxAmountCents: 599,
      createdAt: now,
      taxes: [
        {
          id: "inv-1-item-2-tax-tps",
          invoiceItemId: "inv-1-item-2",
          taxId: "tax-tps",
          taxName: "TPS",
          taxRateMicros: 50_000,
          taxIncludedInPrice: false,
          calculationOrder: 1,
          taxAmountCents: 200,
        },
        {
          id: "inv-1-item-2-tax-tvq",
          invoiceItemId: "inv-1-item-2",
          taxId: "tax-tvq",
          taxName: "TVQ",
          taxRateMicros: 99_750,
          taxIncludedInPrice: false,
          calculationOrder: 2,
          taxAmountCents: 399,
        },
      ],
    },
    {
      id: "inv-1-item-3",
      invoiceId: "inv-1",
      lineNumber: 3,
      itemType: "product",
      catalogItemId: "product-creme-spf30",
      description: "Crème hydratante SPF 30",
      employeeId: null, // retail add-on, not tied to a specific performer
      employeeName: null,
      quantity: 1,
      unitPriceCents: 4500,
      discountType: "none",
      discountAmountCents: 0,
      discountPercentMicros: 0,
      packageRedemptionId: null,
      tipCents: 0, // tip is prorated across services only
      subtotalCents: 4500,
      taxAmountCents: 674,
      createdAt: now,
      taxes: [
        {
          id: "inv-1-item-3-tax-tps",
          invoiceItemId: "inv-1-item-3",
          taxId: "tax-tps",
          taxName: "TPS",
          taxRateMicros: 50_000,
          taxIncludedInPrice: false,
          calculationOrder: 1,
          taxAmountCents: 225,
        },
        {
          id: "inv-1-item-3-tax-tvq",
          invoiceItemId: "inv-1-item-3",
          taxId: "tax-tvq",
          taxName: "TVQ",
          taxRateMicros: 99_750,
          taxIncludedInPrice: false,
          calculationOrder: 2,
          taxAmountCents: 449,
        },
      ],
    },
  ],
  payments: [
    {
      id: "inv-1-payment-1",
      invoiceId: "inv-1",
      method: "credit_card",
      status: "completed",
      amountCents: 17672,
      amountTenderedCents: null,
      changeGivenCents: null,
      reference: null,
      createdAt: now,
    },
  ],
  refunds: [],
};

// Same three lines, no tip, closed with a split payment: gift card + credit
// card — mirrors the requis doc section 4.8 example (166.72$ total).
export const mockInvoiceSplitPayment: InvoiceWithDetails = {
  ...mockInvoicePaid,
  id: "inv-2",
  invoiceNumber: "INV-2026-00413",
  tipCents: 0,
  totalCents: 16672,
  items: mockInvoicePaid.items.map((item) => ({ ...item, tipCents: 0 })),
  payments: [
    {
      id: "inv-2-payment-1",
      invoiceId: "inv-2",
      method: "gift_card",
      status: "completed",
      amountCents: 10000,
      amountTenderedCents: null,
      changeGivenCents: null,
      reference: "GC-2026-XYZ123",
      createdAt: now,
    },
    {
      id: "inv-2-payment-2",
      invoiceId: "inv-2",
      method: "credit_card",
      status: "completed",
      amountCents: 6672,
      amountTenderedCents: null,
      changeGivenCents: null,
      reference: null,
      createdAt: now,
    },
  ],
  // Explicit, separate array: without this, the `...mockInvoicePaid` spread
  // above would leave this invoice sharing mockInvoicePaid's refunds array
  // by reference (not overridden like items/payments are), so refunding one
  // invoice would silently show up against the other's balance too.
  refunds: [],
};

export const mockInvoices: InvoiceWithDetails[] = [
  mockInvoicePaid,
  mockInvoiceSplitPayment,
];

export function getMockInvoiceById(id: string): InvoiceWithDetails | undefined {
  return mockInvoices.find((invoice) => invoice.id === id);
}