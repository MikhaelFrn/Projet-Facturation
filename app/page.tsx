import { isDatabaseConfigured } from "@/db/client";
import { listAppointments } from "@/features/appointments/repository";
import { searchCatalogItems } from "@/features/catalog/repository";
import { listInvoices } from "@/features/invoicing/repository";
import { listTaxes } from "@/features/taxes/repository";
import { formatCents } from "@/utils/currency";
import { appointmentStatusLabelFr, invoiceStatusLabelFr, paymentMethodLabelFr } from "@/utils/labels";
import { CheckoutButton } from "@/components/CheckoutButton";
import { TaxSettingsPanel } from "@/components/TaxSettingsPanel";

export default async function Home() {
  const [invoices, appointments, catalogItems, taxes] = await Promise.all([
    listInvoices(),
    listAppointments(),
    searchCatalogItems(""),
    listTaxes(),
  ]);
  const invoicedAppointmentIds = new Set(invoices.map((invoice) => invoice.appointmentId));

  return (
    <main style={{ padding: "2rem", maxWidth: 900, margin: "0 auto" }}>
      <p style={{ padding: "0.5rem 1rem", background: isDatabaseConfigured ? "#1a4" : "#a81", color: "white", borderRadius: 6 }}>
        {isDatabaseConfigured
          ? "Connecté à Supabase."
          : "Mode mock — ajoutez DATABASE_URL dans .env.local pour basculer sur les vraies données."}
      </p>

      {!isDatabaseConfigured && (
        <p style={{ fontSize: "0.8rem", color: "#666" }}>
          Note : en mode mock, cette page et les routes /api/invoices/* ont chacune leur propre copie
          des données en mémoire (particularité de Next.js en dev). Le bouton et l&apos;éditeur de lignes
          affichent donc le résultat de leur propre appel plutôt que de dépendre du rafraîchissement de
          la liste ci-dessous — ce problème disparaît une fois DATABASE_URL configuré.
        </p>
      )}

      <h1 style={{ fontSize: "1.2rem" }}>Rendez-vous (calendrier — stand-in de dev)</h1>
      <table>
        <thead>
          <tr>
            <th>Client</th>
            <th>Service(s)</th>
            <th>Statut</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => {
            const alreadyInvoiced = invoicedAppointmentIds.has(appointment.id);
            return (
              <tr key={appointment.id}>
                <td>{appointment.customerName}</td>
                <td>{appointment.services.map((s) => s.description).join(", ")}</td>
                <td>{appointmentStatusLabelFr(appointment.status)}</td>
                <td>
                  {alreadyInvoiced ? (
                    "Déjà facturé"
                  ) : appointment.status === "completed" ? (
                    <CheckoutButton appointmentId={appointment.id} catalogItems={catalogItems} />
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h1 style={{ fontSize: "1.2rem", marginTop: "2rem" }}>Factures</h1>
      {invoices.map((invoice) => (
        <section key={invoice.id} style={{ marginTop: "1rem" }}>
          <h2>
            {invoice.invoiceNumber} — {invoice.customerName} ({invoiceStatusLabelFr(invoice.status)})
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
            {invoice.payments.length > 0
              ? invoice.payments
                  .map((p) => `${paymentMethodLabelFr(p.method)} (${formatCents(p.amountCents)})`)
                  .join(" + ")
              : "aucun"}
          </p>
        </section>
      ))}

      <h1 style={{ fontSize: "1.2rem", marginTop: "2rem" }}>Paramètres des taxes</h1>
      <TaxSettingsPanel initialTaxes={taxes} />
    </main>
  );
}
