import { NextResponse } from "next/server";
import {
  GiftCardInsufficientBalanceError,
  GiftCardNotActiveError,
  GiftCardNotFoundError,
} from "@/features/gift-cards/errors";
import {
  InvoiceNotFoundError,
  InvoiceNotPayableError,
  PaymentExceedsBalanceError,
} from "@/features/invoicing/errors";
import { redeemGiftCard, type RedeemGiftCardInput } from "@/features/invoicing/repository";

// POST /api/invoices/[invoiceId]/gift-card-redemptions — 4.9: redeem a
// gift card against an invoice's remaining balance. Distinct from
// POST /payments because it needs a code and a two-sided balance check
// (invoice AND gift card) that no other payment method has.
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as { code?: unknown; amountCents?: unknown } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (typeof raw.code !== "string" || raw.code.trim() === "") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (typeof raw.amountCents !== "number" || !Number.isInteger(raw.amountCents) || raw.amountCents <= 0) {
    return NextResponse.json({ error: "amountCents must be a positive integer" }, { status: 400 });
  }

  const input: RedeemGiftCardInput = { code: raw.code, amountCents: raw.amountCents };

  try {
    const invoice = await redeemGiftCard(invoiceId, input);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError || error instanceof GiftCardNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof InvoiceNotPayableError ||
      error instanceof GiftCardNotActiveError ||
      error instanceof PaymentExceedsBalanceError ||
      error instanceof GiftCardInsufficientBalanceError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("redeemGiftCard failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
