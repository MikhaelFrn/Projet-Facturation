import { NextResponse } from "next/server";
import {
  InvoiceItemAlreadyRedeemedError,
  InvoiceItemNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
} from "@/features/invoicing/errors";
import { redeemPackageForLine, type RedeemPackageForLineInput } from "@/features/invoicing/repository";
import {
  PackageCustomerMismatchError,
  PackageInsufficientQuantityError,
  PackageItemNotFoundError,
  PackageNotActiveError,
  PackageNotFoundError,
} from "@/features/packages/errors";

// POST /api/invoices/[invoiceId]/items/[itemId]/redeem-package — 4.10:
// "utiliser le forfait" on an eligible line. Unlike gift-card redemption
// this takes no amount — the whole line is covered, so only the target
// package needs to be named.
export async function POST(
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

  const raw = body as { packageId?: unknown } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  if (typeof raw.packageId !== "string" || raw.packageId.trim() === "") {
    return NextResponse.json({ error: "packageId is required" }, { status: 400 });
  }

  const input: RedeemPackageForLineInput = { packageId: raw.packageId };

  try {
    const invoice = await redeemPackageForLine(invoiceId, itemId, input);
    return NextResponse.json(invoice);
  } catch (error) {
    if (
      error instanceof InvoiceNotFoundError ||
      error instanceof InvoiceItemNotFoundError ||
      error instanceof PackageNotFoundError
    ) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof InvoiceNotEditableError ||
      error instanceof InvoiceItemAlreadyRedeemedError ||
      error instanceof PackageNotActiveError ||
      error instanceof PackageCustomerMismatchError ||
      error instanceof PackageItemNotFoundError ||
      error instanceof PackageInsufficientQuantityError
    ) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("redeemPackageForLine failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
