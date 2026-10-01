import { describe, expect, it } from "vitest";
import { aggregateInvoiceTaxes, aggregateTipByEmployee } from "./checkout-view";
import type { InvoiceWithDetails } from "./types";

// Minimal fixture builder — only the fields these pure aggregators actually
// read are filled in with real values, the rest are placeholder-valid.
function makeInvoice(items: InvoiceWithDetails["items"]): InvoiceWithDetails {
  const now = new Date();
  return {
    id: "inv-test",
    invoiceNumber: "INV-TEST-00001",
    status: "unpaid",
    customerId: null,
    customerName: null,
    appointmentId: null,
    subtotalCents: 0,
    taxTotalCents: 0,
    tipCents: 0,
    totalCents: 0,
    notesInternal: null,
    notesCustomer: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    voidedAt: null,
    items,
    payments: [],
    refunds: [],
  };
}

function makeItem(
  overrides: Partial<InvoiceWithDetails["items"][number]>
): InvoiceWithDetails["items"][number] {
  return {
    id: "item-id",
    invoiceId: "inv-test",
    lineNumber: 1,
    itemType: "service",
    catalogItemId: null,
    description: "Service",
    employeeId: null,
    employeeName: null,
    quantity: 1,
    unitPriceCents: 0,
    discountType: "none",
    discountAmountCents: 0,
    discountPercentMicros: 0,
    packageRedemptionId: null,
    tipCents: 0,
    subtotalCents: 0,
    taxAmountCents: 0,
    createdAt: new Date(),
    taxes: [],
    ...overrides,
  };
}

describe("aggregateInvoiceTaxes", () => {
  it("sums the same tax across every line into a single entry", () => {
    const invoice = makeInvoice([
      makeItem({
        id: "item-1",
        taxes: [
          {
            id: "t1",
            invoiceItemId: "item-1",
            taxId: "tax-tps",
            taxName: "TPS",
            taxRateMicros: 50_000,
            taxIncludedInPrice: false,
            calculationOrder: 1,
            taxAmountCents: 300,
          },
        ],
      }),
      makeItem({
        id: "item-2",
        taxes: [
          {
            id: "t2",
            invoiceItemId: "item-2",
            taxId: "tax-tps",
            taxName: "TPS",
            taxRateMicros: 50_000,
            taxIncludedInPrice: false,
            calculationOrder: 1,
            taxAmountCents: 200,
          },
        ],
      }),
    ]);

    expect(aggregateInvoiceTaxes(invoice)).toEqual([
      { taxName: "TPS", taxRateMicros: 50_000, amountCents: 500 },
    ]);
  });

  it("keeps distinct taxes separate", () => {
    const invoice = makeInvoice([
      makeItem({
        id: "item-1",
        taxes: [
          {
            id: "t1",
            invoiceItemId: "item-1",
            taxId: "tax-tps",
            taxName: "TPS",
            taxRateMicros: 50_000,
            taxIncludedInPrice: false,
            calculationOrder: 1,
            taxAmountCents: 300,
          },
          {
            id: "t2",
            invoiceItemId: "item-1",
            taxId: "tax-tvq",
            taxName: "TVQ",
            taxRateMicros: 99_750,
            taxIncludedInPrice: false,
            calculationOrder: 2,
            taxAmountCents: 599,
          },
        ],
      }),
    ]);

    expect(aggregateInvoiceTaxes(invoice)).toEqual([
      { taxName: "TPS", taxRateMicros: 50_000, amountCents: 300 },
      { taxName: "TVQ", taxRateMicros: 99_750, amountCents: 599 },
    ]);
  });

  it("returns an empty list for an invoice with no tax lines", () => {
    expect(aggregateInvoiceTaxes(makeInvoice([makeItem({})]))).toEqual([]);
  });
});

describe("aggregateTipByEmployee", () => {
  it("sums tip across an employee's several lines", () => {
    const invoice = makeInvoice([
      makeItem({ id: "item-1", employeeId: "nathalie", employeeName: "Nathalie", tipCents: 600 }),
      makeItem({ id: "item-2", employeeId: "nathalie", employeeName: "Nathalie", tipCents: 150 }),
      makeItem({ id: "item-3", employeeId: "joanie", employeeName: "Joanie", tipCents: 400 }),
    ]);

    expect(aggregateTipByEmployee(invoice)).toEqual([
      { employeeId: "nathalie", employeeName: "Nathalie", tipCents: 750 },
      { employeeId: "joanie", employeeName: "Joanie", tipCents: 400 },
    ]);
  });

  it("skips lines with no assigned employee (e.g. a retail add-on)", () => {
    const invoice = makeInvoice([
      makeItem({ id: "item-1", employeeId: null, employeeName: null, tipCents: 0 }),
    ]);

    expect(aggregateTipByEmployee(invoice)).toEqual([]);
  });

  it("includes an employee at 0$ if they have a line but no tip set yet", () => {
    const invoice = makeInvoice([
      makeItem({ id: "item-1", employeeId: "nathalie", employeeName: "Nathalie", tipCents: 0 }),
    ]);

    expect(aggregateTipByEmployee(invoice)).toEqual([
      { employeeId: "nathalie", employeeName: "Nathalie", tipCents: 0 },
    ]);
  });
});
