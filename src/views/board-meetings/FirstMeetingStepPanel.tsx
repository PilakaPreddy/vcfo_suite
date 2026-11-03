'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '@/context/AppContext';
import { shortDate } from '@/lib/board-meetings/dates';
import { useMeetings } from '@/hooks/use-board-meetings';
import { MeetingWord } from './MeetingWord';
import { NewMeetingDialog } from './NewMeetingDialog';
import { meetingsBase } from './view-model';

/**
 * INCORPORATION › POST-1 (First board meeting): staff only. Shows the first meeting of the
 * company with its state and a link to it, or a button that creates it (type First, marked
 * post-incorporation). The meeting itself runs on its own page under Obligations.
 */
export function FirstMeetingStepPanel({ engagementId, companyName }: { engagementId: string; companyName: string }) {
  const { user } = useApp();
  const q = useMeetings(engagementId);
  const [open, setOpen] = useState(false);
  const base = meetingsBase(user?.role);
  const first = (q.data ?? []).find((m) => m.postInc && m.status !== 'cancelled') ?? (q.data ?? []).find((m) => m.meetingType === 'first' && m.status !== 'cancelled');
  if (q.isPending) return null;
  return (
    <section aria-label="First board meeting" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-4 py-3">
      {first ? (
        <>
          <div className="min-w-0 text-[14px]">
            <p className="m-0 font-medium">
              First board meeting · {shortDate(first.meetingDate)}
            </p>
            <p className="m-0 text-[13px] text-ink-muted">
              {first.meetingNo} · {first.stage}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MeetingWord word={first.word} />
            <Button size="sm" asChild>
              <Link href={`${base}/obligations/meetings/${first.id}`}>Open meeting</Link>
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[14px] text-ink-2">Hold the first board meeting within 30 days of incorporation. VCFO drafts the notice and tracks the MoM.</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <CalendarPlus className="h-4 w-4" aria-hidden /> Create first board meeting
          </Button>
          {open ? (
            <NewMeetingDialog open={open} onOpenChange={setOpen} companies={[{ id: engagementId, name: companyName }]} defaultCompany={engagementId} basePath={base} postInc defaultType="first" />
          ) : null}
        </>
      )}
    </section>
  );
}
