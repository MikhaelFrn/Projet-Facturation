import type { DiscountType, InvoiceItemType, Tax } from "./types";

const MICROS = 1_000_000;

function roundCents(value: number): number {
  return Math.round(value);
}

// Livrable 3 (4.4): quantity and discount only exist for lines added/edited
// after invoice creation — appointment-derived lines from createInvoiceFromAppointment
// are always qty 1 / no discount, which is why this wasn't needed until now.
// Pure calculator only: quantity/amount validation (e.g. quantity > 0) is the
// caller's job, enforced at the API boundary and by the DB check constraints.
export function computeLineGrossAmountCents(params: {
  quantity: number;
  unitPriceCents: number;
  discountType: DiscountType;
  discountAmountCents: number;
  discountPercentMicros: number;
}): number {
  const rawCents = params.quantity * params.unitPriceCents;

  if (params.discountType === "amount") {
    return Math.max(0, rawCents - params.discountAmountCents);
  }
  if (params.discountType === "percent") {
    const discountCents = roundCents((rawCents * params.discountPercentMicros) / MICROS);
    return Math.max(0, rawCents - discountCents);
  }
  return rawCents;
}

// Only the fields calculateLineTaxes actually reads — narrower than the full
// Tax row so it can be fed either a Tax[] (pricing a brand-new line) or a
// reconstruction from invoice_item_taxes' own snapshot columns (repricing an
// existing line in updateInvoiceItem, without re-reading the current taxes
// table — see db/schema.ts's taxIncludedInPrice comment).
export interface TaxRateInput {
  id: string | null; // null when reconstructed from a line whose tax profile reference was already cleared
  name: string;
  rateMicros: number;
  includedInPrice: boolean;
  calculationOrder: number;
}

export interface LineTaxResult {
  taxId: string | null;
  taxName: string;
  taxRateMicros: number;
  taxIncludedInPrice: boolean;
  calculationOrder: number;
  taxAmountCents: number;
}

export interface LineTaxCalculation {
  // The line amount before tax (quantity * unit price, minus discount),
  // net of any tax already baked into the given price.
  subtotalCents: number;
  taxes: LineTaxResult[];
  // Sum of the taxes above that are NOT already inside grossAmountCents —
  // i.e. what actually gets added on top for this line.
  taxAmountCents: number;
}

/**
 * Prices one invoice line against the tax profiles that apply to it.
 *
 * grossAmountCents is quantity * unitPriceCents, minus any discount — the
 * line's amount as it reads today, "included in price" taxes and all. Every
 * applicable tax is computed independently off the same tax-exclusive base;
 * none compounds on another (requis doc section 5: "la TVQ se calcule sur le
 * prix avant TPS — pas de taxe sur taxe"). calculationOrder is purely a
 * display/breakdown ordering here, not a compounding chain.
 */
export function calculateLineTaxes(
  grossAmountCents: number,
  applicableTaxes: TaxRateInput[]
): LineTaxCalculation {
  const includedTaxes = applicableTaxes.filter((tax) => tax.includedInPrice);
  const addedTaxes = applicableTaxes.filter((tax) => !tax.includedInPrice);

  // Back out any tax already baked into the given price to find the
  // tax-exclusive base every tax (included or not) is computed from.
  const includedRateMicrosSum = includedTaxes.reduce((sum, tax) => sum + tax.rateMicros, 0);
  const subtotalCents = includedRateMicrosSum
    ? roundCents((grossAmountCents * MICROS) / (MICROS + includedRateMicrosSum))
    : grossAmountCents;

  const includedIds = new Set(includedTaxes.map((tax) => tax.id));

  const taxes: LineTaxResult[] = [...includedTaxes, ...addedTaxes]
    .sort((a, b) => a.calculationOrder - b.calculationOrder)
    .map((tax) => ({
      taxId: tax.id,
      taxName: tax.name,
      taxRateMicros: tax.rateMicros,
      taxIncludedInPrice: tax.includedInPrice,
      calculationOrder: tax.calculationOrder,
      taxAmountCents: roundCents((subtotalCents * tax.rateMicros) / MICROS),
    }));

  // Only taxes not already inside grossAmountCents add to what's owed on
  // top of it.
  const taxAmountCents = taxes
    .filter((tax) => !includedIds.has(tax.taxId))
    .reduce((sum, tax) => sum + tax.taxAmountCents, 0);

  return { subtotalCents, taxes, taxAmountCents };
}

// Rebuilds calculateLineTaxes' input from a line's own invoice_item_taxes
// rows, for updateInvoiceItem: repricing after a quantity/discount change
// must use the exact tax rules that applied when the line was added, not
// whatever the taxes table says today.
export function taxRateInputsFromSnapshot(
  taxes: {
    taxId: string | null;
    taxName: string;
    taxRateMicros: number;
    taxIncludedInPrice: boolean;
    calculationOrder: number;
  }[]
): TaxRateInput[] {
  return taxes.map((tax) => ({
    id: tax.taxId,
    name: tax.taxName,
    rateMicros: tax.taxRateMicros,
    includedInPrice: tax.taxIncludedInPrice,
    calculationOrder: tax.calculationOrder,
  }));
}

/**
 * Filters a tax profile list down to the ones that apply to a given line,
 * per requis doc section 5: country/region match, service-vs-product scope,
 * and the active flag. taxExempt lets a specific service/product override
 * globally-configured taxes (doc section 5 "Exemptions").
 */
export function selectApplicableTaxes(
  taxes: Tax[],
  params: {
    itemType: InvoiceItemType;
    country: string;
    region: string | null;
    taxExempt?: boolean;
  }
): Tax[] {
  if (params.taxExempt) return [];

  return taxes.filter((tax) => {
    if (!tax.active) return false;
    if (tax.country !== params.country) return false;
    if (tax.region && tax.region !== params.region) return false;
    if (tax.appliesTo === "services" && params.itemType !== "service") return false;
    if (tax.appliesTo === "products" && params.itemType !== "product") return false;
    return true;
  });
}
