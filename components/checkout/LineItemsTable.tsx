"use client";

import { Fragment, useState } from "react";
import type { CatalogItem } from "@/features/catalog/types";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import { formatCents } from "@/utils/currency";

// 4.10: shape returned by GET /api/invoices/[invoiceId]/eligible-packages
// for a single still-redeemable line.
export interface EligiblePackageLine {
  itemId: string;
  catalogItemId: string;
  description: string;
  quantity: number;
  packageId: string;
  packageName: string;
  remainingQuantity: number;
}

interface LineItemsTableProps {
  invoice: InvoiceWithDetails;
  catalogItems: CatalogItem[];
  busy: boolean;
  eligiblePackages: EligiblePackageLine[];
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  onAdd: (catalogItemId: string, quantity: number) => void;
  onRedeemPackage: (itemId: string, packageId: string) => void;
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
  eligiblePackages,
  onUpdateQuantity,
  onRemove,
  onAdd,
  onRedeemPackage,
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
          const isRedeemed = item.packageRedemptionId !== null;
          const eligiblePackage = eligiblePackages.find((line) => line.itemId === item.id);

          return (
            <Fragment key={item.id}>
              <tr>
                <td>{item.lineNumber}</td>
                <td>
                  {item.description}
                  {isRedeemed && (
                    <>
                      {" "}
                      <span style={{ fontSize: "0.8em", color: "#2a6", fontWeight: "bold" }}>
                        (Couvert par forfait)
                      </span>
                    </>
                  )}
                </td>
                <td>{item.employeeName ?? "—"}</td>
                <td>{formatCents(item.unitPriceCents)}</td>
                <td>{formatCents(item.taxAmountCents)}</td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={pendingValue}
                    disabled={busy || isRedeemed}
                    style={{ width: 50 }}
                    onChange={(e) =>
                      setPendingQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                  />
                  {hasPendingChange && !isRedeemed && (
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
                  <button disabled={busy || isRedeemed} onClick={() => onRemove(item.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
              {eligiblePackage && (
                <tr>
                  <td></td>
                  <td colSpan={6}>
                    <div
                      style={{
                        background: "#fff8e1",
                        border: "1px solid #e0c265",
                        borderRadius: 4,
                        padding: "0.35rem 0.5rem",
                        fontSize: "0.9em",
                      }}
                    >
                      Ce service est couvert par le forfait « {eligiblePackage.packageName} » (
                      {eligiblePackage.remainingQuantity} restant
                      {eligiblePackage.remainingQuantity > 1 ? "s" : ""}).{" "}
                      <button
                        disabled={busy}
                        onClick={() => onRedeemPackage(item.id, eligiblePackage.packageId)}
                      >
                        Utiliser le forfait
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
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
