import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { invoiceItems, invoiceItemTaxes, invoices, taxes as taxesTable } from "@/db/schema";
import { getAppointment } from "@/features/appointments/repository";
import type { Appointment } from "@/features/appointments/types";
import {
  AppointmentAlreadyInvoicedError,
  AppointmentNotCompletedError,
  AppointmentNotFoundError,
} from "./errors";
import { generateInvoiceNumber } from "./invoice-number";
import { getMockInvoiceById, mockInvoices, mockTaxes } from "./mock-data";
import { calculateLineTaxes, selectApplicableTaxes } from "./tax-calculation";
import type { InvoiceWithDetails, Tax } from "./types";

// Stand-in for a business/location settings table, which doesn't exist yet.
// Every tax profile in our data (and every worked example in the requis doc)
// is Québec, so this is the only jurisdiction checkout prices against for now.
const DEFAULT_TAX_JURISDICTION = { country: "CA", region: "QC" } as const;

// Single switch point: every screen calls these two functions instead of
// touching mock-data.ts or the Drizzle client directly. Once DATABASE_URL is
// set in .env.local, isDatabaseConfigured flips to true and these start
// hitting Supabase for real — no other file needs to change.

export async function listInvoices(): Promise<InvoiceWithDetails[]> {
  if (!isDatabaseConfigured) {
    return mockInvoices;
  }

  const db = getDb();
  return db.query.invoices.findMany({
    with: {
      items: { with: { taxes: true }, orderBy: (items, { asc }) => asc(items.lineNumber) },
      payments: true,
    },
  });
}

export async function getInvoice(id: string): Promise<InvoiceWithDetails | undefined> {
  if (!isDatabaseConfigured) {
    return getMockInvoiceById(id);
  }

  const db = getDb();
  return db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: {
      items: { with: { taxes: true }, orderBy: (items, { asc }) => asc(items.lineNumber) },
      payments: true,
    },
  });
}

// 4.1 Create a draft invoice from a completed appointment. Every service on
// the appointment becomes an invoice line, priced and taxed on the spot;
// products, discounts and tip are added later in the checkout flow (4.4/4.6),
// not here.
export async function createInvoiceFromAppointment(appointmentId: string): Promise<InvoiceWithDetails> {
  const appointment = await getAppointment(appointmentId);
  if (!appointment) {
    throw new AppointmentNotFoundError(appointmentId);
  }
  if (appointment.status !== "completed") {
    throw new AppointmentNotCompletedError(appointmentId);
  }

  if (!isDatabaseConfigured) {
    const existing = mockInvoices.find((invoice) => invoice.appointmentId === appointmentId);
    if (existing) {
      throw new AppointmentAlreadyInvoicedError(appointmentId, existing.id);
    }
    return createInvoiceFromAppointmentMock(appointment);
  }

  return createInvoiceFromAppointmentReal(appointment);
}

function priceAppointmentServices(appointment: Appointment, taxProfiles: Tax[]) {
  const applicableTaxes = selectApplicableTaxes(taxProfiles, {
    itemType: "service",
    ...DEFAULT_TAX_JURISDICTION,
  });

  return appointment.services.map((service, index) => ({
    lineNumber: index + 1,
    service,
    taxCalc: calculateLineTaxes(service.unitPriceCents, applicableTaxes),
  }));
}

async function createInvoiceFromAppointmentMock(appointment: Appointment): Promise<InvoiceWithDetails> {
  const priced = priceAppointmentServices(appointment, mockTaxes);
  const invoiceNumber = await generateInvoiceNumber();
  const invoiceId = randomUUID();
  const now = new Date();

  const items = priced.map(({ lineNumber, service, taxCalc }) => {
    const itemId = randomUUID();
    return {
      id: itemId,
      invoiceId,
      lineNumber,
      itemType: "service" as const,
      catalogItemId: service.id,
      description: service.description,
      employeeId: service.employeeId,
      employeeName: service.employeeName,
      quantity: 1,
      unitPriceCents: service.unitPriceCents,
      discountType: "none" as const,
      discountAmountCents: 0,
      discountPercentMicros: 0,
      packageRedemptionId: null,
      tipCents: 0,
      subtotalCents: taxCalc.subtotalCents,
      taxAmountCents: taxCalc.taxAmountCents,
      createdAt: now,
      taxes: taxCalc.taxes.map((tax) => ({
        id: randomUUID(),
        invoiceItemId: itemId,
        taxId: tax.taxId,
        taxName: tax.taxName,
        taxRateMicros: tax.taxRateMicros,
        calculationOrder: tax.calculationOrder,
        taxAmountCents: tax.taxAmountCents,
      })),
    };
  });

  const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  const taxTotalCents = items.reduce((sum, item) => sum + item.taxAmountCents, 0);

  const invoice: InvoiceWithDetails = {
    id: invoiceId,
    invoiceNumber,
    status: "unpaid",
    customerId: appointment.customerId,
    customerName: appointment.customerName,
    appointmentId: appointment.id,
    subtotalCents,
    taxTotalCents,
    tipCents: 0,
    totalCents: subtotalCents + taxTotalCents,
    notesInternal: null,
    notesCustomer: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    voidedAt: null,
    items,
    payments: [],
  };

  mockInvoices.push(invoice);
  return invoice;
}

async function createInvoiceFromAppointmentReal(appointment: Appointment): Promise<InvoiceWithDetails> {
  const db = getDb();

  const existing = await db.query.invoices.findFirst({
    where: eq(invoices.appointmentId, appointment.id),
  });
  if (existing) {
    throw new AppointmentAlreadyInvoicedError(appointment.id, existing.id);
  }

  const taxProfiles = await db.select().from(taxesTable);
  const priced = priceAppointmentServices(appointment, taxProfiles);
  const invoiceNumber = await generateInvoiceNumber();

  const subtotalCents = priced.reduce((sum, p) => sum + p.taxCalc.subtotalCents, 0);
  const taxTotalCents = priced.reduce((sum, p) => sum + p.taxCalc.taxAmountCents, 0);

  let createdInvoiceId: string;
  try {
    createdInvoiceId = await db.transaction(async (tx) => {
      const [insertedInvoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          status: "unpaid",
          customerId: appointment.customerId,
          customerName: appointment.customerName,
          appointmentId: appointment.id,
          subtotalCents,
          taxTotalCents,
          tipCents: 0,
          totalCents: subtotalCents + taxTotalCents,
        })
        .returning({ id: invoices.id });

      const insertedItems = await tx
        .insert(invoiceItems)
        .values(
          priced.map(({ lineNumber, service, taxCalc }) => ({
            invoiceId: insertedInvoice.id,
            lineNumber,
            itemType: "service" as const,
            catalogItemId: service.id,
            description: service.description,
            employeeId: service.employeeId,
            employeeName: service.employeeName,
            quantity: 1,
            unitPriceCents: service.unitPriceCents,
            subtotalCents: taxCalc.subtotalCents,
            taxAmountCents: taxCalc.taxAmountCents,
          }))
        )
        .returning({ id: invoiceItems.id, lineNumber: invoiceItems.lineNumber });

      const itemTaxRows = priced.flatMap(({ lineNumber, taxCalc }) => {
        const insertedItem = insertedItems.find((item) => item.lineNumber === lineNumber);
        if (!insertedItem) {
          throw new Error(`No inserted invoice_item found for line ${lineNumber}`);
        }
        return taxCalc.taxes.map((tax) => ({
          invoiceItemId: insertedItem.id,
          taxId: tax.taxId,
          taxName: tax.taxName,
          taxRateMicros: tax.taxRateMicros,
          calculationOrder: tax.calculationOrder,
          taxAmountCents: tax.taxAmountCents,
        }));
      });

      if (itemTaxRows.length > 0) {
        await tx.insert(invoiceItemTaxes).values(itemTaxRows);
      }

      return insertedInvoice.id;
    });
  } catch (error) {
    // Race against another concurrent checkout of the same appointment: the
    // `existing` check above passed for both requests, then both reached the
    // insert. invoices_appointment_id_key (db/schema.ts) is what actually
    // stops the duplicate row; this just translates its failure into the
    // same clean domain error the pre-check above throws.
    if (isUniqueViolation(error, "invoices_appointment_id_key")) {
      const winner = await db.query.invoices.findFirst({
        where: eq(invoices.appointmentId, appointment.id),
      });
      if (winner) {
        throw new AppointmentAlreadyInvoicedError(appointment.id, winner.id);
      }
    }
    throw error;
  }

  const created = await getInvoice(createdInvoiceId);
  if (!created) {
    throw new Error(`Invoice ${createdInvoiceId} was created but could not be re-fetched`);
  }
  return created;
}

function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint_name" in error &&
    error.constraint_name === constraintName
  );
}