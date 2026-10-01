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

export interface GiftCardRedemptionSubmission {
  code: string;
  amountCents: number;
}

interface PaymentPanelProps {
  invoice: InvoiceWithDetails;
  busy: boolean;
  onSubmit: (payment: PaymentSubmission) => void;
  onRedeemGiftCard: (redemption: GiftCardRedemptionSubmission) => void;
}

type GiftCardLookup =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "found"; remainingBalanceCents: number }
  | { status: "error"; message: string };

// Doc §6 Écran 1 / §4.7-4.8: one button per method, plus "Fractionner". Our
// backend already supports a split payment simply by calling recordPayment
// more than once (livrable 5) — "Fractionner" here is purely a UI mode: off,
// the amount field defaults to the full remaining balance (assume one
// method covers it); on, it starts empty so a partial amount can be
// entered, and the form stays available for the next method afterward.
export function PaymentPanel({ invoice, busy, onSubmit, onRedeemGiftCard }: PaymentPanelProps) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [amount, setAmount] = useState("");
  const [tendered, setTendered] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardLookup, setGiftCardLookup] = useState<GiftCardLookup>({ status: "idle" });
  const [giftCardAmount, setGiftCardAmount] = useState("");

  const paidSoFar = invoice.payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingBalanceCents = invoice.totalCents - paidSoFar;

  function selectMethod(method: PaymentMethod) {
    setSelectedMethod(method);
    setAmount(splitMode ? "" : (remainingBalanceCents / 100).toFixed(2));
    setTendered("");
    setGiftCardCode("");
    setGiftCardLookup({ status: "idle" });
    setGiftCardAmount("");
  }

  async function checkGiftCardBalance() {
    setGiftCardLookup({ status: "checking" });
    try {
      const response = await fetch(`/api/gift-cards/${encodeURIComponent(giftCardCode)}`);
      const body = await response.json();
      if (!response.ok) {
        setGiftCardLookup({ status: "error", message: body.error });
        return;
      }
      setGiftCardLookup({ status: "found", remainingBalanceCents: body.remainingBalanceCents });
      const suggested = Math.min(body.remainingBalanceCents, remainingBalanceCents);
      setGiftCardAmount((suggested / 100).toFixed(2));
    } catch (error) {
      setGiftCardLookup({ status: "error", message: String(error) });
    }
  }

  function handleConfirmGiftCard() {
    const amountCents = Math.round(Number(giftCardAmount) * 100);
    onRedeemGiftCard({ code: giftCardCode, amountCents });
    setSelectedMethod(null);
    setGiftCardCode("");
    setGiftCardLookup({ status: "idle" });
    setGiftCardAmount("");
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

      {selectedMethod && selectedMethod !== "gift_card" && (
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

      {selectedMethod === "gift_card" && (
        <div>
          {/* 4.9: code entered first, balance shown before an amount is committed */}
          <input
            placeholder="Code du certificat"
            value={giftCardCode}
            onChange={(e) => {
              setGiftCardCode(e.target.value);
              setGiftCardLookup({ status: "idle" });
            }}
            disabled={busy}
          />
          <button onClick={checkGiftCardBalance} disabled={busy || !giftCardCode}>
            Vérifier
          </button>

          {giftCardLookup.status === "found" && (
            <>
              <span> Solde disponible : {formatCents(giftCardLookup.remainingBalanceCents)} </span>
              <input
                placeholder="Montant $"
                type="number"
                step="0.01"
                value={giftCardAmount}
                onChange={(e) => setGiftCardAmount(e.target.value)}
                disabled={busy}
                style={{ width: 90 }}
              />
              <button onClick={handleConfirmGiftCard} disabled={busy || !giftCardAmount}>
                Confirmer
              </button>
            </>
          )}
          {giftCardLookup.status === "error" && (
            <p style={{ color: "#c33" }}>{giftCardLookup.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
