"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/utils/currency";

interface CreatedInvoice {
  invoiceNumber: string;
  totalCents: number;
}

// Stands in for the "Procéder au paiement" button the real calendar UI will
// have (requis doc 4.1) — we don't own that UI, this just exercises
// POST /api/invoices so the flow is checkable end to end from this page.
//
// Shows the created invoice from this call's own response rather than
// relying on router.refresh() to re-fetch it: in mock mode, this route
// handler and the page's Server Component are separate module graphs in
// dev (confirmed — a repeat click here correctly gets 409 already-invoiced,
// proving this route keeps its own state, while the page's own read never
// sees it). That gap disappears once DATABASE_URL is set, since both sides
// then query the same real row — router.refresh() is kept below for that case.
export function CheckoutButton({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "done"; invoice: CreatedInvoice }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function handleClick() {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const body = await response.json();
      if (!response.ok) {
        setState({ status: "error", message: `${response.status}: ${body.error}` });
        return;
      }
      setState({ status: "done", invoice: body });
      router.refresh();
    } catch (error) {
      setState({ status: "error", message: String(error) });
    }
  }

  if (state.status === "done") {
    return (
      <span style={{ color: "#1a4" }}>
        {state.invoice.invoiceNumber} créée ({formatCents(state.invoice.totalCents)})
      </span>
    );
  }

  return (
    <div>
      <button onClick={handleClick} disabled={state.status === "loading"}>
        {state.status === "loading" ? "Création..." : "Procéder au paiement"}
      </button>
      {state.status === "error" && (
        <p style={{ color: "#c33", fontSize: "0.85rem" }}>{state.message}</p>
      )}
    </div>
  );
}
