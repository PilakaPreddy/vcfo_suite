import type { DigestItem, DigestSection } from '@/lib/digest/weekly-digest';
import { healthBoardHref, projectHref } from './links';
import { HEALTH_BAND_LABEL, bandRank, type HealthBand } from './score';

/**
 * The weekly digest's "Client health" section (IDEAS-PLAN wave 2, section E). PURE. Lists the
 * staff member's clients whose shown band is At risk or Critical, worst first, with what took
 * the most points off. Empty (and so left out of the email) when every client is Good or Watch.
 */

export interface DigestHealthInput {
  engagementId: string;
  slug?: string | null;
  companyName: string;
  score: number;
  effectiveBand: HealthBand;
  previousBand: HealthBand | null;
  band: HealthBand;
  signals: { penalties: Array<{ points: number; detail: string }> };
}

const SHOWN: ReadonlySet<HealthBand> = new Set(['at_risk', 'critical']);

export function healthDigestSection(role: string, rows: DigestHealthInput[]): DigestSection {
  const items: DigestItem[] = rows
    .filter((r) => SHOWN.has(r.effectiveBand))
    .sort((a, b) => bandRank(b.effectiveBand) - bandRank(a.effectiveBand) || a.score - b.score)
    .map((r) => {
      const top = [...r.signals.penalties].filter((p) => p.points > 0).sort((a, b) => b.points - a.points)[0];
      const fell = r.previousBand && bandRank(r.band) > bandRank(r.previousBand) ? `, was ${HEALTH_BAND_LABEL[r.previousBand]}` : '';
      return {
        id: `health:${r.engagementId}`,
        title: `${r.companyName}: ${HEALTH_BAND_LABEL[r.effectiveBand]} (${r.score}${fell})`,
        detail: top?.detail,
        href: projectHref(role, { id: r.engagementId, slug: r.slug ?? r.engagementId }),
      };
    });
  return {
    key: 'health',
    title: 'Client health',
    countLabel: (n) => `${n} ${n === 1 ? 'client' : 'clients'} at risk`,
    items,
    href: healthBoardHref(role),
    linkLabel: 'Open client health',
  };
}
