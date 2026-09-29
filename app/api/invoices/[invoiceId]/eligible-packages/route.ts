import { NextResponse } from "next/server";
import { getInvoice } from "@/features/invoicing/repository";
import { findRedeemablePackageItem } from "@/features/packages/repository";

// GET /api/invoices/[invoiceId]/eligible-packages — 4.10: for each
// still-redeemable line on the invoice (not already package-covered, tied
// to a catalog item), report whether the customer has an active package
// with quantity left for that exact item. Drives the "an alert appears"
// UI behavior from the requis doc rather than making the checkout screen
// re-derive package eligibility itself.
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    return NextResponse.json({ error: `Invoice ${invoiceId} not found` }, { status: 404 });
  }

  if (!invoice.customerId) {
    return NextResponse.json({ eligibleLines: [] });
  }

  const eligibleLines = [];
  for (const item of invoice.items) {
    if (item.packageRedemptionId || !item.catalogItemId) continue;

    const match = await findRedeemablePackageItem(invoice.customerId, item.catalogItemId);
    if (match) {
      eligibleLines.push({
        itemId: item.id,
        catalogItemId: item.catalogItemId,
        description: item.description,
        quantity: item.quantity,
        packageId: match.pkg.id,
        packageName: match.pkg.name,
        remainingQuantity: match.packageItem.remainingQuantity,
      });
    }
  }

  return NextResponse.json({ eligibleLines });
}
