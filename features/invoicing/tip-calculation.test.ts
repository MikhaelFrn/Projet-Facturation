import { describe, expect, it } from "vitest";
import {
  computeTipTotalCents,
  prorateTip,
  type TipEligibleLine,
} from "./tip-calculation";

describe("computeTipTotalCents", () => {
  it("fixed mode returns the amount as-is", () => {
    expect(
      computeTipTotalCents({ mode: "fixed", amountCents: 1000, base: "pre_tax", subtotalCents: 0, taxTotalCents: 0 })
    ).toBe(1000);
  });

  it("fixed mode clamps a negative amount at 0", () => {
    expect(
      computeTipTotalCents({ mode: "fixed", amountCents: -500, base: "pre_tax", subtotalCents: 0, taxTotalCents: 0 })
    ).toBe(0);
  });

  it("fixed mode with no amount defaults to 0", () => {
    expect(computeTipTotalCents({ mode: "fixed", base: "pre_tax", subtotalCents: 0, taxTotalCents: 0 })).toBe(0);
  });

  it("percent mode on pre_tax base ignores tax", () => {
    // 15% of a 10000-cent subtotal, regardless of tax
    expect(
      computeTipTotalCents({
        mode: "percent",
        percent: 15,
        base: "pre_tax",
        subtotalCents: 10_000,
        taxTotalCents: 1_497,
      })
    ).toBe(1_500);
  });

  it("percent mode on post_tax base includes tax in the base", () => {
    // 15% of (10000 + 1497)
    expect(
      computeTipTotalCents({
        mode: "percent",
        percent: 15,
        base: "post_tax",
        subtotalCents: 10_000,
        taxTotalCents: 1_497,
      })
    ).toBe(Math.round(11_497 * 0.15));
  });
});

describe("prorateTip", () => {
  it("returns nothing for no eligible lines", () => {
    expect(prorateTip(1000, [], "proportional")).toEqual([]);
  });

  // Requis doc §4.6's own worked example: Nathalie (Facial, 60$), Joanie
  // (Pédicure, 40$), 10$ tip, proportional → Nathalie 6.00$, Joanie 4.00$.
  it("matches the requis doc's proportional worked example", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-nathalie", employeeId: "nathalie", valueCents: 6000 },
      { lineId: "line-joanie", employeeId: "joanie", valueCents: 4000 },
    ];

    const result = prorateTip(1000, lines, "proportional");

    expect(result).toEqual([
      { lineId: "line-nathalie", tipCents: 600 },
      { lineId: "line-joanie", tipCents: 400 },
    ]);
  });

  it("splits equally across employees regardless of line value", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-a", employeeId: "a", valueCents: 9000 },
      { lineId: "line-b", employeeId: "b", valueCents: 1000 },
    ];

    const result = prorateTip(1000, lines, "equal");

    expect(result).toEqual([
      { lineId: "line-a", tipCents: 500 },
      { lineId: "line-b", tipCents: 500 },
    ]);
  });

  it("the last employee absorbs the rounding remainder so the parts always sum to the whole", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-a", employeeId: "a", valueCents: 1 },
      { lineId: "line-b", employeeId: "b", valueCents: 1 },
      { lineId: "line-c", employeeId: "c", valueCents: 1 },
    ];

    // 1000 split 3 ways doesn't divide evenly (333.33...).
    const result = prorateTip(1000, lines, "equal");

    expect(result.reduce((sum, line) => sum + line.tipCents, 0)).toBe(1000);
    // First two get the rounded share, the third (last) absorbs whatever's left.
    expect(result[0].tipCents).toBe(333);
    expect(result[1].tipCents).toBe(333);
    expect(result[2].tipCents).toBe(334);
  });

  it("sub-divides an employee's share across their own multiple lines by relative value", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-1", employeeId: "nathalie", valueCents: 3000 },
      { lineId: "line-2", employeeId: "nathalie", valueCents: 1000 },
    ];

    // Nathalie is the only employee, so her whole share is the 1000-cent tip.
    // Within her own lines (3000/1000, i.e. 3:1), the split should be 750/250.
    const result = prorateTip(1000, lines, "proportional");

    const total = result.reduce((sum, line) => sum + line.tipCents, 0);
    expect(total).toBe(1000);
    expect(result.find((r) => r.lineId === "line-1")?.tipCents).toBe(750);
    expect(result.find((r) => r.lineId === "line-2")?.tipCents).toBe(250);
  });

  it("manual distribution assigns exactly the given per-employee amounts", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-a", employeeId: "a", valueCents: 6000 },
      { lineId: "line-b", employeeId: "b", valueCents: 4000 },
    ];

    const result = prorateTip(1000, lines, "manual", [
      { employeeId: "a", amountCents: 700 },
      { employeeId: "b", amountCents: 300 },
    ]);

    expect(result).toEqual([
      { lineId: "line-a", tipCents: 700 },
      { lineId: "line-b", tipCents: 300 },
    ]);
  });

  it("manual distribution throws when the amounts don't sum to the tip total", () => {
    const lines: TipEligibleLine[] = [{ lineId: "line-a", employeeId: "a", valueCents: 6000 }];

    expect(() => prorateTip(1000, lines, "manual", [{ employeeId: "a", amountCents: 999 }])).toThrow(
      "manual amounts sum to 999 but the tip total is 1000"
    );
  });

  it("manual distribution throws when an amount is given for an employee not on the invoice", () => {
    const lines: TipEligibleLine[] = [{ lineId: "line-a", employeeId: "a", valueCents: 6000 }];

    expect(() =>
      prorateTip(1000, lines, "manual", [{ employeeId: "stranger", amountCents: 1000 }])
    ).toThrow("employee stranger is not assigned to any eligible line on this invoice");
  });

  it("manual distribution throws when no amounts are given at all", () => {
    const lines: TipEligibleLine[] = [{ lineId: "line-a", employeeId: "a", valueCents: 6000 }];

    expect(() => prorateTip(1000, lines, "manual")).toThrow(
      "manualAmounts is required when distribution is 'manual'"
    );
  });

  it("manual distribution defaults an unmentioned eligible employee to zero", () => {
    const lines: TipEligibleLine[] = [
      { lineId: "line-a", employeeId: "a", valueCents: 6000 },
      { lineId: "line-b", employeeId: "b", valueCents: 4000 },
    ];

    const result = prorateTip(1000, lines, "manual", [{ employeeId: "a", amountCents: 1000 }]);

    expect(result).toEqual([
      { lineId: "line-a", tipCents: 1000 },
      { lineId: "line-b", tipCents: 0 },
    ]);
  });
});
