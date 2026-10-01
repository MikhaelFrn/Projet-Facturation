import { NextResponse } from "next/server";
import {
  InvoiceItemNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
} from "@/features/invoicing/errors";
import { removeInvoiceItem, updateInvoiceItem, type UpdateInvoiceItemInput } from "@/features/invoicing/repository";
import type { DiscountType } from "@/features/invoicing/types";

const DISCOUNT_TYPES: DiscountType[] = ["none", "amount", "percent"];

function mapDomainError(error: unknown) {
  if (error instanceof InvoiceNotFoundError || error instanceof InvoiceItemNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof InvoiceNotEditableError) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  console.error("invoice item route failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// PATCH /api/invoices/[invoiceId]/items/[itemId] — 4.4 "Possibilité de
// modifier la quantité" (extended to discount — see repository.ts).
export async function PATCH(
  request: Request,
  context: { params: Promise<{ invoiceId: string; itemId: string }> }
) {
  const { invoiceId, itemId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    quantity?: unknown;
    discountType?: unknown;
    discountAmountCents?: unknown;
    discountPercentMicros?: unknown;
  } | null;

  const input: UpdateInvoiceItemInput = {};

  if (raw?.quantity !== undefined) {
    if (!Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    }
    input.quantity = raw.quantity as number;
  }
  if (raw?.discountType !== undefined) {
    if (typeof raw.discountType !== "string" || !DISCOUNT_TYPES.includes(raw.discountType as DiscountType)) {
      return NextResponse.json({ error: "discountType must be 'none', 'amount' or 'percent'" }, { status: 400 });
    }
    input.discountType = raw.discountType as DiscountType;
  }
  if (raw?.discountAmountCents !== undefined) {
    if (typeof raw.discountAmountCents !== "number" || raw.discountAmountCents < 0) {
      return NextResponse.json({ error: "discountAmountCents must be a non-negative number" }, { status: 400 });
    }
    input.discountAmountCents = raw.discountAmountCents;
  }
  if (raw?.discountPercentMicros !== undefined) {
    if (typeof raw.discountPercentMicros !== "number" || raw.discountPercentMicros < 0) {
      return NextResponse.json({ error: "discountPercentMicros must be a non-negative number" }, { status: 400 });
    }
    input.discountPercentMicros = raw.discountPercentMicros;
  }

  try {
    const invoice = await updateInvoiceItem(invoiceId, itemId, input);
    return NextResponse.json(invoice);
  } catch (error) {
    return mapDomainError(error);
  }
}

// DELETE /api/invoices/[invoiceId]/items/[itemId] — 4.4 "Possibilité de
// supprimer une ligne (tant que la facture n'est pas fermée)".
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ invoiceId: string; itemId: string }> }
) {
  const { invoiceId, itemId } = await context.params;

  try {
    const invoice = await removeInvoiceItem(invoiceId, itemId);
    return NextResponse.json(invoice);
  } catch (error) {
    return mapDomainError(error);
  }
}
