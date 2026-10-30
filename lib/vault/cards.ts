// lib/vault/cards.ts
//
// Card entries in the Vault. Two categories hold cards; the fuel screen only
// offers those as payment options.

export const COMPANY_CARD = "Company Card";
export const PERSONAL_CARD = "Personal Card";
export const CARD_CATEGORIES = [COMPANY_CARD, PERSONAL_CARD] as const;
export const isCardCategory = (c: string | null | undefined) => c === COMPANY_CARD || c === PERSONAL_CARD;

export const CARD_BRANDS = ["Visa", "Mastercard", "Amex", "Discover", "Fleet card", "Other"] as const;

export type VaultCard = {
  id: string;
  label: string;
  category: string | null;
  card_name: string | null;
  card_brand: string | null;
  card_number: string | null;
  card_exp: string | null;
  card_pin: string | null;
};

// How many trailing digits a card shows. Amex prints the last 5
// ("ending in 51005"); everyone else the last 4.
export function shownDigits(brand: string | null | undefined): number {
  return brand === "Amex" ? 5 : 4;
}

// Dots and the last 4 ("•••• 1234"), or the last 5 for Amex.
export function maskCard(number: string | null | undefined, brand: string | null | undefined): string {
  const digits = (number ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const n = shownDigits(brand);
  if (digits.length <= n) return digits;
  return `•••• ${digits.slice(-n)}`;
}

// Full number in groups, for when the driver taps Show.
export function groupCard(number: string | null | undefined, brand: string | null | undefined): string {
  const d = (number ?? "").replace(/\D/g, "");
  if (brand === "Amex" && d.length === 15) return `${d.slice(0, 4)} ${d.slice(4, 10)} ${d.slice(10)}`;
  return d.replace(/(.{4})(?=.)/g, "$1 ");
}

/** "•••• •••• •••• 1234" in the card's own grouping (Amex: "•••• •••••• 51005"); a short number is shown as is. */
export function maskCardGroups(number: string | null | undefined, brand: string | null | undefined): string {
  const d = (number ?? "").replace(/\D/g, "");
  if (!d) return "";
  const n = shownDigits(brand);
  const dots = (k: number) => "•".repeat(k);
  if (brand === "Amex") return `${dots(4)} ${dots(6)} ${d.slice(-5)}`;
  const last = d.slice(-n);
  return `${dots(4)} ${dots(4)} ${dots(4)} ${last}`;
}

/** The last day of a card's expiry month as an ISO date, from "MM/YY" or "MM/YYYY"; null when it isn't one. */
export function cardExpIso(exp: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\s*[\/-]\s*(\d{2}|\d{4})\s*$/.exec(exp ?? "");
  if (!m) return null;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return null;
  const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}
