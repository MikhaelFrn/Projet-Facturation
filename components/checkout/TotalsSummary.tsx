import { aggregateInvoiceTaxes, aggregateTipByEmployee } from "@/features/invoicing/checkout-view";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import { formatCents } from "@/utils/currency";

// Doc §6 Écran 1: subtotal, each tax on its own line ("TPS (5%) 5,00$"),
// tip with the per-employee split inline ("Nathalie 6$ / Joanie 4$"), total.
// Pure presentational — no state, no network calls.
export function TotalsSummary({ invoice }: { invoice: InvoiceWithDetails }) {
  const taxes = aggregateInvoiceTaxes(invoice);
  const tipByEmployee = aggregateTipByEmployee(invoice);

  return (
    <div>
      <p>Sous-total : {formatCents(invoice.subtotalCents)}</p>
      {taxes.map((tax) => (
        <p key={tax.taxName}>
          {tax.taxName} ({(tax.taxRateMicros / 10_000).toFixed(3)} %) : {formatCents(tax.amountCents)}
        </p>
      ))}
      <p>
        Pourboire : {formatCents(invoice.tipCents)}
        {invoice.tipCents > 0 && tipByEmployee.length > 0 && (
          <> ({tipByEmployee.map((employee) => `${employee.employeeName} ${formatCents(employee.tipCents)}`).join(" / ")})</>
        )}
      </p>
      <p>
        <strong>TOTAL : {formatCents(invoice.totalCents)}</strong>
      </p>
    </div>
  );
}
