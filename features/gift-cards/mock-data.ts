import type { GiftCard } from "./types";

// GC-2026-XYZ123 matches the requis doc's own example (section 4.9: 100$
// initial, 35$ remaining). The other two exist to exercise the rejection
// paths: an expired card whose status column is still stale ('active') —
// redeemGiftCard must catch this via expiresAt, not just the status field —
// and an already-depleted one.
const now = new Date("2026-01-01T00:00:00Z");

export const mockGiftCards: GiftCard[] = [
  {
    id: "gift-card-xyz123",
    code: "GC-2026-XYZ123",
    initialValueCents: 10000,
    remainingBalanceCents: 3500,
    expiresAt: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "gift-card-expired",
    code: "GC-2025-EXPIRED",
    initialValueCents: 5000,
    remainingBalanceCents: 5000,
    expiresAt: new Date("2025-01-01T00:00:00Z"), // in the past — status is stale on purpose
    status: "active",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "gift-card-depleted",
    code: "GC-2026-DEPLETED",
    initialValueCents: 2000,
    remainingBalanceCents: 0,
    expiresAt: null,
    status: "depleted",
    createdAt: now,
    updatedAt: now,
  },
];

export function getMockGiftCardByCode(code: string): GiftCard | undefined {
  return mockGiftCards.find((giftCard) => giftCard.code === code);
}
