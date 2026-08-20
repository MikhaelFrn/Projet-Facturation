import { isDatabaseConfigured } from "@/db/client";
import { listInvoices } from "@/features/invoicing/repository";
import { formatCents } from "@/utils/currency";

export default async function Home() {
  const invoices = await listInvoices();

  return (
    <main style={{ padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ padding: "0.5rem 1rem", background: isDatabaseConfigured ? "#1a4" : "#a81", color: "white", borderRadius: 6 }}>
        {isDatabaseConfigured
          ? "Connecté à Supabase."
          : "Mode mock — ajoutez DATABASE_URL dans .env.local pour basculer sur les vraies données."}
      </p>

      {invoices.map((invoice) => (
        <section key={invoice.id} style={{ marginTop: "2rem" }}>
          <h2>
            {invoice.invoiceNumber} — {invoice.customerName} ({invoice.status})
          </h2>

          <table>
            <thead>
              <tr>
                <th>Service/Produit</th>
                <th>Employée</th>
                <th>Prix</th>
                <th>Taxes</th>
                <th>Pourboire</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.employeeName ?? "—"}</td>
                  <td>{formatCents(item.unitPriceCents)}</td>
                  <td>{formatCents(item.taxAmountCents)}</td>
                  <td>{formatCents(item.tipCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p>
            Sous-total : {formatCents(invoice.subtotalCents)} · Taxes :{" "}
            {formatCents(invoice.taxTotalCents)} · Pourboire :{" "}
            {formatCents(invoice.tipCents)} · <strong>Total : {formatCents(invoice.totalCents)}</strong>
          </p>

          <p>
            Paiement(s) :{" "}
            {invoice.payments
              .map((p) => `${p.method} (${formatCents(p.amountCents)})`)
              .join(" + ")}
          </p>
        </section>
      ))}
    </main>
  );
}