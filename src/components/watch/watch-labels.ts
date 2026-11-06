import type { ChipTone } from '@/components/ui/spectrum-chip';
import type { RegArea, RegImportance, RegSourceHealth, RegUpdateStatus } from '@/lib/watch/types';

/** Words and tones shared by the queue and the review dialog. Colour carries the status only. */
export const STATUS_LOOK: Record<RegUpdateStatus, { label: string; tone: ChipTone }> = {
  queued: { label: 'Reading', tone: 'idle' },
  read: { label: 'Reading', tone: 'idle' },
  unreviewed: { label: 'Not yet reviewed', tone: 'prog' },
  needs_attention: { label: 'Needs attention', tone: 'warn' },
  published: { label: 'Published', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'idle' },
  failed: { label: 'Could not read', tone: 'bad' },
};

export const HEALTH_TONE: Record<RegSourceHealth, ChipTone> = {
  unknown: 'idle',
  ok: 'ok',
  empty: 'warn',
  stale: 'warn',
  failing: 'bad',
  blocked: 'bad',
};

export const IMPORTANCE_LABEL: Record<RegImportance, string> = {
  important: 'Everyone now',
  normal: 'Daily summary',
  staff_only: 'Staff only',
};

export const AREA_LABEL: Record<RegArea, string> = {
  gst: 'GST',
  tax: 'Income tax',
  mca: 'Company law',
  fema: 'RBI and FEMA',
  securities: 'Securities',
  labour: 'Labour',
  audit: 'Audit',
  insolvency: 'Insolvency',
  general: 'General',
};
