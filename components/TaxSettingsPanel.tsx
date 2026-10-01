"use client";

import { useState } from "react";
import type { Tax, TaxAppliesTo } from "@/features/taxes/types";

const APPLIES_TO_OPTIONS: TaxAppliesTo[] = ["both", "services", "products"];

interface EditDraft {
  name: string;
  ratePercent: string;
  country: string;
  region: string;
  appliesTo: TaxAppliesTo;
  includedInPrice: boolean;
  calculationOrder: string;
}

// Livrable 10's real "Paramètres > Taxes" screen (doc §5 / Écran 2). Keeps
// its own state, updated from each call's own response rather than a page
// refresh — same mock-mode module-isolation reasoning as CheckoutScreen (see
// the note under the page's top banner).
export function TaxSettingsPanel({ initialTaxes }: { initialTaxes: Tax[] }) {
  const [taxes, setTaxes] = useState(initialTaxes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ratePercent, setRatePercent] = useState("");
  const [country, setCountry] = useState("CA");
  const [region, setRegion] = useState("");
  const [appliesTo, setAppliesTo] = useState<TaxAppliesTo>("both");
  const [includedInPrice, setIncludedInPrice] = useState(false);
  const [calculationOrder, setCalculationOrder] = useState("1");

  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

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
          includedInPrice,
          calculationOrder: Number(calculationOrder),
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
      setIncludedInPrice(false);
      setCalculationOrder("1");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(tax: Tax) {
    setEditingTaxId(tax.id);
    setEditDraft({
      name: tax.name,
      ratePercent: String(tax.rateMicros / 10_000),
      country: tax.country,
      region: tax.region ?? "",
      appliesTo: tax.appliesTo,
      includedInPrice: tax.includedInPrice,
      calculationOrder: String(tax.calculationOrder),
    });
  }

  function cancelEdit() {
    setEditingTaxId(null);
    setEditDraft(null);
  }

  async function saveEdit(taxId: string) {
    if (!editDraft) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/taxes/${taxId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name,
          ratePercent: Number(editDraft.ratePercent),
          country: editDraft.country,
          region: editDraft.region.trim() === "" ? null : editDraft.region,
          appliesTo: editDraft.appliesTo,
          includedInPrice: editDraft.includedInPrice,
          calculationOrder: Number(editDraft.calculationOrder),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(`${response.status}: ${body.error}`);
        return;
      }
      setTaxes((prev) => prev.map((t) => (t.id === taxId ? body : t)));
      setEditingTaxId(null);
      setEditDraft(null);
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
            <th>Incluse dans le prix</th>
            <th>Ordre de calcul</th>
            <th>Active</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {taxes.map((tax) => {
            const isEditing = editingTaxId === tax.id;

            if (isEditing && editDraft) {
              return (
                <tr key={tax.id}>
                  <td>
                    <input
                      value={editDraft.name}
                      disabled={busy}
                      style={{ width: 90 }}
                      onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.001"
                      value={editDraft.ratePercent}
                      disabled={busy}
                      style={{ width: 70 }}
                      onChange={(e) => setEditDraft({ ...editDraft, ratePercent: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      placeholder="Pays"
                      value={editDraft.country}
                      disabled={busy}
                      style={{ width: 50 }}
                      onChange={(e) => setEditDraft({ ...editDraft, country: e.target.value })}
                    />
                    <input
                      placeholder="Région (vide = toutes)"
                      value={editDraft.region}
                      disabled={busy}
                      style={{ width: 110 }}
                      onChange={(e) => setEditDraft({ ...editDraft, region: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={editDraft.appliesTo}
                      disabled={busy}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, appliesTo: e.target.value as TaxAppliesTo })
                      }
                    >
                      {APPLIES_TO_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={editDraft.includedInPrice}
                      disabled={busy}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, includedInPrice: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="1"
                      value={editDraft.calculationOrder}
                      disabled={busy}
                      style={{ width: 50 }}
                      onChange={(e) =>
                        setEditDraft({ ...editDraft, calculationOrder: e.target.value })
                      }
                    />
                  </td>
                  <td>
                    <input type="checkbox" checked={tax.active} disabled />
                  </td>
                  <td>
                    <button disabled={busy} onClick={() => saveEdit(tax.id)}>
                      Enregistrer
                    </button>
                    <button disabled={busy} onClick={cancelEdit}>
                      Annuler
                    </button>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={tax.id}>
                <td>{tax.name}</td>
                <td>{(tax.rateMicros / 10_000).toFixed(3)} %</td>
                <td>
                  {tax.country} / {tax.region ?? "Toutes"}
                </td>
                <td>{tax.appliesTo}</td>
                <td>{tax.includedInPrice ? "Oui" : "Non"}</td>
                <td>{tax.calculationOrder}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={tax.active}
                    disabled={busy}
                    onChange={() => toggleActive(tax)}
                  />
                </td>
                <td>
                  <button disabled={busy || editingTaxId !== null} onClick={() => startEdit(tax)}>
                    Modifier
                  </button>
                </td>
              </tr>
            );
          })}
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
        <label style={{ marginLeft: "0.5rem" }}>
          <input
            type="checkbox"
            checked={includedInPrice}
            onChange={(e) => setIncludedInPrice(e.target.checked)}
            disabled={busy}
          />{" "}
          Incluse dans le prix
        </label>
        <input
          type="number"
          step="1"
          value={calculationOrder}
          onChange={(e) => setCalculationOrder(e.target.value)}
          disabled={busy}
          style={{ width: 50, marginLeft: "0.5rem" }}
          title="Ordre de calcul"
        />
        <button onClick={handleAdd} disabled={busy || !name || !ratePercent}>
          + Ajouter
        </button>
      </div>

      {error && <p style={{ color: "#c33" }}>{error}</p>}
    </div>
  );
}
