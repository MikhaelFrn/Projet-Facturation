import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { invoices } from "@/db/schema";
import { getMockInvoiceById, mockInvoices } from "./mock-data";
import type { InvoiceWithDetails } from "./types";

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