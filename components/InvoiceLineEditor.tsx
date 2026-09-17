"use client";

import { useState } from "react";
import type { CatalogItem } from "@/features/catalog/types";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import { formatCents } from "@/utils/currency";
import { invoiceStatusLabelFr } from "@/utils/labels";

// Dev-harness only (4.4: add/modify/remove an invoice line). Keeps the
// invoice entirely in local state, updated from each call's own response —
// same reasoning as CheckoutButton: in mock mode this route handler and the
// page's Server Component don't share module state in dev, so a page
// refresh wouldn't reflect these changes anyway.
export function InvoiceLineEditor({
  initialInvoice,
  catalogItems,
}: {
  initialInvoice: InvoiceWithDetails;
  catalogItems: CatalogItem[];
}) {
  const [invoice, setInvoice] = useState(initialInvoice);
  // Pending (not-yet-saved) quantity text per line, keyed by item id — a
  // plain onBlur/onChange save was unreliable: the number input's own
  // up/down spinner arrows change the value without moving focus out of the
  // field, so onBlur never fired. An explicit button removes the ambiguity.
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, string>>({});
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(catalogItems[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  function handleAdd() {
    call(`/api/invoices/${invoice.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogItemId: selectedCatalogItemId, quantity }),
    });
  }

  async function handleUpdateQuantity(itemId: string) {
    const nextQuantity = Number(pendingQuantities[itemId]);
    if (!Number.isInteger(nextQuantity) || nextQuantity <= 0) {
      setError("La quantité doit être un entier positif");
      return;
    }
    await call(`/api/invoices/${invoice.id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: nextQuantity }),
    });
    setPendingQuantities((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function handleRemove(itemId: string) {
    call(`/api/invoices/${invoice.id}/items/${itemId}`, { method: "DELETE" });
  }

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 6, padding: "0.75rem", marginTop: "0.5rem" }}>
      <strong>
        {invoice.invoiceNumber} ({invoiceStatusLabelFr(invoice.status)})
      </strong>
      <table>
        <thead>
          <tr>
            <th>Service/Produit</th>
            <th>Qté</th>
            <th>Sous-total</th>
            <th>Taxes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => {
            const pendingValue = pendingQuantities[item.id] ?? String(item.quantity);
            const hasPendingChange = pendingValue !== String(item.quantity);
            return (
              <tr key={item.id}>
                <td>{item.description}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={pendingValue}
                    disabled={busy}
                    style={{ width: 50 }}
                    onChange={(e) =>
                      setPendingQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  {hasPendingChange && (
                    <button disabled={busy} onClick={() => handleUpdateQuantity(item.id)}>
                      Mettre à jour
                    </button>
                  )}
                </td>
                <td>{formatCents(item.subtotalCents)}</td>
                <td>{formatCents(item.taxAmountCents)}</td>
                <td>
                  <button disabled={busy} onClick={() => handleRemove(item.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p>
        Sous-total : {formatCents(invoice.subtotalCents)} · Taxes : {formatCents(invoice.taxTotalCents)} ·{" "}
        <strong>Total : {formatCents(invoice.totalCents)}</strong>
      </p>

      <div>
        <select
          value={selectedCatalogItemId}
          onChange={(e) => setSelectedCatalogItemId(e.target.value)}
          disabled={busy}
        >
          {catalogItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({formatCents(item.unitPriceCents)})
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          style={{ width: 50 }}
          disabled={busy}
        />
        <button onClick={handleAdd} disabled={busy || !selectedCatalogItemId}>
          Ajouter
        </button>
      </div>

      {error && <p style={{ color: "#c33" }}>{error}</p>}
    </div>
  );
}
