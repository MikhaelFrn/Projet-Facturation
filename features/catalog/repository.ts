import { and, eq, ilike, or } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { catalogItems } from "@/db/schema";
import { getMockCatalogItemById, searchMockCatalogItems } from "./mock-data";
import type { CatalogItem } from "./types";

// Unlike features/appointments/repository.ts, this data is ours (see the
// comment in db/schema.ts), so it follows the same mock/real switch as
// features/invoicing/repository.ts.

export async function getCatalogItem(id: string): Promise<CatalogItem | undefined> {
  if (!isDatabaseConfigured) {
    return getMockCatalogItemById(id);
  }

  const db = getDb();
  return db.query.catalogItems.findFirst({ where: eq(catalogItems.id, id) });
}

// requis doc section 4.4: "Champ de recherche de produit (par nom ou code)".
// An empty query returns every active item (the initial list before typing).
export async function searchCatalogItems(query: string): Promise<CatalogItem[]> {
  if (!isDatabaseConfigured) {
    return searchMockCatalogItems(query);
  }

  const db = getDb();
  const q = query.trim();
  return db
    .select()
    .from(catalogItems)
    .where(
      q
        ? and(eq(catalogItems.active, true), or(ilike(catalogItems.name, `%${q}%`), ilike(catalogItems.sku, `%${q}%`)))
        : eq(catalogItems.active, true)
    );
}
