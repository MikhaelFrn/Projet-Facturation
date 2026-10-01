import { NextResponse } from "next/server";
import {
  InvoiceNotFoundError,
  InvoiceNotRefundableError,
  RefundExceedsNetPaidError,
} from "@/features/invoicing/errors";
import { getInvoice, refundInvoice, type RefundInvoiceInput } from "@/features/invoicing/repository";

// GET /api/invoices/[invoiceId]/refunds — lists the refund ledger for one
// invoice. Not separately requested by the doc, but needed to verify
// POST below without re-reading the whole invoice (same reasoning as the
// minimal POST /api/packages from livrable 9).
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Invoice ${invoiceId} not found` }, { status: 404 });
  }

  return NextResponse.json(invoice.refunds);
}

// POST /api/invoices/[invoiceId]/refunds — 7.4: "Facture payée, erreur
// détectée → Créer un Refund lié à la facture originale." Full or partial;
// see refundInvoice's own comment for why a partial refund doesn't change
// the invoice's status.
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as { amountCents?: unknown; reason?: unknown } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (typeof raw.amountCents !== "number" || !Number.isInteger(raw.amountCents) || raw.amountCents <= 0) {
    return NextResponse.json({ error: "amountCents must be a positive integer" }, { status: 400 });
  }
  if (raw.reason !== undefined && raw.reason !== null && typeof raw.reason !== "string") {
    return NextResponse.json({ error: "reason must be a string or null" }, { status: 400 });
  }

  const input: RefundInvoiceInput = {
    amountCents: raw.amountCents,
    reason: (raw.reason as string | null | undefined) ?? null,
  };

  try {
    const invoice = await refundInvoice(invoiceId, input);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvoiceNotRefundableError || error instanceof RefundExceedsNetPaidError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("refundInvoice failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
