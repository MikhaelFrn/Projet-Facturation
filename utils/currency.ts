// Formats an integer cent amount as currency. Locale-aware placeholder for
// the FR/EN requirement in requis doc section 3 — full locale switching
// (based on user/tenant settings) lands with the checkout UI livrable.
export function formatCents(
  cents: number,
  locale: "fr-CA" | "en-CA" = "fr-CA",
  currency = "CAD"
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100
  );
}