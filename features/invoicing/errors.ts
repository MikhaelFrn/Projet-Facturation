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
