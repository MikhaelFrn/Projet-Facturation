import { describe, expect, it } from "vitest";
import { formatCents } from "./currency";

describe("formatCents", () => {
  it("formats cents as fr-CA currency by default", () => {
    // Intl.NumberFormat's fr-CA output uses a non-breaking space before the
    // currency symbol — asserting with a regex avoids pinning down exactly
    // which whitespace character Node's ICU data uses.
    expect(formatCents(6000)).toMatch(/60,00\s?\$/);
  });

  it("formats cents as en-CA currency when asked", () => {
    expect(formatCents(6000, "en-CA")).toMatch(/\$60\.00/);
  });

  it("handles zero", () => {
    expect(formatCents(0)).toMatch(/0,00\s?\$/);
  });

  it("handles amounts under a dollar", () => {
    expect(formatCents(99)).toMatch(/0,99\s?\$/);
  });
});
