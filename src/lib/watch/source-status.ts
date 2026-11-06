import type { WatchSourceStatus } from './types';

/**
 * The honest line about what was checked: which sources were read and when, and which are not read
 * automatically. Staff screens and the chat both use it, so silence never reads as no news.
 */
export interface SourceCoverage {
  line: string;
}

export function formatSourceDate(when: Date): string {
  return when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export const HEALTH_LABEL: Record<WatchSourceStatus['health'], string> = {
  unknown: 'Not checked yet',
  ok: 'Working',
  empty: 'Found nothing',
  stale: 'Out of date',
  failing: 'Failing',
  blocked: 'Blocked',
};

export function sourceCoverage(sources: readonly WatchSourceStatus[], now: Date): SourceCoverage {
  const dayMs = 86_400_000;
  const read = sources.filter((s) => s.type !== 'manual' && s.type !== 'email');
  const current = read.filter((s) => s.health === 'ok' && s.lastSuccessAt && now.getTime() - Date.parse(s.lastSuccessAt) < 2 * dayMs);
  const notCurrent = read.filter((s) => !current.includes(s)).map((s) => s.name);
  const manual = sources.filter((s) => s.type === 'manual' || s.type === 'email').map((s) => s.name);
  const parts = [`Checked ${current.length} of ${read.length} official sources in the last 2 days.`];
  if (notCurrent.length > 0) parts.push(`Not read recently: ${notCurrent.join(', ')}.`);
  if (manual.length > 0) parts.push(`Added by hand, not read automatically: ${manual.join(', ')}.`);
  return { line: parts.join(' ') };
}
