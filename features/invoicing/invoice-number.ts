import { sql } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { invoiceNumberCounters } from "@/db/schema";

// In mock mode there's no DB row to lock, so an in-memory counter per year
// stands in for it. It resets on server restart, same as the rest of
// mock-data.ts — fine for manual testing, not meant to survive a redeploy.
const mockCounters = new Map<number, number>();

function format(year: number, value: number): string {
  return `INV-${year}-${String(value).padStart(5, "0")}`;
}

// Atomically increments the counter row for `year` (creating it at 1 if this
// is the year's first invoice) and returns the formatted number. The
// INSERT ... ON CONFLICT DO UPDATE is a single statement, so concurrent
// checkouts can't both read the same lastValue and produce a duplicate
// number — Postgres serializes the two upserts via the row's lock.
export async function generateInvoiceNumber(year = new Date().getFullYear()): Promise<string> {
  if (!isDatabaseConfigured) {
    const next = (mockCounters.get(year) ?? 0) + 1;
    mockCounters.set(year, next);
    return format(year, next);
  }

  const db = getDb();
  const [row] = await db
    .insert(invoiceNumberCounters)
    .values({ year, lastValue: 1 })
    .onConflictDoUpdate({
      target: invoiceNumberCounters.year,
      set: { lastValue: sql`${invoiceNumberCounters.lastValue} + 1` },
    })
    .returning({ lastValue: invoiceNumberCounters.lastValue });

  return format(year, row.lastValue);
}
