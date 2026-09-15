import type { Appointment } from "./types";

// appt-1 matches the requis doc's own worked example (section 4.1/4.5:
// Nathalie/Facial hydratant 60$, Joanie/Pédicure relaxante 40$) and is the
// appointment behind mockInvoicePaid in features/invoicing/mock-data.ts —
// already checked out, useful for testing the idempotency guard (task 6).
// appt-2 is still "completed" but not yet invoiced — the one to actually
// exercise "Procéder au paiement" against. appt-3 isn't completed yet, to
// exercise the "can't check out an appointment that isn't done" rule.

export const mockAppointments: Appointment[] = [
  {
    id: "appt-1",
    status: "completed",
    customerId: "customer-marie-tremblay",
    customerName: "Marie Tremblay",
    scheduledAt: "2026-08-05T14:00:00Z",
    services: [
      {
        id: "service-facial-hydratant",
        description: "Facial hydratant",
        employeeId: "employee-nathalie",
        employeeName: "Nathalie",
        unitPriceCents: 6000,
      },
      {
        id: "service-pedicure-relaxante",
        description: "Pédicure relaxante",
        employeeId: "employee-joanie",
        employeeName: "Joanie",
        unitPriceCents: 4000,
      },
    ],
  },
  {
    id: "appt-2",
    status: "completed",
    customerId: "customer-sophie-bergeron",
    customerName: "Sophie Bergeron",
    scheduledAt: "2026-08-24T10:30:00Z",
    services: [
      {
        id: "service-manucure",
        description: "Manucure",
        employeeId: "employee-joanie",
        employeeName: "Joanie",
        unitPriceCents: 3500,
      },
    ],
  },
  {
    id: "appt-3",
    status: "scheduled",
    customerId: "customer-julie-caron",
    customerName: "Julie Caron",
    scheduledAt: "2026-09-20T16:00:00Z",
    services: [
      {
        id: "service-massage-suedois",
        description: "Massage suédois",
        employeeId: "employee-nathalie",
        employeeName: "Nathalie",
        unitPriceCents: 8000,
      },
    ],
  },
];

export function getMockAppointmentById(id: string): Appointment | undefined {
  return mockAppointments.find((appointment) => appointment.id === id);
}
