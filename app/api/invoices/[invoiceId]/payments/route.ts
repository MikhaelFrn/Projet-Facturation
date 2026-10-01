import { NextResponse } from "next/server";
import {
  InvoiceNotFoundError,
  InvoiceNotPayableError,
  PaymentExceedsBalanceError,
} from "@/features/invoicing/errors";
import { recordPayment, type RecordPaymentInput } from "@/features/invoicing/repository";
import type { PaymentMethod } from "@/features/invoicing/types";

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "credit_card",
  "debit_card",
  "interac",
  "square",
  "gift_card",
  "package",
  "store_credit",
];

// Only these two methods involve a customer physically handing over more
// than what's owed — see requis doc 4.7 "Entrer le montant reçu -> calculer
// la monnaie à remettre".
const TENDERABLE_METHODS: PaymentMethod[] = ["cash", "interac"];

// POST /api/invoices/[invoiceId]/payments — 4.7/4.8: register one payment
// (call again with a different method for a split payment). gift_card,
// package and square are recorded as a payment of that method here; actually
// verifying a gift card balance (livrable 8), redeeming a package (livrable
// 9), or a real Square API call (out of scope per doc section 8) are
// separate concerns this route doesn't touch.
export async function POST(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    method?: unknown;
    amountCents?: unknown;
    amountTenderedCents?: unknown;
    reference?: unknown;
  } | null;

  if (!PAYMENT_METHODS.includes(raw?.method as PaymentMethod)) {
    return NextResponse.json(
      { error: `method must be one of: ${PAYMENT_METHODS.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof raw?.amountCents !== "number" || !Number.isInteger(raw.amountCents) || raw.amountCents <= 0) {
    return NextResponse.json({ error: "amountCents must be a positive integer" }, { status: 400 });
  }

  const method = raw.method as PaymentMethod;
  let amountTenderedCents: number | undefined;
  if (raw.amountTenderedCents !== undefined) {
    if (!TENDERABLE_METHODS.includes(method)) {
      return NextResponse.json(
        { error: "amountTenderedCents is only valid for cash or interac" },
        { status: 400 }
      );
    }
    if (
      typeof raw.amountTenderedCents !== "number" ||
      !Number.isInteger(raw.amountTenderedCents) ||
      raw.amountTenderedCents < raw.amountCents
    ) {
      return NextResponse.json(
        { error: "amountTenderedCents must be an integer >= amountCents" },
        { status: 400 }
      );
    }
    amountTenderedCents = raw.amountTenderedCents;
  }
  if (raw.reference !== undefined && raw.reference !== null && typeof raw.reference !== "string") {
    return NextResponse.json({ error: "reference must be a string or null" }, { status: 400 });
  }

  const input: RecordPaymentInput = {
    method,
    amountCents: raw.amountCents,
    amountTenderedCents,
    reference: raw.reference as string | null | undefined,
  };

  try {
    const invoice = await recordPayment(invoiceId, input);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvoiceNotPayableError || error instanceof PaymentExceedsBalanceError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("recordPayment failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
