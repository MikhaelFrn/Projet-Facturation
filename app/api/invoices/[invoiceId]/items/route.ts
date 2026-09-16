import { NextResponse } from "next/server";
import { CatalogItemNotFoundError, InvoiceNotEditableError, InvoiceNotFoundError } from "@/features/invoicing/errors";
import { addInvoiceItem } from "@/features/invoicing/repository";

// POST /api/invoices/[invoiceId]/items — 4.4 "Ajout de produits à la
// facture". Thin controller: validate, delegate, map domain errors to
// status codes — same pattern as app/api/invoices/route.ts.
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    catalogItemId?: unknown;
    quantity?: unknown;
    employeeId?: unknown;
    employeeName?: unknown;
  } | null;

  if (typeof raw?.catalogItemId !== "string" || raw.catalogItemId.trim() === "") {
    return NextResponse.json({ error: "catalogItemId is required" }, { status: 400 });
  }
  if (!Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0) {
    return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
  }
  if (raw.employeeId !== undefined && raw.employeeId !== null && typeof raw.employeeId !== "string") {
    return NextResponse.json({ error: "employeeId must be a string or null" }, { status: 400 });
  }
  if (raw.employeeName !== undefined && raw.employeeName !== null && typeof raw.employeeName !== "string") {
    return NextResponse.json({ error: "employeeName must be a string or null" }, { status: 400 });
  }

  try {
    const invoice = await addInvoiceItem(invoiceId, {
      catalogItemId: raw.catalogItemId,
      quantity: raw.quantity as number,
      employeeId: (raw.employeeId as string | null | undefined) ?? null,
      employeeName: (raw.employeeName as string | null | undefined) ?? null,
    });
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError || error instanceof CatalogItemNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvoiceNotEditableError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("addInvoiceItem failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
