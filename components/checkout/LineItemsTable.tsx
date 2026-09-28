"use client";

import { useState } from "react";
import type { CatalogItem } from "@/features/catalog/types";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import { formatCents } from "@/utils/currency";

interface LineItemsTableProps {
  invoice: InvoiceWithDetails;
  catalogItems: CatalogItem[];
  busy: boolean;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onAdd: (catalogItemId: string, quantity: number) => void;
}

// Doc §6 Écran 1: LIGNE / SERVICE-PRODUIT / EMPLOYÉE / PRIX / TAXES, plus the
// "[+ Ajouter produit]" row. Quantity editing and line removal aren't in the
// mockup's column list (ASCII width constraints) but are required by §4.4,
// so they're added as a qty input + buttons rather than dropped.
//
// Presentational only — all state (the invoice itself, network calls) lives
// in the parent CheckoutScreen; this only owns the ephemeral not-yet-saved
// input text for quantity edits and the add-product form.
export function LineItemsTable({
  invoice,
  catalogItems,
  busy,
  onUpdateQuantity,
  onRemove,
  onAdd,
}: LineItemsTableProps) {
  const [pendingQuantities, setPendingQuantities] = useState<Record<string, string>>({});
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState(catalogItems[0]?.id ?? "");
  const [addQuantity, setAddQuantity] = useState(1);

  return (
    <table>
      <thead>
        <tr>
          <th>Ligne</th>
          <th>Service/Produit</th>
          <th>Employée</th>
          <th>Prix</th>
          <th>Taxes</th>
          <th>Qté</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {invoice.items.map((item) => {
          const pendingValue = pendingQuantities[item.id] ?? String(item.quantity);
          const hasPendingChange = pendingValue !== String(item.quantity);

          return (
            <tr key={item.id}>
              <td>{item.lineNumber}</td>
              <td>{item.description}</td>
              <td>{item.employeeName ?? "—"}</td>
              <td>{formatCents(item.unitPriceCents)}</td>
              <td>{formatCents(item.taxAmountCents)}</td>
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
                  <button
                    disabled={busy}
                    onClick={() => {
                      const next = Number(pendingValue);
                      if (!Number.isInteger(next) || next <= 0) return;
                      onUpdateQuantity(item.id, next);
                      setPendingQuantities((prev) => {
                        const copy = { ...prev };
                        delete copy[item.id];
                        return copy;
                      });
                    }}
                  >
                    Mettre à jour
                  </button>
                )}
              </td>
              <td>
                <button disabled={busy} onClick={() => onRemove(item.id)}>
                  Supprimer
                </button>
              </td>
            </tr>
          );
        })}
        <tr>
          <td colSpan={4}>
            <select
              value={selectedCatalogItemId}
              onChange={(e) => setSelectedCatalogItemId(e.target.value)}
              disabled={busy}
            >
              {catalogItems.map((catalogItem) => (
                <option key={catalogItem.id} value={catalogItem.id}>
                  {catalogItem.name} ({formatCents(catalogItem.unitPriceCents)})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              value={addQuantity}
              onChange={(e) => setAddQuantity(Number(e.target.value))}
              style={{ width: 50 }}
              disabled={busy}
            />
          </td>
          <td colSpan={3}>
            <button
              onClick={() => onAdd(selectedCatalogItemId, addQuantity)}
              disabled={busy || !selectedCatalogItemId}
            >
              + Ajouter produit
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
