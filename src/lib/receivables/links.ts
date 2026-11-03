/**
 * RECEIVABLES LINKS — the public page address and its secret key (owner decision 3 Nov 2026:
 * the link carries a key the manager can reset, so the plain /receivables URL shows nothing).
 * Browser-safe; the key itself is made in public-key.ts on the server.
 */

export function isPublicKeyShape(key: string): boolean {
  return /^[A-Za-z0-9_-]{12}$/.test(key);
}

/** The client page link, optionally opened on one partner. */
export function publicPageUrl(siteUrl: string, sheet: { publicKey: string; requireKey: boolean }, partnerSlug?: string | null): string {
  const base = siteUrl.replace(/\/$/, '');
  const path = sheet.requireKey ? `/receivables/k/${sheet.publicKey}` : '/receivables';
  return partnerSlug ? `${base}${path}?partner=${encodeURIComponent(partnerSlug)}` : `${base}${path}`;
}

/** "Sandeep Sharma" → "sandeep"; adds -2, -3 … until it is free. */
export function partnerSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = (name.trim().split(/\s+/)[0] || 'partner').toLowerCase().replace(/[^a-z0-9]/g, '') || 'partner';
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}
