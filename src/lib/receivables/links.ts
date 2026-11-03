/**
 * RECEIVABLES LINKS. Since Phase 8 (docs/specs/receivables/PLAN.md) each client partner signs in
 * at /receivables, so the page address is the same for everyone and carries no secret. The old
 * key link (/receivables/k/<key>) is retired; the key column stays in the database unused.
 * Browser-safe; the per-invoice link the reminder emails use is `partnerInvoiceUrl` in
 * partner-emails.ts.
 */

export function isPublicKeyShape(key: string): boolean {
  return /^[A-Za-z0-9_-]{12}$/.test(key);
}

/**
 * The client partner page link, `/receivables`. The sheet and partner arguments are kept for the
 * callers written for the key link; the partner page shows each partner only their own invoices,
 * so neither changes the address any more.
 */
export function publicPageUrl(siteUrl: string, _sheet?: { publicKey: string; requireKey: boolean }, _partnerSlug?: string | null): string {
  return `${siteUrl.replace(/\/$/, '')}/receivables`;
}

/** "Sandeep Sharma" → "sandeep"; adds -2, -3 … until it is free. */
export function partnerSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = (name.trim().split(/\s+/)[0] || 'partner').toLowerCase().replace(/[^a-z0-9]/g, '') || 'partner';
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
