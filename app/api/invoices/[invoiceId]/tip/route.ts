import { NextResponse } from "next/server";
import {
  InvalidTipDistributionError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
  NoTipEligibleLinesError,
} from "@/features/invoicing/errors";
import { setInvoiceTip, type SetInvoiceTipInput } from "@/features/invoicing/repository";
import type { ManualTipAmount, TipBase, TipDistribution, TipMode } from "@/features/invoicing/tip-calculation";

const TIP_MODES: TipMode[] = ["fixed", "percent"];
const TIP_BASES: TipBase[] = ["pre_tax", "post_tax"];
const TIP_DISTRIBUTIONS: TipDistribution[] = ["proportional", "equal", "manual"];

// PATCH /api/invoices/[invoiceId]/tip — 4.6 "Calcul des pourboires au
// prorata". Replaces the invoice's tip each call (a one-shot calculation —
// see repository.ts's setInvoiceTip comment on why it doesn't auto-reprorate
// if lines change afterward).
export async function PATCH(request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    mode?: unknown;
    amountCents?: unknown;
    percent?: unknown;
    base?: unknown;
    distribution?: unknown;
    manualAmounts?: unknown;
  } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (!TIP_MODES.includes(raw.mode as TipMode)) {
    return NextResponse.json({ error: `mode must be one of: ${TIP_MODES.join(", ")}` }, { status: 400 });
  }
  const mode = raw.mode as TipMode;

  let amountCents: number | undefined;
  if (mode === "fixed") {
    if (typeof raw.amountCents !== "number" || !Number.isInteger(raw.amountCents) || raw.amountCents < 0) {
      return NextResponse.json({ error: "amountCents must be a non-negative integer" }, { status: 400 });
    }
    amountCents = raw.amountCents;
  }

  let percent: number | undefined;
  let base: TipBase | undefined;
  if (mode === "percent") {
    if (typeof raw.percent !== "number" || raw.percent < 0) {
      return NextResponse.json({ error: "percent must be a non-negative number" }, { status: 400 });
    }
    percent = raw.percent;
    if (raw.base !== undefined) {
      if (!TIP_BASES.includes(raw.base as TipBase)) {
        return NextResponse.json({ error: `base must be one of: ${TIP_BASES.join(", ")}` }, { status: 400 });
      }
      base = raw.base as TipBase;
    }
  }

  if (!TIP_DISTRIBUTIONS.includes(raw.distribution as TipDistribution)) {
    return NextResponse.json(
      { error: `distribution must be one of: ${TIP_DISTRIBUTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  const distribution = raw.distribution as TipDistribution;

  let manualAmounts: ManualTipAmount[] | undefined;
  if (distribution === "manual") {
    if (!Array.isArray(raw.manualAmounts) || raw.manualAmounts.length === 0) {
      return NextResponse.json(
        { error: "manualAmounts must be a non-empty array when distribution is 'manual'" },
        { status: 400 }
      );
    }
    manualAmounts = [];
    for (const [index, entry] of raw.manualAmounts.entries()) {
      const item = entry as { employeeId?: unknown; amountCents?: unknown } | null;
      if (typeof item?.employeeId !== "string" || item.employeeId.trim() === "") {
        return NextResponse.json(
          { error: `manualAmounts[${index}].employeeId must be a non-empty string` },
          { status: 400 }
        );
      }
      if (typeof item.amountCents !== "number" || !Number.isInteger(item.amountCents) || item.amountCents < 0) {
        return NextResponse.json(
          { error: `manualAmounts[${index}].amountCents must be a non-negative integer` },
          { status: 400 }
        );
      }
      manualAmounts.push({ employeeId: item.employeeId, amountCents: item.amountCents });
    }
  }

  const input: SetInvoiceTipInput = { mode, amountCents, percent, base, distribution, manualAmounts };

  try {
    const invoice = await setInvoiceTip(invoiceId, input);
    return NextResponse.json(invoice);
  } catch (error) {
    if (error instanceof InvoiceNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvoiceNotEditableError || error instanceof NoTipEligibleLinesError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof InvalidTipDistributionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("setInvoiceTip failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
