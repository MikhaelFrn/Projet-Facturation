import {
  calculateLineTaxes,
  selectApplicableTaxes,
  type LineTaxCalculation,
} from "@/features/invoicing/tax-calculation";
import type { InvoiceItemType } from "@/features/invoicing/types";
import { listTaxes } from "./repository";

// Stand-in for a business/location settings table, which doesn't exist yet.
// Every tax profile in our data (and every worked example in the requis doc)
// is Québec, so this is the only jurisdiction checkout prices against for
// now. Single source of truth — features/invoicing/repository.ts imports
// this rather than keeping its own copy.
export const DEFAULT_TAX_JURISDICTION = { country: "CA", region: "QC" } as const;

export interface CalculateTaxesLineInput {
  itemType: InvoiceItemType;
  amountCents: number;
  taxExempt?: boolean;
}

export interface CalculateTaxesLineResult extends LineTaxCalculation {
  amountCents: number;
  totalCents: number;
}

export interface CalculateTaxesResult {
  lines: CalculateTaxesLineResult[];
  subtotalCents: number;
  taxAmountCents: number;
  totalCents: number;
}

// The standalone counterpart to what createInvoiceFromAppointment/
// addInvoiceItem already do inline: price a set of hypothetical lines
// against the current tax profiles without needing an invoice to attach
// them to — e.g. a checkout screen previewing tax before committing an
// add-line call.
export async function calculateTaxesForLines(
  lines: CalculateTaxesLineInput[],
  jurisdiction: { country?: string; region?: string | null } = {}
): Promise<CalculateTaxesResult> {
  const taxProfiles = await listTaxes();
  const country = jurisdiction.country ?? DEFAULT_TAX_JURISDICTION.country;
  const region = jurisdiction.region ?? DEFAULT_TAX_JURISDICTION.region;

  const results: CalculateTaxesLineResult[] = lines.map((line) => {
    const applicableTaxes = selectApplicableTaxes(taxProfiles, {
      itemType: line.itemType,
      country,
      region,
      taxExempt: line.taxExempt,
    });
    const calc = calculateLineTaxes(line.amountCents, applicableTaxes);
    return {
      ...calc,
      amountCents: line.amountCents,
      totalCents: calc.subtotalCents + calc.taxAmountCents,
    };
  });

  return {
    lines: results,
    subtotalCents: results.reduce((sum, r) => sum + r.subtotalCents, 0),
    taxAmountCents: results.reduce((sum, r) => sum + r.taxAmountCents, 0),
    totalCents: results.reduce((sum, r) => sum + r.totalCents, 0),
  };
}
