"use client";

import { useState } from "react";
import type { InvoiceWithDetails, PaymentMethod } from "@/features/invoicing/types";
import { formatCents } from "@/utils/currency";
import { paymentMethodLabelFr } from "@/utils/labels";

// Doc §6 Écran 1 shows 7 buttons + Fractionner; store_credit is a valid
// method too (§4.7's table, already supported since livrable 5) and the
// mockup's omission reads as an ASCII-width cut rather than a deliberate
// exclusion, so it's included here for consistency.
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

export interface PaymentSubmission {
  method: PaymentMethod;
  amountCents: number;
  amountTenderedCents?: number;
}

interface PaymentPanelProps {
  invoice: InvoiceWithDetails;
  busy: boolean;
  onSubmit: (payment: PaymentSubmission) => void;
}

// Doc §6 Écran 1 / §4.7-4.8: one button per method, plus "Fractionner". Our
// backend already supports a split payment simply by calling recordPayment
// more than once (livrable 5) — "Fractionner" here is purely a UI mode: off,
// the amount field defaults to the full remaining balance (assume one
// method covers it); on, it starts empty so a partial amount can be
// entered, and the form stays available for the next method afterward.
export function PaymentPanel({ invoice, busy, onSubmit }: PaymentPanelProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");

  const paidSoFar = invoice.payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingBalanceCents = invoice.totalCents - paidSoFar;

  function selectMethod(method: PaymentMethod) {
    setSelectedMethod(method);
    setAmount(splitMode ? "" : (remainingBalanceCents / 100).toFixed(2));
    setTendered("");
  }

  function toggleSplit() {
    setSplitMode((prev) => {
      const next = !prev;
      if (selectedMethod) {
        setAmount(next ? "" : (remainingBalanceCents / 100).toFixed(2));
      }
      return next;
    });
  }

  function handleConfirm() {
    if (!selectedMethod) return;
    const amountCents = Math.round(Number(amount) * 100);
    const amountTenderedCents =
      TENDERABLE_METHODS.includes(selectedMethod) && tendered.trim() !== ""
        ? Math.round(Number(tendered) * 100)
        : undefined;

    onSubmit({ method: selectedMethod, amountCents, amountTenderedCents });
    setSelectedMethod(null);
    setAmount("");
    setTendered("");
  }

  if (remainingBalanceCents <= 0) {
    return <p>Facture entièrement payée.</p>;
  }

  return (
    <div>
      {invoice.payments.length > 0 && (
        <ul>
          {invoice.payments.map((payment) => (
            <li key={payment.id}>
              {paymentMethodLabelFr(payment.method)} : {formatCents(payment.amountCents)}
              {payment.changeGivenCents
                ? ` (monnaie rendue : ${formatCents(payment.changeGivenCents)})`
                : ""}
            </li>
          ))}
        </ul>
      )}
      <p>Solde restant : {formatCents(remainingBalanceCents)}</p>

      <div>
        {PAYMENT_METHODS.map((method) => (
          <button
            key={method}
            onClick={() => selectMethod(method)}
            disabled={busy}
            style={{ fontWeight: selectedMethod === method ? "bold" : "normal" }}
          >
            {paymentMethodLabelFr(method)}
          </button>
        ))}
        <button onClick={toggleSplit} disabled={busy} style={{ fontStyle: splitMode ? "italic" : "normal" }}>
          Fractionner{splitMode ? " (actif)" : ""}
        </button>
      </div>

      {selectedMethod && (
        <div>
          <input
            placeholder="Montant $"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={busy}
            style={{ width: 90 }}
          />
          {TENDERABLE_METHODS.includes(selectedMethod) && (
            <input
              placeholder="Montant reçu $"
              type="number"
              step="0.01"
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              disabled={busy}
              style={{ width: 100 }}
            />
          )}
          <button onClick={handleConfirm} disabled={busy || !amount}>
            Confirmer
          </button>
        </div>
      )}
    </div>
  );
}
