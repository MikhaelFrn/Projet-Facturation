import { beforeEach, describe, expect, it } from "vitest";
import { resetMockGiftCards } from "@/features/gift-cards/mock-data";
import { mockPackages, resetMockPackages } from "@/features/packages/mock-data";
import {
  AppointmentAlreadyInvoicedError,
  AppointmentNotCompletedError,
  AppointmentNotFoundError,
  CatalogItemNotFoundError,
  InvoiceItemAlreadyRedeemedError,
  InvoiceItemNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
  InvoiceNotPayableError,
  InvoiceNotRefundableError,
  InvoiceNotVoidableError,
  PaymentExceedsBalanceError,
  RefundExceedsNetPaidError,
} from "./errors";
import { GiftCardInsufficientBalanceError, GiftCardNotActiveError, GiftCardNotFoundError } from "@/features/gift-cards/errors";
import {
  PackageCustomerMismatchError,
  PackageInsufficientQuantityError,
  PackageNotActiveError,
  PackageNotFoundError,
} from "@/features/packages/errors";
import { mockInvoices, resetMockInvoices } from "./mock-data";
import {
  addInvoiceItem,
  createInvoiceFromAppointment,
  recordPayment,
  redeemGiftCard,
  redeemPackageForLine,
  refundInvoice,
  removeInvoiceItem,
  updateInvoiceItem,
  voidInvoice,
} from "./repository";
import type { InvoiceWithDetails } from "./types";

beforeEach(() => {
  resetMockInvoices();
  resetMockGiftCards();
  resetMockPackages();
});

// Synthetic fixture for a status no code path in this repository actually
// produces yet (db/schema.ts defaults new rows to 'draft', but
// createInvoiceFromAppointment — the only invoice-creation path that
// exists — always starts at 'unpaid'). Pushed directly into the mock array
// so the status-transition guards can still be verified across the FULL
// declared InvoiceStatus enum, not just the statuses reachable today.
function pushSyntheticInvoice(status: InvoiceWithDetails["status"]): InvoiceWithDetails {
  const now = new Date();
  const invoice: InvoiceWithDetails = {
    id: `synthetic-${status}-${mockInvoices.length}`,
    invoiceNumber: `INV-SYNTH-${mockInvoices.length}`,
    status,
    customerId: null,
    customerName: "Synthetic",
    appointmentId: null,
    subtotalCents: 1000,
    taxTotalCents: 0,
    tipCents: 0,
    totalCents: 1000,
    notesInternal: null,
    notesCustomer: null,
    createdAt: now,
    updatedAt: now,
    paidAt: status === "paid" ? now : null,
    voidedAt: status === "voided" ? now : null,
    items: [],
    payments: [],
    refunds: [],
  };
  mockInvoices.push(invoice);
  return invoice;
}

describe("createInvoiceFromAppointment", () => {
  it("creates an unpaid invoice pre-filled from the appointment's services", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    expect(invoice.status).toBe("unpaid");
    expect(invoice.customerName).toBe("Sophie Bergeron");
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].description).toBe("Manucure");
  });

  it("throws for an unknown appointment", async () => {
    await expect(createInvoiceFromAppointment("does-not-exist")).rejects.toBeInstanceOf(
      AppointmentNotFoundError
    );
  });

  it("throws if the appointment isn't completed yet", async () => {
    await expect(createInvoiceFromAppointment("appt-3")).rejects.toBeInstanceOf(
      AppointmentNotCompletedError
    );
  });

  it("throws if the appointment was already invoiced", async () => {
    // appt-1 backs the seeded inv-1.
    await expect(createInvoiceFromAppointment("appt-1")).rejects.toBeInstanceOf(
      AppointmentAlreadyInvoicedError
    );
  });
});

describe("addInvoiceItem / updateInvoiceItem / removeInvoiceItem", () => {
  it("adds a line, prices and taxes it, and recomputes invoice totals", async () => {
    const created = await createInvoiceFromAppointment("appt-2");
    const baseTotal = created.totalCents;

    const updated = await addInvoiceItem(created.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });

    expect(updated.items).toHaveLength(2);
    const newLine = updated.items.find((item) => item.catalogItemId === "service-massage-suedois");
    expect(newLine?.subtotalCents).toBeGreaterThan(0);
    expect(updated.totalCents).toBeGreaterThan(baseTotal);
  });

  it("throws for an unknown catalog item", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(addInvoiceItem(invoice.id, { catalogItemId: "does-not-exist", quantity: 1 })).rejects.toBeInstanceOf(
      CatalogItemNotFoundError
    );
  });

  it("updates a line's quantity and reprices it off the SAME tax snapshot", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const line = invoice.items[0];
    // Snapshotted before the call: mock mode mutates and returns the SAME
    // object reference, so reading `line.*` after the call would silently
    // see the already-updated values, not the "before" ones.
    const originalSubtotalCents = line.subtotalCents;
    const originalTaxAmountCents = line.taxAmountCents;

    const updated = await updateInvoiceItem(invoice.id, line.id, { quantity: 2 });
    const updatedLine = updated.items.find((item) => item.id === line.id)!;

    expect(updatedLine.quantity).toBe(2);
    expect(updatedLine.subtotalCents).toBe(originalSubtotalCents * 2);
    expect(updatedLine.taxAmountCents).toBe(originalTaxAmountCents * 2);
  });

  it("removes a line and recomputes totals from the remaining ones", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withExtra = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });
    const extraLine = withExtra.items.find((item) => item.catalogItemId === "service-massage-suedois")!;

    const afterRemoval = await removeInvoiceItem(invoice.id, extraLine.id);

    expect(afterRemoval.items).toHaveLength(1);
    expect(afterRemoval.totalCents).toBe(invoice.totalCents);
  });

  it("rejects line edits once the invoice is no longer editable", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents, amountTenderedCents: invoice.totalCents });

    await expect(updateInvoiceItem(invoice.id, invoice.items[0].id, { quantity: 2 })).rejects.toBeInstanceOf(
      InvoiceNotEditableError
    );
    await expect(removeInvoiceItem(invoice.id, invoice.items[0].id)).rejects.toBeInstanceOf(
      InvoiceNotEditableError
    );
  });

  it("throws for an unknown invoice or unknown line", async () => {
    await expect(updateInvoiceItem("does-not-exist", "line-1", { quantity: 1 })).rejects.toBeInstanceOf(
      InvoiceNotFoundError
    );
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(updateInvoiceItem(invoice.id, "does-not-exist", { quantity: 1 })).rejects.toBeInstanceOf(
      InvoiceItemNotFoundError
    );
  });
});

describe("recordPayment", () => {
  it("records a single full payment and flips the invoice to paid", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");

    const paid = await recordPayment(invoice.id, {
      method: "cash",
      amountCents: invoice.totalCents,
      amountTenderedCents: invoice.totalCents + 500,
    });

    expect(paid.status).toBe("paid");
    expect(paid.paidAt).not.toBeNull();
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0].changeGivenCents).toBe(500);
  });

  it("supports a split payment across two methods, going through partially_paid first", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const half = Math.floor(invoice.totalCents / 2);

    const afterFirst = await recordPayment(invoice.id, { method: "credit_card", amountCents: half });
    expect(afterFirst.status).toBe("partially_paid");

    const afterSecond = await recordPayment(invoice.id, {
      method: "debit_card",
      amountCents: invoice.totalCents - half,
    });
    expect(afterSecond.status).toBe("paid");
    expect(afterSecond.payments).toHaveLength(2);
  });

  it("rejects a payment that would overshoot the remaining balance", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");

    await expect(
      recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents + 1 })
    ).rejects.toBeInstanceOf(PaymentExceedsBalanceError);
  });

  it("rejects a payment on an invoice that can't take one", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });

    // Already fully paid — can't take a second payment.
    await expect(
      recordPayment(invoice.id, { method: "cash", amountCents: 100 })
    ).rejects.toBeInstanceOf(InvoiceNotPayableError);
  });
});

describe("voidInvoice", () => {
  it("voids a never-paid invoice", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const voided = await voidInvoice(invoice.id);
    expect(voided.status).toBe("voided");
    expect(voided.voidedAt).not.toBeNull();
  });

  it("throws for an unknown invoice", async () => {
    await expect(voidInvoice("does-not-exist")).rejects.toBeInstanceOf(InvoiceNotFoundError);
  });

  it.each(["partially_paid", "paid", "refunded", "voided"] as const)(
    "rejects voiding a '%s' invoice",
    async (status) => {
      const invoice = pushSyntheticInvoice(status);
      await expect(voidInvoice(invoice.id)).rejects.toBeInstanceOf(InvoiceNotVoidableError);
    }
  );
});

describe("refundInvoice", () => {
  it("a partial refund leaves the invoice at 'paid' (no partially_refunded state exists)", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const paid = await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });
    const half = Math.floor(invoice.totalCents / 2);

    const refunded = await refundInvoice(paid.id, { amountCents: half, reason: "test" });

    expect(refunded.status).toBe("paid");
    expect(refunded.refunds).toHaveLength(1);
    expect(refunded.refunds[0].amountCents).toBe(half);
  });

  it("refunding everything still net-paid flips the invoice to 'refunded'", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const paid = await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });

    const refunded = await refundInvoice(paid.id, { amountCents: invoice.totalCents });

    expect(refunded.status).toBe("refunded");
  });

  it("rejects refunding more than what's still net-paid while still open", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const paid = await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });
    const half = Math.floor(invoice.totalCents / 2);
    await refundInvoice(paid.id, { amountCents: half });

    await expect(
      refundInvoice(paid.id, { amountCents: invoice.totalCents - half + 1 })
    ).rejects.toBeInstanceOf(RefundExceedsNetPaidError);
  });

  it.each(["draft", "unpaid", "voided"] as const)("rejects refunding a '%s' invoice", async (status) => {
    const invoice = pushSyntheticInvoice(status);
    await expect(refundInvoice(invoice.id, { amountCents: 1 })).rejects.toBeInstanceOf(
      InvoiceNotRefundableError
    );
  });
});

describe("redeemGiftCard", () => {
  it("deducts the balance and records a completed gift_card payment", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");

    const updated = await redeemGiftCard(invoice.id, { code: "GC-2026-XYZ123", amountCents: 1000 });

    const payment = updated.payments.find((p) => p.method === "gift_card")!;
    expect(payment.amountCents).toBe(1000);
    expect(payment.reference).toBe("GC-2026-XYZ123");
  });

  it("throws for an unknown gift card code", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(redeemGiftCard(invoice.id, { code: "GC-NOPE", amountCents: 100 })).rejects.toBeInstanceOf(
      GiftCardNotFoundError
    );
  });

  it("throws for an expired gift card even though its status column is stale 'active'", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(
      redeemGiftCard(invoice.id, { code: "GC-2025-EXPIRED", amountCents: 100 })
    ).rejects.toBeInstanceOf(GiftCardNotActiveError);
  });

  it("throws for a depleted gift card", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(
      redeemGiftCard(invoice.id, { code: "GC-2026-DEPLETED", amountCents: 100 })
    ).rejects.toBeInstanceOf(GiftCardNotActiveError);
  });

  it("throws when the requested amount exceeds the card's remaining balance", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await expect(
      redeemGiftCard(invoice.id, { code: "GC-2026-XYZ123", amountCents: 999_999 })
    ).rejects.toBeInstanceOf(GiftCardInsufficientBalanceError);
  });

  it("throws when the requested amount exceeds the invoice's own remaining balance", async () => {
    // Needs an amount that's within the gift card's own balance (3500) but
    // beyond what's left to collect on the invoice — otherwise
    // GiftCardInsufficientBalanceError fires first. A partial cash payment
    // first shrinks the invoice's remaining balance below the card's own.
    const invoice = await createInvoiceFromAppointment("appt-2");
    await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents - 100 });

    await expect(redeemGiftCard(invoice.id, { code: "GC-2026-XYZ123", amountCents: 3500 })).rejects.toBeInstanceOf(
      PaymentExceedsBalanceError
    );
  });
});

describe("redeemPackageForLine", () => {
  it("zeroes the line's price/tax, decrements the package's remaining quantity, and locks the line", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2"); // customer-sophie-bergeron
    const withLine = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });
    const line = withLine.items.find((item) => item.catalogItemId === "service-massage-suedois")!;

    const redeemed = await redeemPackageForLine(invoice.id, line.id, { packageId: "package-detente" });
    const redeemedLine = redeemed.items.find((item) => item.id === line.id)!;

    expect(redeemedLine.subtotalCents).toBe(0);
    expect(redeemedLine.taxAmountCents).toBe(0);
    expect(redeemedLine.packageRedemptionId).not.toBeNull();

    // The already-redeemed line can no longer be edited or removed.
    await expect(updateInvoiceItem(invoice.id, line.id, { quantity: 2 })).rejects.toBeInstanceOf(
      InvoiceItemAlreadyRedeemedError
    );
    await expect(removeInvoiceItem(invoice.id, line.id)).rejects.toBeInstanceOf(
      InvoiceItemAlreadyRedeemedError
    );
  });

  it("flips the package to 'completed' once every one of its items is fully depleted", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withMassage = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 4, // exactly the seeded remaining quantity
    });
    const massageLine = withMassage.items.find((item) => item.catalogItemId === "service-massage-suedois")!;
    await redeemPackageForLine(invoice.id, massageLine.id, { packageId: "package-detente" });

    const withFacial = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-soins-visage",
      quantity: 2, // exactly the seeded remaining quantity
    });
    const facialLine = withFacial.items.find((item) => item.catalogItemId === "service-soins-visage")!;
    await redeemPackageForLine(invoice.id, facialLine.id, { packageId: "package-detente" });

    const pkg = mockPackages.find((p) => p.id === "package-detente")!;
    expect(pkg.status).toBe("completed");
  });

  it("rejects redeeming more quantity than the package has left", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withLine = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-soins-visage",
      quantity: 3, // only 2 remaining in the seed
    });
    const line = withLine.items.find((item) => item.catalogItemId === "service-soins-visage")!;

    await expect(
      redeemPackageForLine(invoice.id, line.id, { packageId: "package-detente" })
    ).rejects.toBeInstanceOf(PackageInsufficientQuantityError);
  });

  it("rejects a package that doesn't belong to the invoice's customer", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withLine = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });
    const line = withLine.items.find((item) => item.catalogItemId === "service-massage-suedois")!;
    withLine.customerId = "someone-else";

    await expect(
      redeemPackageForLine(invoice.id, line.id, { packageId: "package-detente" })
    ).rejects.toBeInstanceOf(PackageCustomerMismatchError);
  });

  it("rejects an unknown package", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withLine = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });
    const line = withLine.items.find((item) => item.catalogItemId === "service-massage-suedois")!;

    await expect(
      redeemPackageForLine(invoice.id, line.id, { packageId: "does-not-exist" })
    ).rejects.toBeInstanceOf(PackageNotFoundError);
  });

  it("rejects a package that has already expired even though its status column is stale 'active'", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withLine = await addInvoiceItem(invoice.id, {
      catalogItemId: "service-massage-suedois",
      quantity: 1,
    });
    const line = withLine.items.find((item) => item.catalogItemId === "service-massage-suedois")!;

    const pkg = mockPackages.find((p) => p.id === "package-detente")!;
    pkg.expiresAt = new Date("2020-01-01T00:00:00Z");

    await expect(
      redeemPackageForLine(invoice.id, line.id, { packageId: "package-detente" })
    ).rejects.toBeInstanceOf(PackageNotActiveError);
  });
});
