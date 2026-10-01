import { describe, expect, it } from "vitest";
import {
  calculateLineTaxes,
  computeLineGrossAmountCents,
  selectApplicableTaxes,
  taxRateInputsFromSnapshot,
  type TaxRateInput,
} from "./tax-calculation";
import type { Tax } from "./types";

const TPS: TaxRateInput = {
  id: "tax-tps",
  name: "TPS",
  rateMicros: 50_000, // 5%
  includedInPrice: false,
  calculationOrder: 1,
};

const TVQ: TaxRateInput = {
  id: "tax-tvq",
  name: "TVQ",
  rateMicros: 99_750, // 9.975%
  includedInPrice: false,
  calculationOrder: 2,
};

describe("computeLineGrossAmountCents", () => {
  it("is just quantity * unitPriceCents with no discount", () => {
    expect(
      computeLineGrossAmountCents({
        quantity: 3,
        unitPriceCents: 1500,
        discountType: "none",
        discountAmountCents: 0,
        discountPercentMicros: 0,
      })
    ).toBe(4500);
  });

  it("subtracts a flat amount discount", () => {
    expect(
      computeLineGrossAmountCents({
        quantity: 1,
        unitPriceCents: 6000,
        discountType: "amount",
        discountAmountCents: 1000,
        discountPercentMicros: 0,
      })
    ).toBe(5000);
  });

  it("clamps an amount discount larger than the line at 0, never negative", () => {
    expect(
      computeLineGrossAmountCents({
        quantity: 1,
        unitPriceCents: 6000,
        discountType: "amount",
        discountAmountCents: 999_999,
        discountPercentMicros: 0,
      })
    ).toBe(0);
  });

  it("applies a percent discount (micros of the fraction)", () => {
    // 10% off 6000 = 600 off
    expect(
      computeLineGrossAmountCents({
        quantity: 1,
        unitPriceCents: 6000,
        discountType: "percent",
        discountAmountCents: 0,
        discountPercentMicros: 100_000,
      })
    ).toBe(5400);
  });

  it("clamps a >100% percent discount at 0", () => {
    expect(
      computeLineGrossAmountCents({
        quantity: 1,
        unitPriceCents: 6000,
        discountType: "percent",
        discountAmountCents: 0,
        discountPercentMicros: 1_500_000, // 150%
      })
    ).toBe(0);
  });
});

describe("calculateLineTaxes", () => {
  it("returns zero tax with an empty tax list", () => {
    const result = calculateLineTaxes(6000, []);
    expect(result).toEqual({ subtotalCents: 6000, taxes: [], taxAmountCents: 0 });
  });

  // Requis doc §4.5's own worked example (Facial hydratant, 60$): TPS 5% =
  // 3.00$, TVQ 9.975% = 5.99$ — both computed off the SAME 60$ base, not
  // compounded on top of each other ("pas de taxe sur taxe").
  it("matches the requis doc's Québec worked example for a single line", () => {
    const result = calculateLineTaxes(6000, [TPS, TVQ]);

    expect(result.subtotalCents).toBe(6000);
    expect(result.taxAmountCents).toBe(300 + 599);
    expect(result.taxes).toEqual([
      {
        taxId: "tax-tps",
        taxName: "TPS",
        taxRateMicros: 50_000,
        taxIncludedInPrice: false,
        calculationOrder: 1,
        taxAmountCents: 300,
      },
      {
        taxId: "tax-tvq",
        taxName: "TVQ",
        taxRateMicros: 99_750,
        taxIncludedInPrice: false,
        calculationOrder: 2,
        taxAmountCents: 599,
      },
    ]);
  });

  it("matches the doc's other two worked lines (pédicure, crème)", () => {
    expect(calculateLineTaxes(4000, [TPS, TVQ]).taxAmountCents).toBe(200 + 399);
    expect(calculateLineTaxes(4500, [TPS, TVQ]).taxAmountCents).toBe(225 + 449);
  });

  it("orders the breakdown by calculationOrder regardless of input order", () => {
    const result = calculateLineTaxes(6000, [TVQ, TPS]);
    expect(result.taxes.map((tax) => tax.taxName)).toEqual(["TPS", "TVQ"]);
  });

  it("backs out a tax that is included in the displayed price", () => {
    // A 10500-cent price that already includes a 5% tax: the tax-exclusive
    // base is 10500 / 1.05 = 10000, and the tax itself is 500 — NOT added on
    // top of the 10500 sticker price.
    const includedFivePercent: TaxRateInput = {
      id: "tax-incl",
      name: "Incluse",
      rateMicros: 50_000,
      includedInPrice: true,
      calculationOrder: 1,
    };

    const result = calculateLineTaxes(10_500, [includedFivePercent]);

    expect(result.subtotalCents).toBe(10_000);
    expect(result.taxes).toEqual([
      {
        taxId: "tax-incl",
        taxName: "Incluse",
        taxRateMicros: 50_000,
        taxIncludedInPrice: true,
        calculationOrder: 1,
        taxAmountCents: 500,
      },
    ]);
    // Already inside the 10500 gross amount, so nothing more is owed on top.
    expect(result.taxAmountCents).toBe(0);
  });

  it("mixes an included tax and an added tax on the same line", () => {
    const includedFivePercent: TaxRateInput = {
      id: "tax-incl",
      name: "Incluse",
      rateMicros: 50_000,
      includedInPrice: true,
      calculationOrder: 1,
    };
    const addedTenPercent: TaxRateInput = {
      id: "tax-added",
      name: "Ajoutée",
      rateMicros: 100_000,
      includedInPrice: false,
      calculationOrder: 2,
    };

    const result = calculateLineTaxes(10_500, [includedFivePercent, addedTenPercent]);

    // Tax-exclusive base is still 10000 (only the included tax is backed out).
    expect(result.subtotalCents).toBe(10_000);
    // The added 10% tax is computed off that same 10000 base, not off 10500.
    const added = result.taxes.find((tax) => tax.taxId === "tax-added");
    expect(added?.taxAmountCents).toBe(1000);
    // Only the added tax counts toward what's owed on top.
    expect(result.taxAmountCents).toBe(1000);
  });
});

describe("taxRateInputsFromSnapshot", () => {
  it("maps a line's snapshotted tax rows back into TaxRateInput shape", () => {
    const result = taxRateInputsFromSnapshot([
      {
        taxId: null, // the profile this came from was later deleted/cleared
        taxName: "TPS",
        taxRateMicros: 50_000,
        taxIncludedInPrice: false,
        calculationOrder: 1,
      },
    ]);

    expect(result).toEqual([
      { id: null, name: "TPS", rateMicros: 50_000, includedInPrice: false, calculationOrder: 1 },
    ]);
  });
});

describe("selectApplicableTaxes", () => {
  const makeTax = (overrides: Partial<Tax>): Tax => ({
    id: "tax-x",
    name: "X",
    rateMicros: 50_000,
    country: "CA",
    region: null,
    appliesTo: "both",
    includedInPrice: false,
    calculationOrder: 1,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  it("excludes inactive tax profiles", () => {
    const taxes = [makeTax({ active: false })];
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "QC" })).toEqual([]);
  });

  it("excludes profiles from a different country", () => {
    const taxes = [makeTax({ country: "US" })];
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "QC" })).toEqual([]);
  });

  it("a null region applies to every region of the country", () => {
    const taxes = [makeTax({ region: null })];
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "QC" })).toHaveLength(1);
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "ON" })).toHaveLength(1);
  });

  it("a specific region only applies to that region", () => {
    const taxes = [makeTax({ region: "QC" })];
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "QC" })).toHaveLength(1);
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "ON" })).toEqual([]);
  });

  it("filters by appliesTo: services-only tax excludes products and vice versa", () => {
    const servicesOnly = [makeTax({ appliesTo: "services" })];
    expect(selectApplicableTaxes(servicesOnly, { itemType: "service", country: "CA", region: null })).toHaveLength(1);
    expect(selectApplicableTaxes(servicesOnly, { itemType: "product", country: "CA", region: null })).toEqual([]);

    const productsOnly = [makeTax({ appliesTo: "products" })];
    expect(selectApplicableTaxes(productsOnly, { itemType: "product", country: "CA", region: null })).toHaveLength(1);
    expect(selectApplicableTaxes(productsOnly, { itemType: "service", country: "CA", region: null })).toEqual([]);
  });

  it("'both' applies to services and products alike", () => {
    const taxes = [makeTax({ appliesTo: "both" })];
    expect(selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: null })).toHaveLength(1);
    expect(selectApplicableTaxes(taxes, { itemType: "product", country: "CA", region: null })).toHaveLength(1);
  });

  it("taxExempt short-circuits to no taxes at all, regardless of configuration", () => {
    const taxes = [makeTax({}), makeTax({ id: "tax-y" })];
    expect(
      selectApplicableTaxes(taxes, { itemType: "service", country: "CA", region: "QC", taxExempt: true })
    ).toEqual([]);
  });
});
