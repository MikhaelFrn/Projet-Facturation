"use client";

import { useState } from "react";
import type { CatalogItem } from "@/features/catalog/types";
import type { InvoiceWithDetails, PaymentMethod } from "@/features/invoicing/types";
import type { TipBase, TipDistribution, TipMode } from "@/features/invoicing/tip-calculation";
import { formatCents } from "@/utils/currency";
import { invoiceStatusLabelFr, paymentMethodLabelFr } from "@/utils/labels";

const PAYMENT_METHODS: PaymentMethod[] = [
  "cash",
  "credit_card",
  "debit_card",
  "interac",
  "square",
  "gift_card",
  "package",
  "store_credit",
];
const TENDERABLE_METHODS: PaymentMethod[] = ["cash", "interac"];
const TIP_MODES: TipMode[] = ["fixed", "percent"];
const TIP_BASES: TipBase[] = ["pre_tax", "post_tax"];
const TIP_DISTRIBUTIONS: TipDistribution[] = ["proportional", "equal", "manual"];

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentTendered, setPaymentTendered] = useState("");
  const [tipMode, setTipMode] = useState<TipMode>("fixed");
  const [tipAmount, setTipAmount] = useState("");
  const [tipPercent, setTipPercent] = useState("");
  const [tipBase, setTipBase] = useState<TipBase>("pre_tax");
  const [tipDistribution, setTipDistribution] = useState<TipDistribution>("proportional");
  const [manualTipAmounts, setManualTipAmounts] = useState<Record<string, string>>({});
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

  async function handleRecordPayment() {
    const amountCents = Math.round(Number(paymentAmount) * 100);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setError("Le montant doit être un nombre positif");
      return;
    }
    const isTenderable = TENDERABLE_METHODS.includes(paymentMethod);
    const amountTenderedCents =
      isTenderable && paymentTendered.trim() !== "" ? Math.round(Number(paymentTendered) * 100) : undefined;

    await call(`/api/invoices/${invoice.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: paymentMethod, amountCents, amountTenderedCents }),
    });
    setPaymentAmount("");
    setPaymentTendered("");
  }

  async function handleSetTip() {
    const body: Record<string, unknown> = { mode: tipMode, distribution: tipDistribution };

    if (tipMode === "fixed") {
      const amountCents = Math.round(Number(tipAmount) * 100);
      if (!Number.isInteger(amountCents) || amountCents < 0) {
        setError("Le montant du pourboire doit être un nombre positif ou zéro");
        return;
      }
      body.amountCents = amountCents;
    } else {
      const percent = Number(tipPercent);
      if (!Number.isFinite(percent) || percent < 0) {
        setError("Le pourcentage doit être un nombre positif ou zéro");
        return;
      }
      body.percent = percent;
      body.base = tipBase;
    }

    if (tipDistribution === "manual") {
      body.manualAmounts = tipEmployees.map((employee) => ({
        employeeId: employee.id,
        amountCents: Math.round(Number(manualTipAmounts[employee.id] ?? "0") * 100),
      }));
    }

    await call(`/api/invoices/${invoice.id}/tip`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  // Same eligibility rule as setInvoiceTip: service lines with an assigned
  // employee only — used to render per-employee manual-amount inputs.
  const tipEmployees = invoice.items
    .filter((item) => item.itemType === "service" && item.employeeId)
    .reduce<{ id: string; name: string }[]>((acc, item) => {
      if (!acc.some((employee) => employee.id === item.employeeId)) {
        acc.push({ id: item.employeeId as string, name: item.employeeName ?? (item.employeeId as string) });
      }
      return acc;
    }, []);

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
            <th>Pourboire</th>
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
                <td>{formatCents(item.tipCents)}</td>
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

      <div style={{ marginTop: "1rem" }}>
        <strong>Pourboire</strong>
        <div>
          <select value={tipMode} onChange={(e) => setTipMode(e.target.value as TipMode)} disabled={busy}>
            {TIP_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "fixed" ? "Montant fixe" : "Pourcentage"}
              </option>
            ))}
          </select>
          {tipMode === "fixed" ? (
            <input
              placeholder="Montant $"
              type="number"
              step="0.01"
              value={tipAmount}
              onChange={(e) => setTipAmount(e.target.value)}
              disabled={busy}
              style={{ width: 90 }}
            />
          ) : (
            <>
              <input
                placeholder="Pourcentage"
                type="number"
                step="0.1"
                value={tipPercent}
                onChange={(e) => setTipPercent(e.target.value)}
                disabled={busy}
                style={{ width: 80 }}
              />
              <select value={tipBase} onChange={(e) => setTipBase(e.target.value as TipBase)} disabled={busy}>
                {TIP_BASES.map((base) => (
                  <option key={base} value={base}>
                    {base === "pre_tax" ? "Avant taxes" : "Après taxes"}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            value={tipDistribution}
            onChange={(e) => setTipDistribution(e.target.value as TipDistribution)}
            disabled={busy}
          >
            {TIP_DISTRIBUTIONS.map((mode) => (
              <option key={mode} value={mode}>
                {mode === "proportional" ? "Prorata" : mode === "equal" ? "Égale" : "Manuelle"}
              </option>
            ))}
          </select>
          <button
            onClick={handleSetTip}
            disabled={busy || (tipMode === "fixed" ? !tipAmount : !tipPercent)}
          >
            Appliquer le pourboire
          </button>
        </div>

        {tipDistribution === "manual" && (
          <div>
            {tipEmployees.map((employee) => (
              <label key={employee.id} style={{ marginRight: "0.5rem" }}>
                {employee.name} :{" "}
                <input
                  type="number"
                  step="0.01"
                  value={manualTipAmounts[employee.id] ?? ""}
                  onChange={(e) =>
                    setManualTipAmounts((prev) => ({ ...prev, [employee.id]: e.target.value }))
                  }
                  disabled={busy}
                  style={{ width: 80 }}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const paidSoFar = invoice.payments
          .filter((p) => p.status === "completed")
          .reduce((sum, p) => sum + p.amountCents, 0);
        const remainingBalanceCents = invoice.totalCents - paidSoFar;

        return (
          <div style={{ marginTop: "1rem" }}>
            <strong>Paiements</strong>
            {invoice.payments.length > 0 && (
              <ul>
                {invoice.payments.map((payment) => (
                  <li key={payment.id}>
                    {paymentMethodLabelFr(payment.method)} : {formatCents(payment.amountCents)}
                    {payment.changeGivenCents ? ` (monnaie rendue : ${formatCents(payment.changeGivenCents)})` : ""}
                  </li>
                ))}
              </ul>
            )}
            <p>Solde restant : {formatCents(remainingBalanceCents)}</p>

            {remainingBalanceCents > 0 && (
              <div>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  disabled={busy}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {paymentMethodLabelFr(method)}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Montant $"
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  disabled={busy}
                  style={{ width: 90 }}
                />
                {TENDERABLE_METHODS.includes(paymentMethod) && (
                  <input
                    placeholder="Montant reçu $"
                    type="number"
                    step="0.01"
                    value={paymentTendered}
                    onChange={(e) => setPaymentTendered(e.target.value)}
                    disabled={busy}
                    style={{ width: 100 }}
                  />
                )}
                <button onClick={handleRecordPayment} disabled={busy || !paymentAmount}>
                  Enregistrer le paiement
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {error && <p style={{ color: "#c33" }}>{error}</p>}
    </div>
  );
}
