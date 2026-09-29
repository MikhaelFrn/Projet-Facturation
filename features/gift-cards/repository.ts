import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { giftCards as giftCardsTable } from "@/db/schema";
import { GiftCardCodeAlreadyExistsError } from "./errors";
import { getMockGiftCardByCode, mockGiftCards } from "./mock-data";
import type { GiftCard } from "./types";

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
