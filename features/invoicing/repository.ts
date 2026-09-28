import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { invoiceItems, invoiceItemTaxes, invoices, payments } from "@/db/schema";
import { getAppointment } from "@/features/appointments/repository";
import type { Appointment } from "@/features/appointments/types";
import { getCatalogItem } from "@/features/catalog/repository";
import type { CatalogItem } from "@/features/catalog/types";
import { DEFAULT_TAX_JURISDICTION } from "@/features/taxes/calculate";
import { listTaxes } from "@/features/taxes/repository";
import {
  AppointmentAlreadyInvoicedError,
  AppointmentNotCompletedError,
  AppointmentNotFoundError,
  CatalogItemNotFoundError,
  InvoiceItemNotFoundError,
  InvoiceNotEditableError,
  InvoiceNotFoundError,
  InvoiceNotPayableError,
  PaymentExceedsBalanceError,
} from "./errors";
import { generateInvoiceNumber } from "./invoice-number";
import { getMockInvoiceById, mockInvoices } from "./mock-data";
import {
  calculateLineTaxes,
  computeLineGrossAmountCents,
  selectApplicableTaxes,
  taxRateInputsFromSnapshot,
  type LineTaxCalculation,
} from "./tax-calculation";
import type {
  DiscountType,
  InvoiceItem,
  InvoiceItemTax,
  InvoiceStatus,
  InvoiceWithDetails,
  Payment,
  PaymentMethod,
  Tax,
} from "./types";

// 7.1: a closed invoice can never be modified directly. Extended past the
// doc's literal "paid" example to partially_paid too — editing a line after
// any payment exists would silently invalidate the "solde restant" math
// against that payment.
const EDITABLE_INVOICE_STATUSES: InvoiceStatus[] = ["draft", "unpaid"];

function assertInvoiceEditable(invoice: { id: string; status: InvoiceStatus }): void {
  if (!EDITABLE_INVOICE_STATUSES.includes(invoice.status)) {
    throw new InvoiceNotEditableError(invoice.id, invoice.status);
  }
}

// 4.8: distinct from EDITABLE_INVOICE_STATUSES — a partially_paid invoice
// can't have its lines touched anymore, but must still be able to take more
// payments (that's the whole point of a split payment). draft is excluded:
// nothing to collect on an invoice that hasn't been submitted yet.
const PAYABLE_INVOICE_STATUSES: InvoiceStatus[] = ["unpaid", "partially_paid"];

function assertInvoicePayable(invoice: { id: string; status: InvoiceStatus }): void {
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status)) {
    throw new InvoiceNotPayableError(invoice.id, invoice.status);
  }
}

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
  const taxProfiles = await listTaxes();
  const priced = priceAppointmentServices(appointment, taxProfiles);
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
        taxIncludedInPrice: tax.taxIncludedInPrice,
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

  const taxProfiles = await listTaxes();
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
          taxIncludedInPrice: tax.taxIncludedInPrice,
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

// Unwraps the `tx` parameter type from db.transaction's callback, so the
// recompute helper below can be typed without importing drizzle's internal
// transaction type by name.
type InvoicingTx = Parameters<ReturnType<typeof getDb>["transaction"]>[0] extends (
  tx: infer T,
  ...args: never[]
) => unknown
  ? T
  : never;

// Shared by addInvoiceItem/updateInvoiceItem/removeInvoiceItem (4.4): always
// re-sums straight from invoice_items rather than adjusting the invoice's
// existing totals incrementally, so a drift never compounds.
async function recalculateInvoiceTotalsReal(tx: InvoicingTx, invoiceId: string): Promise<void> {
  const items = await tx
    .select({ subtotalCents: invoiceItems.subtotalCents, taxAmountCents: invoiceItems.taxAmountCents })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId));

  const subtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);
  const taxTotalCents = items.reduce((sum, item) => sum + item.taxAmountCents, 0);

  const [invoiceRow] = await tx
    .select({ tipCents: invoices.tipCents })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  await tx
    .update(invoices)
    .set({
      subtotalCents,
      taxTotalCents,
      totalCents: subtotalCents + taxTotalCents + (invoiceRow?.tipCents ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, invoiceId));
}

function recalculateMockInvoiceTotals(invoice: InvoiceWithDetails): void {
  invoice.subtotalCents = invoice.items.reduce((sum, item) => sum + item.subtotalCents, 0);
  invoice.taxTotalCents = invoice.items.reduce((sum, item) => sum + item.taxAmountCents, 0);
  invoice.totalCents = invoice.subtotalCents + invoice.taxTotalCents + invoice.tipCents;
  invoice.updatedAt = new Date();
}

export interface AddInvoiceItemInput {
  catalogItemId: string;
  quantity: number;
  employeeId?: string | null;
  employeeName?: string | null;
}

// 4.4: search-and-add a product/service to an existing (open) invoice.
export async function addInvoiceItem(
  invoiceId: string,
  input: AddInvoiceItemInput
): Promise<InvoiceWithDetails> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  assertInvoiceEditable(invoice);

  const catalogItem = await getCatalogItem(input.catalogItemId);
  if (!catalogItem || !catalogItem.active) {
    throw new CatalogItemNotFoundError(input.catalogItemId);
  }

  if (!isDatabaseConfigured) {
    return addInvoiceItemMock(invoice, catalogItem, input);
  }
  return addInvoiceItemReal(invoiceId, catalogItem, input);
}

function priceNewLine(catalogItem: CatalogItem, quantity: number, taxProfiles: Tax[]) {
  const applicableTaxes = selectApplicableTaxes(taxProfiles, {
    itemType: catalogItem.itemType,
    ...DEFAULT_TAX_JURISDICTION,
    taxExempt: catalogItem.taxExempt,
  });
  const grossAmountCents = computeLineGrossAmountCents({
    quantity,
    unitPriceCents: catalogItem.unitPriceCents,
    discountType: "none",
    discountAmountCents: 0,
    discountPercentMicros: 0,
  });
  return calculateLineTaxes(grossAmountCents, applicableTaxes);
}

async function addInvoiceItemMock(
  invoice: InvoiceWithDetails,
  catalogItem: CatalogItem,
  input: AddInvoiceItemInput
): Promise<InvoiceWithDetails> {
  const taxProfiles = await listTaxes();
  const taxCalc = priceNewLine(catalogItem, input.quantity, taxProfiles);
  const nextLineNumber = Math.max(0, ...invoice.items.map((item) => item.lineNumber)) + 1;
  const itemId = randomUUID();
  const now = new Date();

  const newItem: InvoiceItem & { taxes: InvoiceItemTax[] } = {
    id: itemId,
    invoiceId: invoice.id,
    lineNumber: nextLineNumber,
    itemType: catalogItem.itemType,
    catalogItemId: catalogItem.id,
    description: catalogItem.name,
    employeeId: input.employeeId ?? null,
    employeeName: input.employeeName ?? null,
    quantity: input.quantity,
    unitPriceCents: catalogItem.unitPriceCents,
    discountType: "none",
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
      taxIncludedInPrice: tax.taxIncludedInPrice,
      calculationOrder: tax.calculationOrder,
      taxAmountCents: tax.taxAmountCents,
    })),
  };

  invoice.items.push(newItem);
  recalculateMockInvoiceTotals(invoice);
  return invoice;
}

async function addInvoiceItemReal(
  invoiceId: string,
  catalogItem: CatalogItem,
  input: AddInvoiceItemInput
): Promise<InvoiceWithDetails> {
  const db = getDb();

  const taxProfiles = await listTaxes();
  const taxCalc = priceNewLine(catalogItem, input.quantity, taxProfiles);

  await db.transaction(async (tx) => {
    const existingItems = await tx
      .select({ lineNumber: invoiceItems.lineNumber })
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId));
    const nextLineNumber = Math.max(0, ...existingItems.map((item) => item.lineNumber)) + 1;

    const [insertedItem] = await tx
      .insert(invoiceItems)
      .values({
        invoiceId,
        lineNumber: nextLineNumber,
        itemType: catalogItem.itemType,
        catalogItemId: catalogItem.id,
        description: catalogItem.name,
        employeeId: input.employeeId ?? null,
        employeeName: input.employeeName ?? null,
        quantity: input.quantity,
        unitPriceCents: catalogItem.unitPriceCents,
        subtotalCents: taxCalc.subtotalCents,
        taxAmountCents: taxCalc.taxAmountCents,
      })
      .returning({ id: invoiceItems.id });

    if (taxCalc.taxes.length > 0) {
      await tx.insert(invoiceItemTaxes).values(
        taxCalc.taxes.map((tax) => ({
          invoiceItemId: insertedItem.id,
          taxId: tax.taxId,
          taxName: tax.taxName,
          taxRateMicros: tax.taxRateMicros,
          taxIncludedInPrice: tax.taxIncludedInPrice,
          calculationOrder: tax.calculationOrder,
          taxAmountCents: tax.taxAmountCents,
        }))
      );
    }

    await recalculateInvoiceTotalsReal(tx, invoiceId);
  });

  const updated = await getInvoice(invoiceId);
  if (!updated) {
    throw new Error(`Invoice ${invoiceId} disappeared after adding a line`);
  }
  return updated;
}

export interface UpdateInvoiceItemInput {
  quantity?: number;
  discountType?: DiscountType;
  discountAmountCents?: number;
  discountPercentMicros?: number;
}

interface ResolvedLineUpdate {
  quantity: number;
  discountType: DiscountType;
  discountAmountCents: number;
  discountPercentMicros: number;
  taxCalc: LineTaxCalculation;
}

// 4.4: change a line's quantity and/or discount on an open invoice. Reprices
// against the SAME taxes that applied when the line was added (taxRateInputsFromSnapshot),
// not whatever the taxes table says today — see db/schema.ts's
// taxIncludedInPrice comment for why that distinction matters.
export async function updateInvoiceItem(
  invoiceId: string,
  itemId: string,
  input: UpdateInvoiceItemInput
): Promise<InvoiceWithDetails> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  assertInvoiceEditable(invoice);

  const currentItem = invoice.items.find((item) => item.id === itemId);
  if (!currentItem) {
    throw new InvoiceItemNotFoundError(invoiceId, itemId);
  }

  const quantity = input.quantity ?? currentItem.quantity;
  const discountType = input.discountType ?? currentItem.discountType;
  // Switching discount type clears the field that no longer applies, rather
  // than leaving a stale amount/percent sitting unused on the row.
  const discountAmountCents =
    discountType === "amount" ? (input.discountAmountCents ?? currentItem.discountAmountCents) : 0;
  const discountPercentMicros =
    discountType === "percent" ? (input.discountPercentMicros ?? currentItem.discountPercentMicros) : 0;

  const grossAmountCents = computeLineGrossAmountCents({
    quantity,
    unitPriceCents: currentItem.unitPriceCents,
    discountType,
    discountAmountCents,
    discountPercentMicros,
  });
  const taxCalc = calculateLineTaxes(grossAmountCents, taxRateInputsFromSnapshot(currentItem.taxes));

  const resolved: ResolvedLineUpdate = { quantity, discountType, discountAmountCents, discountPercentMicros, taxCalc };

  if (!isDatabaseConfigured) {
    return updateInvoiceItemMock(invoice, currentItem, resolved);
  }
  return updateInvoiceItemReal(invoiceId, itemId, resolved);
}

function updateInvoiceItemMock(
  invoice: InvoiceWithDetails,
  item: InvoiceItem & { taxes: InvoiceItemTax[] },
  next: ResolvedLineUpdate
): InvoiceWithDetails {
  item.quantity = next.quantity;
  item.discountType = next.discountType;
  item.discountAmountCents = next.discountAmountCents;
  item.discountPercentMicros = next.discountPercentMicros;
  item.subtotalCents = next.taxCalc.subtotalCents;
  item.taxAmountCents = next.taxCalc.taxAmountCents;
  item.taxes = next.taxCalc.taxes.map((tax) => ({
    id: randomUUID(),
    invoiceItemId: item.id,
    taxId: tax.taxId,
    taxName: tax.taxName,
    taxRateMicros: tax.taxRateMicros,
    taxIncludedInPrice: tax.taxIncludedInPrice,
    calculationOrder: tax.calculationOrder,
    taxAmountCents: tax.taxAmountCents,
  }));

  recalculateMockInvoiceTotals(invoice);
  return invoice;
}

async function updateInvoiceItemReal(
  invoiceId: string,
  itemId: string,
  next: ResolvedLineUpdate
): Promise<InvoiceWithDetails> {
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .update(invoiceItems)
      .set({
        quantity: next.quantity,
        discountType: next.discountType,
        discountAmountCents: next.discountAmountCents,
        discountPercentMicros: next.discountPercentMicros,
        subtotalCents: next.taxCalc.subtotalCents,
        taxAmountCents: next.taxCalc.taxAmountCents,
      })
      .where(eq(invoiceItems.id, itemId));

    await tx.delete(invoiceItemTaxes).where(eq(invoiceItemTaxes.invoiceItemId, itemId));

    if (next.taxCalc.taxes.length > 0) {
      await tx.insert(invoiceItemTaxes).values(
        next.taxCalc.taxes.map((tax) => ({
          invoiceItemId: itemId,
          taxId: tax.taxId,
          taxName: tax.taxName,
          taxRateMicros: tax.taxRateMicros,
          taxIncludedInPrice: tax.taxIncludedInPrice,
          calculationOrder: tax.calculationOrder,
          taxAmountCents: tax.taxAmountCents,
        }))
      );
    }

    await recalculateInvoiceTotalsReal(tx, invoiceId);
  });

  const updated = await getInvoice(invoiceId);
  if (!updated) {
    throw new Error(`Invoice ${invoiceId} disappeared after updating a line`);
  }
  return updated;
}

// 4.4: "Possibilité de supprimer une ligne (tant que la facture n'est pas
// fermée)". Line numbers are left with gaps after a removal rather than
// renumbered — nothing depends on them being contiguous, and renumbering
// would just be extra writes for no benefit.
export async function removeInvoiceItem(invoiceId: string, itemId: string): Promise<InvoiceWithDetails> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) {
    throw new InvoiceNotFoundError(invoiceId);
  }
  assertInvoiceEditable(invoice);

  const itemIndex = invoice.items.findIndex((item) => item.id === itemId);
  if (itemIndex === -1) {
    throw new InvoiceItemNotFoundError(invoiceId, itemId);
  }

  if (!isDatabaseConfigured) {
    invoice.items.splice(itemIndex, 1);
    recalculateMockInvoiceTotals(invoice);
    return invoice;
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    // invoice_item_taxes rows cascade with the invoice_items row (db/schema.ts).
    await tx.delete(invoiceItems).where(eq(invoiceItems.id, itemId));
    await recalculateInvoiceTotalsReal(tx, invoiceId);
  });

  const updated = await getInvoice(invoiceId);
  if (!updated) {
    throw new Error(`Invoice ${invoiceId} disappeared after removing a line`);
  }
  return updated;
}

export interface RecordPaymentInput {
  method: PaymentMethod;
  amountCents: number;
  // cash/interac only — validated at the route layer, trusted here.
  amountTenderedCents?: number | null;
  reference?: string | null;
}

// 4.7/4.8: register one payment (of possibly several — split payment) on an
// open invoice. Recomputes status from the actual sum of completed payments
// rather than incrementing a counter, same "never trust a running total"
// principle as recalculateInvoiceTotalsReal/Mock for line totals.
export async function recordPayment(
  invoiceId: string,
  input: RecordPaymentInput
): Promise<InvoiceWithDetails> {
  if (!isDatabaseConfigured) {
    const invoice = await getInvoice(invoiceId);
    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    return recordPaymentMock(invoice, input);
  }

  return recordPaymentReal(invoiceId, input);
}

function recordPaymentMock(invoice: InvoiceWithDetails, input: RecordPaymentInput): InvoiceWithDetails {
  assertInvoicePayable(invoice);

  const paidSoFar = invoice.payments
    .filter((payment) => payment.status === "completed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingBalanceCents = invoice.totalCents - paidSoFar;

  if (input.amountCents > remainingBalanceCents) {
    throw new PaymentExceedsBalanceError(invoice.id, input.amountCents, remainingBalanceCents);
  }

  const now = new Date();
  const changeGivenCents =
    input.amountTenderedCents != null ? input.amountTenderedCents - input.amountCents : null;
  const nextStatus: InvoiceStatus =
    paidSoFar + input.amountCents >= invoice.totalCents ? "paid" : "partially_paid";

  const payment: Payment = {
    id: randomUUID(),
    invoiceId: invoice.id,
    method: input.method,
    status: "completed",
    amountCents: input.amountCents,
    amountTenderedCents: input.amountTenderedCents ?? null,
    changeGivenCents,
    reference: input.reference ?? null,
    createdAt: now,
  };

  invoice.payments.push(payment);
  invoice.status = nextStatus;
  if (nextStatus === "paid") {
    invoice.paidAt = now;
  }
  invoice.updatedAt = now;

  return invoice;
}

async function recordPaymentReal(
  invoiceId: string,
  input: RecordPaymentInput
): Promise<InvoiceWithDetails> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    // Locks the invoice row for the rest of this transaction: a second
    // concurrent payment on the same invoice blocks here until this one
    // commits, so two payments can never both read the same "before"
    // balance and together overshoot the invoice total.
    const [invoiceRow] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for("update");
    if (!invoiceRow) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    assertInvoicePayable(invoiceRow);

    const existingPayments = await tx
      .select({ amountCents: payments.amountCents, status: payments.status })
      .from(payments)
      .where(eq(payments.invoiceId, invoiceId));
    const paidSoFar = existingPayments
      .filter((payment) => payment.status === "completed")
      .reduce((sum, payment) => sum + payment.amountCents, 0);
    const remainingBalanceCents = invoiceRow.totalCents - paidSoFar;

    if (input.amountCents > remainingBalanceCents) {
      throw new PaymentExceedsBalanceError(invoiceId, input.amountCents, remainingBalanceCents);
    }

    const changeGivenCents =
      input.amountTenderedCents != null ? input.amountTenderedCents - input.amountCents : null;
    const nextStatus: InvoiceStatus =
      paidSoFar + input.amountCents >= invoiceRow.totalCents ? "paid" : "partially_paid";

    await tx.insert(payments).values({
      invoiceId,
      method: input.method,
      status: "completed",
      amountCents: input.amountCents,
      amountTenderedCents: input.amountTenderedCents ?? null,
      changeGivenCents,
      reference: input.reference ?? null,
    });

    const updateFields: Partial<typeof invoices.$inferInsert> = { status: nextStatus, updatedAt: now };
    if (nextStatus === "paid") {
      updateFields.paidAt = now;
    }
    await tx.update(invoices).set(updateFields).where(eq(invoices.id, invoiceId));
  });

  const updated = await getInvoice(invoiceId);
  if (!updated) {
    throw new Error(`Invoice ${invoiceId} disappeared after recording a payment`);
  }
  return updated;
}