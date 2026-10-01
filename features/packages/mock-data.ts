import type { Package, PackageItem } from "./types";

// Matches the requis doc's own example (§4.10): "Forfait Détente" with
// 6 × Massage suédois (4 remaining) and 3 × Soins du visage (2 remaining).
// Attached to Sophie Bergeron (appt-2's customer) so it's directly testable
// through the checkout flow already used throughout prior livrables.
const now = new Date("2026-01-01T00:00:00Z");

export const mockPackages: Package[] = [
  {
    id: "package-detente",
    name: "Forfait Détente Printemps",
    customerId: "customer-sophie-bergeron",
    purchasedAt: now,
    expiresAt: null,
    status: "active",
    discountPercentMicros: null,
    createdAt: now,
    updatedAt: now,
  },
];

export const mockPackageItems: PackageItem[] = [
  {
    id: "package-item-massage",
    packageId: "package-detente",
    itemType: "service",
    catalogItemId: "service-massage-suedois",
    description: "Massage suédois",
    initialQuantity: 6,
    remainingQuantity: 4,
    createdAt: now,
  },
  {
    id: "package-item-soins-visage",
    packageId: "package-detente",
    itemType: "service",
    catalogItemId: "service-soins-visage",
    description: "Soins du visage",
    initialQuantity: 3,
    remainingQuantity: 2,
    createdAt: now,
  },
];

export function getMockPackageById(id: string): Package | undefined {
  return mockPackages.find((pkg) => pkg.id === id);
}

export function getMockPackageItemsByPackageId(packageId: string): PackageItem[] {
  return mockPackageItems.filter((item) => item.packageId === packageId);
}

export function getMockActivePackagesForCustomer(customerId: string): Package[] {
  return mockPackages.filter((pkg) => pkg.customerId === customerId && pkg.status === "active");
}

// Test-only: redeemPackageForLine/createPackage mutate remainingQuantity/
// status in place, or push new rows. See features/invoicing/mock-data.ts's
// resetMockInvoices for why this snapshot-and-restore pattern exists.
const PRISTINE_MOCK_PACKAGES = structuredClone(mockPackages);
const PRISTINE_MOCK_PACKAGE_ITEMS = structuredClone(mockPackageItems);

export function resetMockPackages(): void {
  mockPackages.length = 0;
  mockPackages.push(...structuredClone(PRISTINE_MOCK_PACKAGES));
  mockPackageItems.length = 0;
  mockPackageItems.push(...structuredClone(PRISTINE_MOCK_PACKAGE_ITEMS));
}
