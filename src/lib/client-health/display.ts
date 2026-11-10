import type { ChipTone } from '@/components/ui/spectrum-chip';
import { HEALTH_BAND_LABEL, healthTooltipLines, type HealthBand, type HealthSignals } from './score';

/** How the screens draw a health band: the chip tone and the hover text. PURE. */

export const HEALTH_BAND_TONE: Record<HealthBand, ChipTone> = { good: 'ok', watch: 'warn', at_risk: 'bad', critical: 'bad' };

export function healthTitle(h: { score: number; band: HealthBand; signals: Pick<HealthSignals, 'penalties'>; override: { band: HealthBand; reason: string | null } | null }): string {
  const lines = healthTooltipLines(h.score, h.signals);
  if (h.override) lines.unshift(`Set by hand to ${HEALTH_BAND_LABEL[h.override.band]}${h.override.reason ? `: ${h.override.reason}` : ''} (computed ${HEALTH_BAND_LABEL[h.band]})`);
  return lines.join('\n');
}

