"use client";

import { useState } from "react";
import type { InvoiceWithDetails } from "@/features/invoicing/types";
import type { TipBase, TipDistribution, TipMode } from "@/features/invoicing/tip-calculation";

const TIP_MODES: TipMode[] = ["fixed", "percent"];
const TIP_BASES: TipBase[] = ["pre_tax", "post_tax"];
const TIP_DISTRIBUTIONS: TipDistribution[] = ["proportional", "equal", "manual"];

export interface TipSubmission {
  mode: TipMode;
  amountCents?: number;
  percent?: number;
  base?: TipBase;
  distribution: TipDistribution;
  manualAmounts?: { employeeId: string; amountCents: number }[];
}

interface TipControlProps {
  invoice: InvoiceWithDetails;
  busy: boolean;
  onSubmit: (submission: TipSubmission) => void;
}

// Doc §4.6: fixed amount or percentage (pre/post-tax), distributed
// proportionally, equally, or manually per employee. Presentational + its
// own ephemeral form state — the actual PATCH call and resulting invoice
// state live in the parent CheckoutScreen.
export function TipControl({ invoice, busy, onSubmit }: TipControlProps) {
  const [mode, setMode] = useState<TipMode>("fixed");
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [base, setBase] = useState<TipBase>("pre_tax");
  const [distribution, setDistribution] = useState<TipDistribution>("proportional");
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});

  // Same eligibility rule as setInvoiceTip: service lines with an assigned
  // employee only.
  const eligibleEmployees = invoice.items
    .filter((item) => item.itemType === "service" && item.employeeId)
    .reduce<{ id: string; name: string }[]>((acc, item) => {
      if (!acc.some((employee) => employee.id === item.employeeId)) {
        acc.push({ id: item.employeeId as string, name: item.employeeName ?? (item.employeeId as string) });
      }
      return acc;
    }, []);

  function handleSubmit() {
    if (mode === "fixed") {
      const amountCents = Math.round(Number(amount) * 100);
      onSubmit({
        mode,
        amountCents,
        distribution,
        manualAmounts:
          distribution === "manual"
            ? eligibleEmployees.map((employee) => ({
                employeeId: employee.id,
                amountCents: Math.round(Number(manualAmounts[employee.id] ?? "0") * 100),
              }))
            : undefined,
      });
    } else {
      onSubmit({
        mode,
        percent: Number(percent),
        base,
        distribution,
        manualAmounts:
          distribution === "manual"
            ? eligibleEmployees.map((employee) => ({
                employeeId: employee.id,
                amountCents: Math.round(Number(manualAmounts[employee.id] ?? "0") * 100),
              }))
            : undefined,
      });
    }
  }

  const canSubmit = mode === "fixed" ? amount !== "" : percent !== "";

  return (
    <div>
      <select value={mode} onChange={(e) => setMode(e.target.value as TipMode)} disabled={busy}>
        {TIP_MODES.map((m) => (
          <option key={m} value={m}>
            {m === "fixed" ? "Montant fixe" : "Pourcentage"}
          </option>
        ))}
      </select>

      {mode === "fixed" ? (
        <input
          placeholder="Montant $"
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
          style={{ width: 90 }}
        />
      ) : (
        <>
          <input
            placeholder="Pourcentage"
            type="number"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            disabled={busy}
            style={{ width: 80 }}
          />
          <select value={base} onChange={(e) => setBase(e.target.value as TipBase)} disabled={busy}>
            {TIP_BASES.map((b) => (
              <option key={b} value={b}>
                {b === "pre_tax" ? "Avant taxes" : "Après taxes"}
              </option>
            ))}
          </select>
        </>
      )}

      <select
        value={distribution}
        onChange={(e) => setDistribution(e.target.value as TipDistribution)}
        disabled={busy}
      >
        {TIP_DISTRIBUTIONS.map((d) => (
          <option key={d} value={d}>
            {d === "proportional" ? "Prorata" : d === "equal" ? "Égale" : "Manuelle"}
          </option>
        ))}
      </select>

      <button onClick={handleSubmit} disabled={busy || !canSubmit}>
        Appliquer le pourboire
      </button>

      {distribution === "manual" && (
        <div>
          {eligibleEmployees.map((employee) => (
            <label key={employee.id} style={{ marginRight: "0.5rem" }}>
              {employee.name} :{" "}
              <input
                type="number"
                step="0.01"
                value={manualAmounts[employee.id] ?? ""}
                onChange={(e) => setManualAmounts((prev) => ({ ...prev, [employee.id]: e.target.value }))}
                disabled={busy}
                style={{ width: 80 }}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
