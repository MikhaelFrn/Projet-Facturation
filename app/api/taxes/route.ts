import { NextResponse } from "next/server";
import { createTax, listTaxes, type CreateTaxInput } from "@/features/taxes/repository";
import type { TaxAppliesTo } from "@/features/taxes/types";

const TAX_APPLIES_TO: TaxAppliesTo[] = ["services", "products", "both"];

// GET /api/taxes — every profile (active and inactive; a settings screen
// needs to see and re-enable a deactivated one). Filtering to what actually
// applies at checkout time happens in tax-calculation.ts, not here.
export async function GET() {
  const taxes = await listTaxes();
  return NextResponse.json(taxes);
}

// POST /api/taxes — 5 "Paramètres des taxes". Accepts a human ratePercent
// (9.975) rather than our internal rateMicros representation.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    name?: unknown;
    ratePercent?: unknown;
    country?: unknown;
    region?: unknown;
    appliesTo?: unknown;
    includedInPrice?: unknown;
    calculationOrder?: unknown;
    active?: unknown;
  } | null;

  if (typeof raw?.name !== "string" || raw.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof raw.ratePercent !== "number" || raw.ratePercent < 0) {
    return NextResponse.json({ error: "ratePercent must be a non-negative number" }, { status: 400 });
  }
  if (raw.country !== undefined && typeof raw.country !== "string") {
    return NextResponse.json({ error: "country must be a string" }, { status: 400 });
  }
  if (raw.region !== undefined && raw.region !== null && typeof raw.region !== "string") {
    return NextResponse.json({ error: "region must be a string or null" }, { status: 400 });
  }
  if (raw.appliesTo !== undefined && !TAX_APPLIES_TO.includes(raw.appliesTo as TaxAppliesTo)) {
    return NextResponse.json({ error: "appliesTo must be 'services', 'products' or 'both'" }, { status: 400 });
  }
  if (raw.includedInPrice !== undefined && typeof raw.includedInPrice !== "boolean") {
    return NextResponse.json({ error: "includedInPrice must be a boolean" }, { status: 400 });
  }
  if (
    raw.calculationOrder !== undefined &&
    (typeof raw.calculationOrder !== "number" || !Number.isInteger(raw.calculationOrder))
  ) {
    return NextResponse.json({ error: "calculationOrder must be an integer" }, { status: 400 });
  }
  if (raw.active !== undefined && typeof raw.active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
  }

  const input: CreateTaxInput = {
    name: raw.name,
    ratePercent: raw.ratePercent,
    country: raw.country as string | undefined,
    region: raw.region as string | null | undefined,
    appliesTo: raw.appliesTo as TaxAppliesTo | undefined,
    includedInPrice: raw.includedInPrice as boolean | undefined,
    calculationOrder: raw.calculationOrder,
    active: raw.active as boolean | undefined,
  };

  const tax = await createTax(input);
  return NextResponse.json(tax, { status: 201 });
}
