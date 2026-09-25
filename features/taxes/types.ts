// Row type inferred straight from db/schema.ts — same pattern as
// features/catalog/types.ts. This is now the canonical home for Tax;
// features/invoicing/types.ts re-exports it for backward compatibility.
import type { taxes } from "@/db/schema";

export type { TaxAppliesTo } from "@/db/schema";

export type Tax = typeof taxes.$inferSelect;
