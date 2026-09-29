// Row types inferred straight from db/schema.ts — same pattern as
// features/catalog/types.ts and features/gift-cards/types.ts.
import type { packageItems, packages } from "@/db/schema";

export type { PackageStatus } from "@/db/schema";

export type Package = typeof packages.$inferSelect;
export type PackageItem = typeof packageItems.$inferSelect;

export interface PackageWithItems extends Package {
  items: PackageItem[];
}
