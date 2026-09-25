import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { taxes as taxesTable, type TaxAppliesTo } from "@/db/schema";
import { TaxNotFoundError } from "./errors";
import { getMockTaxById, mockTaxes } from "./mock-data";
import type { Tax } from "./types";

// Public API input is a human percentage (9.975), not our internal
// micros-of-the-fraction storage (99750) — see repository.ts's own
// rateMicros comments. 1% = 10_000 micros.
const MICROS_PER_PERCENT = 10_000;

function ratePercentToMicros(ratePercent: number): number {
  return Math.round(ratePercent * MICROS_PER_PERCENT);
}

export interface CreateTaxInput {
  name: string;
  ratePercent: number;
  country?: string;
  region?: string | null;
  appliesTo?: TaxAppliesTo;
  includedInPrice?: boolean;
  calculationOrder?: number;
  active?: boolean;
}

export interface UpdateTaxInput {
  name?: string;
  ratePercent?: number;
  country?: string;
  region?: string | null;
  appliesTo?: TaxAppliesTo;
  includedInPrice?: boolean;
  calculationOrder?: number;
  active?: boolean;
}

// Livrable 10 ("UI Paramètres: gestion des taxes") lists no API of its own,
// so managing tax profiles is this livrable's job — the settings screen is
// meant to be built on top of these four functions. Full rows (active and
// inactive) are returned; filtering to what actually applies to a given
// line happens in tax-calculation.ts's selectApplicableTaxes, not here.
export async function listTaxes(): Promise<Tax[]> {
  if (!isDatabaseConfigured) {
    return mockTaxes;
  }

  const db = getDb();
  return db.select().from(taxesTable);
}

export async function getTax(id: string): Promise<Tax | undefined> {
  if (!isDatabaseConfigured) {
    return getMockTaxById(id);
  }

  const db = getDb();
  return db.query.taxes.findFirst({ where: eq(taxesTable.id, id) });
}

export async function createTax(input: CreateTaxInput): Promise<Tax> {
  const rateMicros = ratePercentToMicros(input.ratePercent);

  if (!isDatabaseConfigured) {
    const now = new Date();
    const tax: Tax = {
      id: randomUUID(),
      name: input.name,
      rateMicros,
      country: input.country ?? "CA",
      region: input.region ?? null,
      appliesTo: input.appliesTo ?? "both",
      includedInPrice: input.includedInPrice ?? false,
      calculationOrder: input.calculationOrder ?? 1,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    };
    mockTaxes.push(tax);
    return tax;
  }

  const db = getDb();
  const [inserted] = await db
    .insert(taxesTable)
    .values({
      name: input.name,
      rateMicros,
      country: input.country ?? "CA",
      region: input.region ?? null,
      appliesTo: input.appliesTo ?? "both",
      includedInPrice: input.includedInPrice ?? false,
      calculationOrder: input.calculationOrder ?? 1,
      active: input.active ?? true,
    })
    .returning();
  return inserted;
}

// No deleteTax: the doc's own settings mockup (section 6, Écran 2) only
// shows an Active toggle, never a delete action — and historical invoice
// lines carry a loose reference to a tax profile's id (7.2 snapshot), which
// a hard delete could orphan. Deactivating is the only supported removal.
export async function updateTax(id: string, input: UpdateTaxInput): Promise<Tax> {
  if (!isDatabaseConfigured) {
    const tax = getMockTaxById(id);
    if (!tax) {
      throw new TaxNotFoundError(id);
    }
    if (input.name !== undefined) tax.name = input.name;
    if (input.ratePercent !== undefined) tax.rateMicros = ratePercentToMicros(input.ratePercent);
    if (input.country !== undefined) tax.country = input.country;
    if (input.region !== undefined) tax.region = input.region;
    if (input.appliesTo !== undefined) tax.appliesTo = input.appliesTo;
    if (input.includedInPrice !== undefined) tax.includedInPrice = input.includedInPrice;
    if (input.calculationOrder !== undefined) tax.calculationOrder = input.calculationOrder;
    if (input.active !== undefined) tax.active = input.active;
    tax.updatedAt = new Date();
    return tax;
  }

  const db = getDb();
  const updates: Partial<typeof taxesTable.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.ratePercent !== undefined) updates.rateMicros = ratePercentToMicros(input.ratePercent);
  if (input.country !== undefined) updates.country = input.country;
  if (input.region !== undefined) updates.region = input.region;
  if (input.appliesTo !== undefined) updates.appliesTo = input.appliesTo;
  if (input.includedInPrice !== undefined) updates.includedInPrice = input.includedInPrice;
  if (input.calculationOrder !== undefined) updates.calculationOrder = input.calculationOrder;
  if (input.active !== undefined) updates.active = input.active;

  const [updated] = await db.update(taxesTable).set(updates).where(eq(taxesTable.id, id)).returning();
  if (!updated) {
    throw new TaxNotFoundError(id);
  }
  return updated;
}
