"use client";

import { useState } from "react";
import type { Tax, TaxAppliesTo } from "@/features/taxes/types";

const APPLIES_TO_OPTIONS: TaxAppliesTo[] = ["both", "services", "products"];

// Dev-harness stand-in for livrable 10's real "Paramètres > Taxes" screen.
// Same reasoning as InvoiceLineEditor: keeps its own state, updated from
// each call's own response rather than a page refresh (mock-mode module
// isolation — see the note under the top banner).
export function TaxSettingsPanel({ initialTaxes }: { initialTaxes: Tax[] }) {
  const [taxes, setTaxes] = useState(initialTaxes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [country, setCountry] = useState("CA");
  const [region, setRegion] = useState("");
  const [appliesTo, setAppliesTo] = useState<TaxAppliesTo>("both");

  async function toggleActive(tax: Tax) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/taxes/${tax.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !tax.active }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(`${response.status}: ${body.error}`);
        return;
      }
      setTaxes((prev) => prev.map((t) => (t.id === tax.id ? body : t)));
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/taxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ratePercent: Number(ratePercent),
          country,
          region: region.trim() === "" ? null : region,
          appliesTo,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(`${response.status}: ${body.error}`);
        return;
      }
      setTaxes((prev) => [...prev, body]);
      setName("");
      setRatePercent("");
      setRegion("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th>Nom</th>
            <th>Taux</th>
            <th>Pays/Région</th>
            <th>S&apos;applique sur</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {taxes.map((tax) => (
            <tr key={tax.id}>
              <td>{tax.name}</td>
              <td>{(tax.rateMicros / 10_000).toFixed(3)} %</td>
              <td>
                {tax.country} / {tax.region ?? "Toutes"}
              </td>
              <td>{tax.appliesTo}</td>
              <td>
                <input
                  type="checkbox"
                  checked={tax.active}
                  disabled={busy}
                  onChange={() => toggleActive(tax)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: "0.5rem" }}>
        <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        <input
          placeholder="Taux %"
          type="number"
          step="0.001"
          value={ratePercent}
          onChange={(e) => setRatePercent(e.target.value)}
          disabled={busy}
          style={{ width: 80 }}
        />
        <input
          placeholder="Pays"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          disabled={busy}
          style={{ width: 50 }}
        />
        <input
          placeholder="Région (vide = toutes)"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          disabled={busy}
        />
        <select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as TaxAppliesTo)} disabled={busy}>
          {APPLIES_TO_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button onClick={handleAdd} disabled={busy || !name || !ratePercent}>
          Ajouter
        </button>
      </div>

      {error && <p style={{ color: "#c33" }}>{error}</p>}
    </div>
  );
}
