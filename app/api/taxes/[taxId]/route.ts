import { NextResponse } from "next/server";
import { TaxNotFoundError } from "@/features/taxes/errors";
import { updateTax, type UpdateTaxInput } from "@/features/taxes/repository";
import type { TaxAppliesTo } from "@/features/taxes/types";

const TAX_APPLIES_TO: TaxAppliesTo[] = ["services", "products", "both"];

// PATCH /api/taxes/[taxId] — 5 "Paramètres des taxes". No DELETE: see
// features/taxes/repository.ts's updateTax comment — deactivating
// (active: false) is the only supported removal.
export async function PATCH(request: Request, context: { params: Promise<{ taxId: string }> }) {
  const { taxId } = await context.params;

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

  const input: UpdateTaxInput = {};

  if (raw?.name !== undefined) {
    if (typeof raw.name !== "string" || raw.name.trim() === "") {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    input.name = raw.name;
  }
  if (raw?.ratePercent !== undefined) {
    if (typeof raw.ratePercent !== "number" || raw.ratePercent < 0) {
      return NextResponse.json({ error: "ratePercent must be a non-negative number" }, { status: 400 });
    }
    input.ratePercent = raw.ratePercent;
  }
  if (raw?.country !== undefined) {
    if (typeof raw.country !== "string") {
      return NextResponse.json({ error: "country must be a string" }, { status: 400 });
    }
    input.country = raw.country;
  }
  if (raw?.region !== undefined) {
    if (raw.region !== null && typeof raw.region !== "string") {
      return NextResponse.json({ error: "region must be a string or null" }, { status: 400 });
    }
    input.region = raw.region as string | null;
  }
  if (raw?.appliesTo !== undefined) {
    if (!TAX_APPLIES_TO.includes(raw.appliesTo as TaxAppliesTo)) {
      return NextResponse.json({ error: "appliesTo must be 'services', 'products' or 'both'" }, { status: 400 });
    }
    input.appliesTo = raw.appliesTo as TaxAppliesTo;
  }
  if (raw?.includedInPrice !== undefined) {
    if (typeof raw.includedInPrice !== "boolean") {
      return NextResponse.json({ error: "includedInPrice must be a boolean" }, { status: 400 });
    }
    input.includedInPrice = raw.includedInPrice;
  }
  if (raw?.calculationOrder !== undefined) {
    if (typeof raw.calculationOrder !== "number" || !Number.isInteger(raw.calculationOrder)) {
      return NextResponse.json({ error: "calculationOrder must be an integer" }, { status: 400 });
    }
    input.calculationOrder = raw.calculationOrder;
  }
  if (raw?.active !== undefined) {
    if (typeof raw.active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
    }
    input.active = raw.active;
  }

  try {
    const tax = await updateTax(taxId, input);
    return NextResponse.json(tax);
  } catch (error) {
    if (error instanceof TaxNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("updateTax failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
