import { beforeEach, describe, expect, it } from "vitest";
import { resetMockInvoices } from "@/features/invoicing/mock-data";
import { createInvoiceFromAppointment, recordPayment } from "@/features/invoicing/repository";
import { GET, POST } from "./route";

beforeEach(() => {
  resetMockInvoices();
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/invoices/x/refunds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function params(invoiceId: string) {
  return { params: Promise.resolve({ invoiceId }) };
}

describe("GET /api/invoices/[invoiceId]/refunds", () => {
  it("404s for an unknown invoice", async () => {
    const response = await GET(new Request("http://localhost/x"), params("does-not-exist"));
    expect(response.status).toBe(404);
  });

  it("lists the refunds recorded against an invoice", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });

    const response = await POST(jsonRequest({ amountCents: 100, reason: "test" }), params(invoice.id));
    expect(response.status).toBe(201);

    const listResponse = await GET(new Request("http://localhost/x"), params(invoice.id));
    const body = await listResponse.json();

    expect(listResponse.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ amountCents: 100, reason: "test" });
  });
});

describe("POST /api/invoices/[invoiceId]/refunds", () => {
  it("400s on invalid JSON", async () => {
    const response = await POST(jsonRequest("not json"), params("whatever"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Invalid JSON/);
  });

  it("400s when amountCents is missing", async () => {
    const response = await POST(jsonRequest({}), params("whatever"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/amountCents/);
  });

  it("400s when amountCents isn't a positive integer", async () => {
    const response = await POST(jsonRequest({ amountCents: -5 }), params("whatever"));
    expect(response.status).toBe(400);
  });

  it("400s when reason is the wrong type", async () => {
    const response = await POST(jsonRequest({ amountCents: 100, reason: 42 }), params("whatever"));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/reason/);
  });

  it("404s for an unknown invoice", async () => {
    const response = await POST(jsonRequest({ amountCents: 100 }), params("does-not-exist"));
    expect(response.status).toBe(404);
  });

  it("422s a business-rule violation (refunding a never-paid invoice)", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    const response = await POST(jsonRequest({ amountCents: 100 }), params(invoice.id));
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/cannot be refunded/);
  });

  it("201s and returns the updated invoice on success", async () => {
    const invoice = await createInvoiceFromAppointment("appt-2");
    await recordPayment(invoice.id, { method: "cash", amountCents: invoice.totalCents });

    const response = await POST(jsonRequest({ amountCents: invoice.totalCents }), params(invoice.id));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("refunded");
  });
});
