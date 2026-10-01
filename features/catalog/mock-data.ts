import type { CatalogItem } from "./types";

// Ids match the catalogItemId values already used in
// features/appointments/mock-data.ts and features/invoicing/mock-data.ts —
// this is meant to be the one authoritative source those were snapshotting.
const now = new Date("2026-01-01T00:00:00Z");

export const mockCatalogItems: CatalogItem[] = [
  {
    id: "service-facial-hydratant",
    sku: "SRV-FACIAL",
    name: "Facial hydratant",
    itemType: "service",
    unitPriceCents: 6000,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "service-pedicure-relaxante",
    sku: "SRV-PEDICURE",
    name: "Pédicure relaxante",
    itemType: "service",
    unitPriceCents: 4000,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "service-manucure",
    sku: "SRV-MANUCURE",
    name: "Manucure",
    itemType: "service",
    unitPriceCents: 3500,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "service-massage-suedois",
    sku: "SRV-MASSAGE",
    name: "Massage suédois",
    itemType: "service",
    unitPriceCents: 8000,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    // Added for livrable 9's package example (doc §4.10: "3 × Soins du
    // visage"), matched by name rather than reusing "Facial hydratant".
    id: "service-soins-visage",
    sku: "SRV-SOINS-VISAGE",
    name: "Soins du visage",
    itemType: "service",
    unitPriceCents: 7000,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "product-creme-spf30",
    sku: "PRD-CREME-SPF30",
    name: "Crème hydratante SPF 30",
    itemType: "product",
    unitPriceCents: 4500,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "product-shampooing-hydratant",
    sku: "PRD-SHAMPOOING",
    name: "Shampooing hydratant",
    itemType: "product",
    unitPriceCents: 2800,
    taxExempt: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
];

export function getMockCatalogItemById(id: string): CatalogItem | undefined {
  return mockCatalogItems.find((item) => item.id === id);
}

export function searchMockCatalogItems(query: string): CatalogItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return mockCatalogItems.filter((item) => item.active);
  return mockCatalogItems.filter(
    (item) => item.active && (item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q))
  );
}
