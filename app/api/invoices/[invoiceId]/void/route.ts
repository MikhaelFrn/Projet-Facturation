import { NextResponse } from "next/server";
import { InvoiceNotFoundError, InvoiceNotVoidableError } from "@/features/invoicing/errors";
import { voidInvoice } from "@/features/invoicing/repository";

// POST /api/invoices/[invoiceId]/void — 7.4: "Facture jamais ouverte →
// Changer statut → voided." No body: a never-paid invoice has nothing to
// specify beyond which one. An invoice that has taken a real payment must
// be refunded instead (POST .../refunds), never voided.
export async function POST(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  try {
    const invoice = await voidInvoice(invoiceId);
    return NextResponse.json(invoice);
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvoiceNotVoidableError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("voidInvoice failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
