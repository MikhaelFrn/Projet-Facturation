// Row type inferred straight from db/schema.ts — same pattern as
// features/catalog/types.ts and features/taxes/types.ts.
import type { giftCards } from "@/db/schema";

export type { GiftCardStatus } from "@/db/schema";

export type GiftCard = typeof giftCards.$inferSelect;
