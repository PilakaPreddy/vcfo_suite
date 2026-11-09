/**
 * The title of one compliance instance or task: its name and its period.
 *
 * Yearly and quarterly period labels already start with the obligation's name
 * ("Form MGT-7 FY 2025-26", "Advance Tax Payment Q4 2026"), so joining the two
 * would print the name twice. In that case the period label alone is the title.
 */
export function titleWithPeriod(name: string, period: string | null | undefined): string {
  const p = period?.trim();
  if (!p) return name;
  if (p.toLowerCase().startsWith(name.trim().toLowerCase())) return p;
  return `${name} · ${p}`;
}
