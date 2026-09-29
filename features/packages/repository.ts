import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { packageItems as packageItemsTable, packages as packagesTable, type InvoiceItemType } from "@/db/schema";
import {
  getMockActivePackagesForCustomer,
  getMockPackageById,
  getMockPackageItemsByPackageId,
  mockPackageItems,
  mockPackages,
} from "./mock-data";
import type { Package, PackageItem, PackageWithItems } from "./types";

export async function getPackageWithItems(packageId: string): Promise<PackageWithItems | undefined> {
  if (!isDatabaseConfigured) {
    const pkg = getMockPackageById(packageId);
    if (!pkg) return undefined;
    return { ...pkg, items: getMockPackageItemsByPackageId(packageId) };
  }

  const db = getDb();
  return db.query.packages.findFirst({
    where: eq(packagesTable.id, packageId),
    with: { items: true },
  });
}

export async function getActivePackagesForCustomer(customerId: string): Promise<PackageWithItems[]> {
  if (!isDatabaseConfigured) {
    return getMockActivePackagesForCustomer(customerId).map((pkg) => ({
      ...pkg,
      items: getMockPackageItemsByPackageId(pkg.id),
    }));
  }

  const db = getDb();
  return db.query.packages.findMany({
    where: and(eq(packagesTable.customerId, customerId), eq(packagesTable.status, "active")),
    with: { items: true },
  });
}

// Shared by the eligibility endpoint and redeemPackageForLine: finds an
// active, non-expired package of this customer's that still has quantity
// left for this specific catalog item. Same lazy expiresAt check as gift
// cards — a package can still say 'active' after its expiry date.
export async function findRedeemablePackageItem(
  customerId: string,
  catalogItemId: string
): Promise<{ pkg: PackageWithItems; packageItem: PackageItem } | undefined> {
  const activePackages = await getActivePackagesForCustomer(customerId);
  const now = Date.now();

  for (const pkg of activePackages) {
    if (pkg.expiresAt !== null && pkg.expiresAt.getTime() < now) continue;
    const packageItem = pkg.items.find(
      (item) => item.catalogItemId === catalogItemId && item.remainingQuantity > 0
    );
    if (packageItem) {
      return { pkg, packageItem };
    }
  }

  return undefined;
}

export interface CreatePackageItemInput {
  itemType: InvoiceItemType;
  catalogItemId: string;
  description: string;
  quantity: number;
}

export interface CreatePackageInput {
  name: string;
  customerId: string;
  expiresAt?: Date | null;
  discountPercent?: number | null;
  items: CreatePackageItemInput[];
}

// Minimal on purpose — issuing a package isn't itself one of the 11
// livrables (doc §4.10 only describes redemption). Exists so redemption
// (task 3) has something real to test against.
export async function createPackage(input: CreatePackageInput): Promise<PackageWithItems> {
  const discountPercentMicros =
    input.discountPercent != null ? Math.round(input.discountPercent * 10_000) : null;

  if (!isDatabaseConfigured) {
    const now = new Date();
    const pkg: Package = {
      id: randomUUID(),
      name: input.name,
      customerId: input.customerId,
      purchasedAt: now,
      expiresAt: input.expiresAt ?? null,
      status: "active",
      discountPercentMicros,
      createdAt: now,
      updatedAt: now,
    };
    const items: PackageItem[] = input.items.map((item) => ({
      id: randomUUID(),
      packageId: pkg.id,
      itemType: item.itemType,
      catalogItemId: item.catalogItemId,
      description: item.description,
      initialQuantity: item.quantity,
      remainingQuantity: item.quantity,
      createdAt: now,
    }));
    mockPackages.push(pkg);
    mockPackageItems.push(...items);
    return { ...pkg, items };
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const [insertedPackage] = await tx
      .insert(packagesTable)
      .values({
        name: input.name,
        customerId: input.customerId,
        expiresAt: input.expiresAt ?? null,
        discountPercentMicros,
      })
      .returning();

    const insertedItems = await tx
      .insert(packageItemsTable)
      .values(
        input.items.map((item) => ({
          packageId: insertedPackage.id,
          itemType: item.itemType,
          catalogItemId: item.catalogItemId,
          description: item.description,
          initialQuantity: item.quantity,
          remainingQuantity: item.quantity,
        }))
      )
      .returning();

    return { ...insertedPackage, items: insertedItems };
  });
}
