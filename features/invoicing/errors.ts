export class AppointmentNotFoundError extends Error {
  constructor(public readonly appointmentId: string) {
    super(`Appointment ${appointmentId} not found`);
    this.name = "AppointmentNotFoundError";
  }
}

export class AppointmentNotCompletedError extends Error {
  constructor(public readonly appointmentId: string) {
    super(`Appointment ${appointmentId} is not completed yet`);
    this.name = "AppointmentNotCompletedError";
  }
}

export class AppointmentAlreadyInvoicedError extends Error {
  constructor(
    public readonly appointmentId: string,
    public readonly existingInvoiceId: string
  ) {
    super(`Appointment ${appointmentId} already has invoice ${existingInvoiceId}`);
    this.name = "AppointmentAlreadyInvoicedError";
  }
}

export class InvoiceNotFoundError extends Error {
  constructor(public readonly invoiceId: string) {
    super(`Invoice ${invoiceId} not found`);
    this.name = "InvoiceNotFoundError";
  }
}

// 7.1: a closed invoice (anything past unpaid) can never be modified
// directly. See features/invoicing/repository.ts EDITABLE_INVOICE_STATUSES
// for exactly which statuses count as open.
export class InvoiceNotEditableError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly status: string
  ) {
    super(`Invoice ${invoiceId} cannot be modified while its status is '${status}'`);
    this.name = "InvoiceNotEditableError";
  }
}

export class InvoiceItemNotFoundError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly itemId: string
  ) {
    super(`Invoice item ${itemId} not found on invoice ${invoiceId}`);
    this.name = "InvoiceItemNotFoundError";
  }
}

export class CatalogItemNotFoundError extends Error {
  constructor(public readonly catalogItemId: string) {
    super(`Catalog item ${catalogItemId} not found`);
    this.name = "CatalogItemNotFoundError";
  }
}

// 4.8: a payment can only be registered while there's still something to
// collect. See features/invoicing/repository.ts PAYABLE_INVOICE_STATUSES
// for exactly which statuses count — not the same set as
// EDITABLE_INVOICE_STATUSES (a partially_paid invoice can't have its lines
// touched, but can still take more payments).
export class InvoiceNotPayableError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly status: string
  ) {
    super(`Invoice ${invoiceId} cannot take a payment while its status is '${status}'`);
    this.name = "InvoiceNotPayableError";
  }
}

// 4.8: "la facture ne passe pas à l'état paid tant que le total des
// paiements n'atteint pas le total de la facture" — the converse also
// holds: a single payment can never push the total past what's owed.
export class PaymentExceedsBalanceError extends Error {
  constructor(
    public readonly invoiceId: string,
    public readonly amountCents: number,
    public readonly remainingBalanceCents: number
  ) {
    super(
      `Payment of ${amountCents} exceeds invoice ${invoiceId}'s remaining balance of ${remainingBalanceCents}`
    );
    this.name = "PaymentExceedsBalanceError";
  }
}
