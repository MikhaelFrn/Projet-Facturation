import { NextResponse } from "next/server";
import { calculateTaxesForLines, type CalculateTaxesLineInput } from "@/features/taxes/calculate";
import type { InvoiceItemType } from "@/features/invoicing/types";

const ITEM_TYPES: InvoiceItemType[] = ["service", "product"];

// POST /api/taxes/calculate — 4 "calculer les taxes selon le profil de
// taxe", standalone: prices a set of hypothetical lines against the current
// tax profiles without needing an invoice to attach them to (e.g. a
// checkout screen previewing tax before an add-line call actually commits).
// createInvoiceFromAppointment/addInvoiceItem (livrables 2-3) already do
// this inline; this exposes the same engine directly.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    lines?: unknown;
    country?: unknown;
    region?: unknown;
  } | null;

  if (!Array.isArray(raw?.lines) || raw.lines.length === 0) {
    return NextResponse.json({ error: "lines must be a non-empty array" }, { status: 400 });
  }
  if (raw.country !== undefined && typeof raw.country !== "string") {
    return NextResponse.json({ error: "country must be a string" }, { status: 400 });
  }
  if (raw.region !== undefined && raw.region !== null && typeof raw.region !== "string") {
    return NextResponse.json({ error: "region must be a string or null" }, { status: 400 });
  }

  const lines: CalculateTaxesLineInput[] = [];
  for (const [index, entry] of raw.lines.entries()) {
    const line = entry as { itemType?: unknown; amountCents?: unknown; taxExempt?: unknown } | null;
    if (!ITEM_TYPES.includes(line?.itemType as InvoiceItemType)) {
      return NextResponse.json(
        { error: `lines[${index}].itemType must be 'service' or 'product'` },
        { status: 400 }
      );
    }
    if (typeof line?.amountCents !== "number" || !Number.isInteger(line.amountCents) || line.amountCents < 0) {
      return NextResponse.json(
        { error: `lines[${index}].amountCents must be a non-negative integer` },
        { status: 400 }
      );
    }
    if (line.taxExempt !== undefined && typeof line.taxExempt !== "boolean") {
      return NextResponse.json({ error: `lines[${index}].taxExempt must be a boolean` }, { status: 400 });
    }
    lines.push({
      itemType: line.itemType as InvoiceItemType,
      amountCents: line.amountCents,
      taxExempt: line.taxExempt,
    });
  }

  const result = await calculateTaxesForLines(lines, {
    country: raw.country as string | undefined,
    region: raw.region as string | null | undefined,
  });
  return NextResponse.json(result);
}
