export type BillingCurrency = "gbp" | "eur" | "usd";

// Eurozone countries only — non-euro EU members (DK, SE, PL, CZ, HU, BG, RO) fall through to USD
const EUROZONE = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR",
  "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT",
  "NL", "PT", "SI", "SK",
]);

export function getCurrencyFromCountry(country: string | null | undefined): BillingCurrency {
  if (country === "GB") return "gbp";
  if (country && EUROZONE.has(country)) return "eur";
  return "usd";
}

// Maps currency to the Stripe lookup key for that price
export function getLookupKey(currency: BillingCurrency): string {
  if (currency === "gbp") return "monthly-gbp-1";
  if (currency === "eur") return "monthly-euro-1";
  return "monthly-usd-1";
}
