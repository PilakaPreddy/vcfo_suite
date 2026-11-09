/**
 * SRN reader. MCA service request numbers look like `AB1234567` (one or two capitals and seven or
 * eight digits). The reader prefers a match close after the word "SRN" and returns null when the
 * page does not mention an SRN at all, so a stray code elsewhere on the page is never taken.
 */
export const SRN_PATTERN = /\b[A-Z]{1,2}\d{7,8}\b/g;

export function findSrn(text: string, pattern: RegExp = SRN_PATTERN): string | null {
  const flat = text.replace(/\s+/g, ' ');
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const anchors = [...flat.matchAll(/\b(SRN|service request number)\b/gi)].map((m) => m.index ?? 0);
  if (!anchors.length) return null;
  let best: { srn: string; distance: number } | null = null;
  for (const m of flat.matchAll(re)) {
    const at = m.index ?? 0;
    for (const a of anchors) {
      // After the anchor counts fully; a value printed just before the word counts at double distance.
      const distance = at >= a ? at - a : (a - at) * 2;
      if (distance <= 200 && (!best || distance < best.distance)) best = { srn: m[0], distance };
    }
  }
  return best?.srn ?? null;
}
