// Row type inferred straight from db/schema.ts, same pattern as
// features/invoicing/types.ts — one place (the schema) defines the shape.
import type { catalogItems } from "@/db/schema";

export type CatalogItem = typeof catalogItems.$inferSelect;
