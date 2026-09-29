import { NextResponse } from "next/server";
import { GiftCardCodeAlreadyExistsError } from "@/features/gift-cards/errors";
import { createGiftCard, type CreateGiftCardInput } from "@/features/gift-cards/repository";

// POST /api/gift-cards — minimal on purpose: issuing a gift card isn't
// itself a listed livrable (doc §4.9 only describes redemption). This
// exists so redemption has something real to test against.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as { code?: unknown; initialValueCents?: unknown; expiresAt?: unknown } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (typeof raw.code !== "string" || raw.code.trim() === "") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (
    typeof raw.initialValueCents !== "number" ||
    !Number.isInteger(raw.initialValueCents) ||
    raw.initialValueCents <= 0
  ) {
    return NextResponse.json({ error: "initialValueCents must be a positive integer" }, { status: 400 });
  }

  let expiresAt: Date | null | undefined;
  if (raw.expiresAt !== undefined) {
    if (raw.expiresAt === null) {
      expiresAt = null;
    } else if (typeof raw.expiresAt === "string") {
      const parsed = new Date(raw.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "expiresAt must be a valid ISO date string or null" },
          { status: 400 }
        );
      }
      expiresAt = parsed;
    } else {
      return NextResponse.json({ error: "expiresAt must be a string or null" }, { status: 400 });
    }
  }

  const input: CreateGiftCardInput = {
    code: raw.code,
    initialValueCents: raw.initialValueCents,
    expiresAt,
  };

  try {
    const giftCard = await createGiftCard(input);
    return NextResponse.json(giftCard, { status: 201 });
  } catch (error) {
    if (error instanceof GiftCardCodeAlreadyExistsError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("createGiftCard failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
