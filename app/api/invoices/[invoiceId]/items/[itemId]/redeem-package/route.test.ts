import { beforeEach, describe, expect, it } from "vitest";
import { resetMockInvoices } from "@/features/invoicing/mock-data";
import { addInvoiceItem, createInvoiceFromAppointment } from "@/features/invoicing/repository";
import { resetMockPackages } from "@/features/packages/mock-data";
import { POST } from "./route";

beforeEach(() => {
  resetMockInvoices();
  resetMockPackages();
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(invoiceId: string, itemId: string) {
  return { params: Promise.resolve({ invoiceId, itemId }) };
}

async function makeRedeemableInvoice() {
  const invoice = await createInvoiceFromAppointment("appt-2"); // customer-sophie-bergeron
  const withLine = await addInvoiceItem(invoice.id, { catalogItemId: "service-massage-suedois", quantity: 1 });
  const line = withLine.items.find((item) => item.catalogItemId === "service-massage-suedois")!;
  return { invoiceId: invoice.id, itemId: line.id };
}

describe("POST /api/invoices/[invoiceId]/items/[itemId]/redeem-package", () => {
  it("400s on invalid JSON", async () => {
    const response = await POST(jsonRequest("not json"), params("x", "y"));
    expect(response.status).toBe(400);
  });

  it("400s when packageId is missing", async () => {
    const response = await POST(jsonRequest({}), params("x", "y"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/packageId/);
  });

  it("404s for an unknown invoice", async () => {
    const response = await POST(jsonRequest({ packageId: "package-detente" }), params("does-not-exist", "y"));
    expect(response.status).toBe(404);
  });

  it("404s for an unknown line on a real invoice", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const response = await POST(
      jsonRequest({ packageId: "package-detente" }),
      params(invoice.id, "does-not-exist")
    );
    expect(response.status).toBe(404);
  });

  it("404s for an unknown package", async () => {
    const { invoiceId, itemId } = await makeRedeemableInvoice();
    const response = await POST(jsonRequest({ packageId: "does-not-exist" }), params(invoiceId, itemId));
    expect(response.status).toBe(404);
  });

  it("422s a business-rule violation (insufficient remaining quantity)", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const withLine = await addInvoiceItem(invoice.id, { catalogItemId: "service-soins-visage", quantity: 3 });
    const line = withLine.items.find((item) => item.catalogItemId === "service-soins-visage")!;

    const response = await POST(jsonRequest({ packageId: "package-detente" }), params(invoice.id, line.id));
    expect(response.status).toBe(422);
  });

  it("200s and zeroes the line on success", async () => {
    const { invoiceId, itemId } = await makeRedeemableInvoice();

    const response = await POST(jsonRequest({ packageId: "package-detente" }), params(invoiceId, itemId));
    const body = await response.json();

    expect(response.status).toBe(200);
    const redeemedLine = body.items.find((item: { id: string }) => item.id === itemId);
    expect(redeemedLine.subtotalCents).toBe(0);
    expect(redeemedLine.packageRedemptionId).not.toBeNull();
  });

  it("422s re-redeeming an already-redeemed line", async () => {
    const { invoiceId, itemId } = await makeRedeemableInvoice();
    await POST(jsonRequest({ packageId: "package-detente" }), params(invoiceId, itemId));

    const response = await POST(jsonRequest({ packageId: "package-detente" }), params(invoiceId, itemId));
    expect(response.status).toBe(422);
  });
});
