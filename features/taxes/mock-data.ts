import type { Tax } from "./types";

// Moved out of features/invoicing/mock-data.ts (livrable 4) — taxes are
// their own feature now, same as catalog. Numbers match the requis doc's
// worked example (section 4.5, Québec: TPS 5% + TVQ 9.975%).
export const mockTaxes: Tax[] = [
  {
    id: "tax-tps",
    name: "TPS",
    rateMicros: 50_000, // 5.000%
    country: "CA",
    region: null,
    appliesTo: "both",
    includedInPrice: false,
    calculationOrder: 1,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  {
    id: "tax-tvq",
    name: "TVQ",
    rateMicros: 99_750, // 9.975%, computed on the pre-TPS subtotal
    country: "CA",
    region: "QC",
    appliesTo: "both",
    includedInPrice: false,
    calculationOrder: 2,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
];

export function getMockTaxById(id: string): Tax | undefined {
  return mockTaxes.find((tax) => tax.id === id);
}
