import { NextResponse } from "next/server";
import { getGiftCardByCode } from "@/features/gift-cards/repository";

// GET /api/gift-cards/[code] — 4.9 "le système affiche le solde
// disponible", checked before an amount is committed to redemption.
export async function GET(_request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;

  const giftCard = await getGiftCardByCode(code);
  if (!giftCard) {
    return NextResponse.json({ error: `Gift card ${code} not found` }, { status: 404 });
  }

  return NextResponse.json(giftCard);
}
