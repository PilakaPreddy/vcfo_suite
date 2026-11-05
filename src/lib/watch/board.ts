import type { AnnouncementKind } from '@/lib/notifications/announcements';
import { formatSourceDate } from './source-status';

/** How an update reads on the announcements board. The original remains the authority. */
interface BoardFields {
  summary: string | null;
  quote: string | null;
  affects: string | null;
  effectiveDate: string | null;
  newDueDate: string | null;
  area: string | null;
  changeType: string | null;
  importance: string | null;
}

const readable = (isoDay: string): string => formatSourceDate(new Date(`${isoDay}T00:00:00Z`));

const AREA_KIND: Partial<Record<string, AnnouncementKind>> = { gst: 'gst', tax: 'tax', mca: 'mca' };

export function boardKind(update: BoardFields): AnnouncementKind {
  if (update.changeType === 'due_date') return 'deadline';
  const area = AREA_KIND[update.area ?? ''];
  if (area) return area;
  return update.importance === 'important' ? 'compliance' : 'general';
}

export function boardBody(update: BoardFields): string {
  return [
    update.summary,
    update.effectiveDate && `Effective: ${readable(update.effectiveDate)}`,
    update.newDueDate && `New due date: ${readable(update.newDueDate)}`,
    update.affects && `Affects: ${update.affects}`,
    update.quote && `From the source: "${update.quote}"`,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000);
}
