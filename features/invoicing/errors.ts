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
