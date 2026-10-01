import { NextResponse } from "next/server";
import {
  AppointmentAlreadyInvoicedError,
  AppointmentNotCompletedError,
  AppointmentNotFoundError,
} from "@/features/invoicing/errors";
import { createInvoiceFromAppointment } from "@/features/invoicing/repository";

// POST /api/invoices — 4.1 "Procéder au paiement": creates a draft invoice
// from a completed appointment. Thin controller: validate the request shape,
// delegate to the service layer, map its domain errors to HTTP status codes.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appointmentId = (body as { appointmentId?: unknown } | null)?.appointmentId;
  if (typeof appointmentId !== "string" || appointmentId.trim() === "") {
    return NextResponse.json({ error: "appointmentId is required" }, { status: 400 });
  }

  try {
    const invoice = await createInvoiceFromAppointment(appointmentId);
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    if (error instanceof AppointmentNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof AppointmentAlreadyInvoicedError) {
      return NextResponse.json(
        { error: error.message, invoiceId: error.existingInvoiceId },
        { status: 409 }
      );
    }
    if (error instanceof AppointmentNotCompletedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }

    console.error("createInvoiceFromAppointment failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
