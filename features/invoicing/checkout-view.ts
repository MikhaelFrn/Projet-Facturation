import type { InvoiceWithDetails } from "./types";

// Pure display-only aggregations for the checkout screen (livrable 7).
// Everything here is derived from data an invoice response already
// includes (tax is stored per line, tip per line) — no new API needed,
// just grouping what we already have.

export interface TaxSummaryLine {
  taxName: string;
  taxRateMicros: number;
  amountCents: number;
}

// Doc §6 Écran 1: totals show each tax once ("TPS (5%) 5,00$"), summed
// across every line, not the per-line breakdown the table itself shows.
export function aggregateInvoiceTaxes(invoice: InvoiceWithDetails): TaxSummaryLine[] {
  const byName = new Map<string, TaxSummaryLine>();

  for (const item of invoice.items) {
    for (const tax of item.taxes) {
      const existing = byName.get(tax.taxName);
      if (existing) {
        existing.amountCents += tax.taxAmountCents;
      } else {
        byName.set(tax.taxName, {
          taxName: tax.taxName,
          taxRateMicros: tax.taxRateMicros,
          amountCents: tax.taxAmountCents,
        });
      }
    }
  }

  return [...byName.values()];
}

export interface EmployeeTipSummary {
  employeeId: string;
  employeeName: string;
  tipCents: number;
}

// Doc §6 Écran 1: "Pourboire [10$] (Nathalie 6$ / Joanie 4$)" — distinct
// from the per-LINE tip column the table shows, since one employee can
// have several lines. Includes every employee with an assigned line, even
// at 0$ (e.g. before a tip has been set) — the component decides whether
// to hide that.
export function aggregateTipByEmployee(invoice: InvoiceWithDetails): EmployeeTipSummary[] {
  const byEmployee = new Map<string, EmployeeTipSummary>();

  for (const item of invoice.items) {
    if (!item.employeeId) continue;

    const existing = byEmployee.get(item.employeeId);
    if (existing) {
      existing.tipCents += item.tipCents;
    } else {
      byEmployee.set(item.employeeId, {
        employeeId: item.employeeId,
        employeeName: item.employeeName ?? item.employeeId,
        tipCents: item.tipCents,
      });
    }
  }

  return [...byEmployee.values()];
}
