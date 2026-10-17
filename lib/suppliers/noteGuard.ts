// lib/suppliers/noteGuard.ts
//
// The terminal note is shared with every company, so it must not carry a
// company's account numbers or codes. Same rule as the database check on
// terminal_notes (20261017000000): no run of 5+ digits and no split number
// like "2001 4625". Phone numbers are allowed.

const PHONE = /\(?\d{3}\)?[ .-]?\d{3}[ .-]\d{4}/g;
const ACCOUNT_LIKE = /(\d{5,}|\d{3,}[ .-]\d{3,})/;

export function looksLikeAccountNumber(text: string): boolean {
  return ACCOUNT_LIKE.test(text.replace(PHONE, ""));
}
