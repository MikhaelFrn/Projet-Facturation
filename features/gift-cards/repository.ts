import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { giftCards as giftCardsTable } from "@/db/schema";
import {
  GiftCardCodeAlreadyExistsError,
  GiftCardInsufficientBalanceError,
  GiftCardNotActiveError,
} from "./errors";
import { getMockGiftCardByCode, mockGiftCards } from "./mock-data";
import type { GiftCard } from "./types";

// Shared by redeemGiftCard's mock and real branches
// (features/invoicing/repository.ts): the lazy expiresAt check matters
// because nothing proactively flips a card's status column when it expires
// — a card can still say 'active' after its expiry date, so expiresAt is
// checked independently of status rather than trusted alone.
export function assertGiftCardRedeemable(giftCard: GiftCard, requestedCents: number): void {
  const isExpired = giftCard.expiresAt !== null && giftCard.expiresAt.getTime() < Date.now();
  if (isExpired || giftCard.status === "expired") {
    throw new GiftCardNotActiveError(giftCard.code, "expired");
  }
  if (giftCard.status === "depleted" || giftCard.remainingBalanceCents <= 0) {
    throw new GiftCardNotActiveError(giftCard.code, "depleted");
  }
  if (requestedCents > giftCard.remainingBalanceCents) {
    throw new GiftCardInsufficientBalanceError(giftCard.code, requestedCents, giftCard.remainingBalanceCents);
  }
}

export interface CreateGiftCardInput {
  code: string;
  initialValueCents: number;
  expiresAt?: Date | null;
}

export async function getGiftCardByCode(code: string): Promise<GiftCard | undefined> {
  if (!isDatabaseConfigured) {
    return getMockGiftCardByCode(code);
  }

  const db = getDb();
  return db.query.giftCards.findFirst({ where: eq(giftCardsTable.code, code) });
}

// Minimal on purpose — issuing a gift card isn't itself one of the 11
// livrables (doc §4.9 only describes redemption). This exists so
// redemption (task 3) has something real to test against, not as a
// polished "sell a gift card" flow.
export async function createGiftCard(input: CreateGiftCardInput): Promise<GiftCard> {
  const existing = await getGiftCardByCode(input.code);
  if (existing) {
    throw new GiftCardCodeAlreadyExistsError(input.code);
  }

  if (!isDatabaseConfigured) {
    const now = new Date();
    const giftCard: GiftCard = {
      id: randomUUID(),
      code: input.code,
      initialValueCents: input.initialValueCents,
      remainingBalanceCents: input.initialValueCents,
      expiresAt: input.expiresAt ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    mockGiftCards.push(giftCard);
    return giftCard;
  }

  const db = getDb();
  const [inserted] = await db
    .insert(giftCardsTable)
    .values({
      code: input.code,
      initialValueCents: input.initialValueCents,
      remainingBalanceCents: input.initialValueCents,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();
  return inserted;
}
