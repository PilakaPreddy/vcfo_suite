'use client';

import Link from 'next/link';
import { DashSection } from '@/components/dash/DashSection';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { shortDate } from '@/lib/board-meetings/dates';
import { useMeetings } from '@/hooks/use-board-meetings';
import { meetingsBase } from './view-model';

/**
 * APPROVALS › "Board meeting notice" rows: notices the lead sent for approval. The manager
 * opens the meeting, edits what is needed and approves (VCFO emails the notice) or sends it back.
 * Renders nothing when no notice is waiting.
 */
export function MeetingApprovalsPanel() {
  const { user } = useApp();
  const q = useMeetings(null);
  const rows = (q.data ?? []).filter((m) => m.status === 'pending_approval');
  if (rows.length === 0) return null;
  const base = meetingsBase(user?.role);
  return (
    <DashSection title="Board meeting notices" meta={String(rows.length)} bodyClassName="p-0">
      <ul>
        {rows.map((m) => (
          <li key={m.id} className="flex min-h-[60px] items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium leading-snug text-ink">
                Notice · {m.meetingNo}
              </div>
              <div className="truncate text-[12.5px] text-ink-muted">
                {m.companyName} · Board meeting notice · meeting {shortDate(m.meetingDate)} · send by {shortDate(m.noticeDue)}
                {m.leadName ? ` · from ${m.leadName}` : ''}
              </div>
            </div>
            <Button size="sm" variant="strong" className="shrink-0" asChild>
              <Link href={`${base}/obligations/meetings/${m.id}?tab=notice`}>Review</Link>
            </Button>
          </li>
        ))}
      </ul>
    </DashSection>
  );
}
