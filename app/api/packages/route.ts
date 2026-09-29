import { NextResponse } from "next/server";
import type { InvoiceItemType } from "@/db/schema";
import { createPackage, type CreatePackageInput, type CreatePackageItemInput } from "@/features/packages/repository";

const ITEM_TYPES: InvoiceItemType[] = ["service", "product"];

interface RawItem {
  itemType?: unknown;
  catalogItemId?: unknown;
  description?: unknown;
  quantity?: unknown;
}

// POST /api/packages — minimal package issuance. Not one of the 11
// livrables itself (doc §4.10 only describes redemption) — exists so
// redemption has a real package to redeem against instead of only the
// seeded mock one.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body as {
    name?: unknown;
    customerId?: unknown;
    expiresAt?: unknown;
    discountPercent?: unknown;
    items?: unknown;
  } | null;
  if (raw === null || typeof raw !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  if (typeof raw.name !== "string" || raw.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (typeof raw.customerId !== "string" || raw.customerId.trim() === "") {
    return NextResponse.json({ error: "customerId is required" }, { status: 400 });
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
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

  let discountPercent: number | null | undefined;
  if (raw.discountPercent !== undefined) {
    if (raw.discountPercent === null) {
      discountPercent = null;
    } else if (typeof raw.discountPercent === "number" && raw.discountPercent >= 0) {
      discountPercent = raw.discountPercent;
    } else {
      return NextResponse.json(
        { error: "discountPercent must be a non-negative number or null" },
        { status: 400 }
      );
    }
  }

  const items: CreatePackageItemInput[] = [];
  for (let index = 0; index < raw.items.length; index += 1) {
    const item = raw.items[index] as RawItem | null;
    if (item === null || typeof item !== "object") {
      return NextResponse.json({ error: `items[${index}] must be an object` }, { status: 400 });
    }
    if (typeof item.itemType !== "string" || !ITEM_TYPES.includes(item.itemType as InvoiceItemType)) {
      return NextResponse.json(
        { error: `items[${index}].itemType must be 'service' or 'product'` },
        { status: 400 }
      );
    }
    if (typeof item.catalogItemId !== "string" || item.catalogItemId.trim() === "") {
      return NextResponse.json({ error: `items[${index}].catalogItemId is required` }, { status: 400 });
    }
    if (typeof item.description !== "string" || item.description.trim() === "") {
      return NextResponse.json({ error: `items[${index}].description is required` }, { status: 400 });
    }
    if (typeof item.quantity !== "number" || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return NextResponse.json(
        { error: `items[${index}].quantity must be a positive integer` },
        { status: 400 }
      );
    }
    items.push({
      itemType: item.itemType as InvoiceItemType,
      catalogItemId: item.catalogItemId,
      description: item.description,
      quantity: item.quantity,
    });
  }

  const input: CreatePackageInput = {
    name: raw.name,
    customerId: raw.customerId,
    expiresAt,
    discountPercent,
    items,
  };

  const pkg = await createPackage(input);
  return NextResponse.json(pkg, { status: 201 });
}
