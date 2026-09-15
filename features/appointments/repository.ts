import { getMockAppointmentById, mockAppointments } from "./mock-data";
import type { Appointment } from "./types";

// The calendar/booking module lives outside this codebase (see types.ts).
// Until its real API or DB table is confirmed, this always resolves against
// mock data — there's no isDatabaseConfigured branch here because we don't
// own that data source, unlike features/invoicing/repository.ts.
export async function getAppointment(id: string): Promise<Appointment | undefined> {
  return getMockAppointmentById(id);
}

// Dev-harness only (app/page.tsx) — the real calendar UI lists its own
// appointments; we just need something to point "Procéder au paiement" at.
export async function listAppointments(): Promise<Appointment[]> {
  return mockAppointments;
}
