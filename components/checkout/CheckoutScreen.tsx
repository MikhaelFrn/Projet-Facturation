"use client";

import { useEffect, useState } from "react";
import type { CatalogItem } from "@/features/catalog/types";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import { invoiceStatusLabelFr } from "@/utils/labels";
import { LineItemsTable, type EligiblePackageLine } from "./LineItemsTable";
import { PaymentPanel, type GiftCardRedemptionSubmission, type PaymentSubmission } from "./PaymentPanel";
import { TipControl, type TipSubmission } from "./TipControl";
import { TotalsSummary } from "./TotalsSummary";

interface CheckoutScreenProps {
  initialInvoice: InvoiceWithDetails;
  catalogItems: CatalogItem[];
}

// Livrable 7's "écran checkout complet" (doc §6 Écran 1) — composes
// LineItemsTable / TotalsSummary / TipControl / PaymentPanel. Owns the
// invoice state and every network call; the children are presentational.
// Replaces the old scratch InvoiceLineEditor.
//
// Same mock-mode reasoning as before: state is updated from each call's own
// response rather than a page refresh, since in dev the route handlers and
// the page's Server Component don't share module state in mock mode (see
// the note under the page's top banner) — this disappears once
// DATABASE_URL is set.
export function CheckoutScreen({ initialInvoice, catalogItems }: CheckoutScreenProps) {
  const [invoice, setInvoice] = useState(initialInvoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligiblePackages, setEligiblePackages] = useState<EligiblePackageLine[]>([]);

  // 4.10: "le système détecte" — re-checked against the invoice's own
  // eligible-packages endpoint after every change (add/remove/redeem all
  // change which lines qualify), not derived client-side.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices/${invoice.id}/eligible-packages`)
      .then((response) => response.json())
      .then((body) => {
        if (!cancelled) setEligiblePackages(body.eligibleLines ?? []);
      })
      .catch(() => {
        if (!cancelled) setEligiblePackages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [invoice]);

  async function call(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, init);
      const body = await response.json();
      if (!response.ok) {
        setError(`${response.status}: ${body.error}`);
        return;
      }
      setInvoice(body);
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(catalogItemId: string, quantity: number) {
    call(`/api/invoices/${invoice.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogItemId, quantity }),
    });
  }

  function handleUpdateQuantity(itemId: string, quantity: number) {
    call(`/api/invoices/${invoice.id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity }),
    });
  }

  function handleRemove(itemId: string) {
    call(`/api/invoices/${invoice.id}/items/${itemId}`, { method: "DELETE" });
  }

  function handleSetTip(submission: TipSubmission) {
    call(`/api/invoices/${invoice.id}/tip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
  }

  function handleRecordPayment(submission: PaymentSubmission) {
    call(`/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(submission),
    });
  }

  function handleRedeemGiftCard(redemption: GiftCardRedemptionSubmission) {
    call(`/api/invoices/${invoice.id}/gift-card-redemptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(redemption),
    });
  }

  function handleRedeemPackage(itemId: string, packageId: string) {
    call(`/api/invoices/${invoice.id}/items/${itemId}/redeem-package`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageId }),
    });
  }

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.75rem", marginTop: "0.5rem" }}>
      <p>
        Client : <strong>{invoice.customerName}</strong> Facture #{invoice.invoiceNumber} (
        {invoiceStatusLabelFr(invoice.status)})
      </p>

      <LineItemsTable
        invoice={invoice}
        catalogItems={catalogItems}
        busy={busy}
        eligiblePackages={eligiblePackages}
        onAdd={handleAdd}
        onUpdateQuantity={handleUpdateQuantity}
        onRemove={handleRemove}
        onRedeemPackage={handleRedeemPackage}
      />

      <TotalsSummary invoice={invoice} />

      <div style={{ marginTop: "1rem" }}>
        <strong>Pourboire</strong>
        <TipControl invoice={invoice} busy={busy} onSubmit={handleSetTip} />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <strong>Paiement</strong>
        <PaymentPanel
          invoice={invoice}
          busy={busy}
          onSubmit={handleRecordPayment}
          onRedeemGiftCard={handleRedeemGiftCard}
        />
      </div>

      {error && <p style={{ color: "#c33" }}>{error}</p>}
    </div>
  );
}
