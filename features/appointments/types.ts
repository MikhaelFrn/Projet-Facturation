// Stand-in contract for the existing calendar/booking module, which we don't
// own and don't have the schema for (open question in the requis doc,
// section 10, #4). This is the shape we need from it to build livrable 2 —
// once the real Appointment API/table is confirmed, only
// features/appointments/repository.ts should need to change.

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export interface AppointmentService {
  id: string; // catalog service id — becomes invoiceItems.catalogItemId
  description: string; // becomes invoiceItems.description (snapshotted on checkout)
  employeeId: string;
  employeeName: string;
  unitPriceCents: number;
}

export interface Appointment {
  id: string;
  status: AppointmentStatus;
  customerId: string;
  customerName: string;
  scheduledAt: string; // ISO 8601
  services: AppointmentService[];
}
