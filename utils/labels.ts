import type { AppointmentStatus } from "@/features/appointments/types";
import type { InvoiceStatus, PaymentMethod } from "@/features/invoicing/types";

// The dev harness (app/page.tsx, components/*) is entirely French, so
// statuses/methods stored as English enum values (schema/DB convention —
// see db/schema.ts) must not leak through untranslated. Hardcoded FR-only
// for now; the doc's actual FR/EN requirement (section 3.5) is a real i18n
// system, out of scope until that's its own livrable.

const INVOICE_STATUS_LABELS_FR: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  unpaid: "Impayée",
  partially_paid: "Partiellement payée",
  paid: "Payée",
  refunded: "Remboursée",
  voided: "Annulée",
};

const APPOINTMENT_STATUS_LABELS_FR: Record<AppointmentStatus, string> = {
  scheduled: "Prévu",
  completed: "Terminé",
  cancelled: "Annulé",
};

const PAYMENT_METHOD_LABELS_FR: Record<PaymentMethod, string> = {
  cash: "Comptant",
  credit_card: "Carte de crédit",
  debit_card: "Carte de débit",
  interac: "Interac",
  square: "Square",
  gift_card: "Certificat cadeau",
  package: "Forfait",
  store_credit: "Note de crédit",
};

export function invoiceStatusLabelFr(status: InvoiceStatus): string {
  return INVOICE_STATUS_LABELS_FR[status];
}

export function appointmentStatusLabelFr(status: AppointmentStatus): string {
  return APPOINTMENT_STATUS_LABELS_FR[status];
}

export function paymentMethodLabelFr(method: PaymentMethod): string {
  return PAYMENT_METHOD_LABELS_FR[method];
}
