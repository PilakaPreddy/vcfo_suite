import { pageMetadata } from '@/lib/shell/page-metadata';
import { systemReplySummary } from '@/db/repositories/board-meetings';
import { verifyDirectorLink } from '@/lib/board-meetings/reply-token';
import { noticeTime, shortDate } from '@/lib/board-meetings/dates';
import { MODE_LABEL } from '@/lib/board-meetings/model';

export const metadata = pageMetadata('Meeting reply', 'Tell SBC whether you will attend the board meeting');
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ t?: string; r?: string; done?: string; error?: string }> };

/**
 * The director reply page (no sign-in). Opened from the notice email; the buttons post the
 * reply, so opening the link alone records nothing.
 */
export default async function MeetingReplyPage({ searchParams }: Props) {
  const q = await searchParams;
  const link = q.t ? verifyDirectorLink(q.t) : null;
  const summary = link ? await systemReplySummary(link.meetingId, link.directorId) : null;
  const chosen = q.done === 'yes' || q.done === 'no' ? q.done : q.r === 'yes' || q.r === 'no' ? q.r : null;
  return (
    <main className="flex min-h-screen flex-col items-center gap-5 bg-surface-sunken px-4 py-12 text-ink">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-[13px] font-bold text-white" aria-hidden>
          V
        </span>
        VCFO Suite <span className="font-normal text-ink-muted">for SBC</span>
      </div>
      <section className="w-full max-w-lg rounded-md border-2 border-line bg-surface p-7">
        {!summary ? (
          <>
            <h1 className="text-xl font-medium">This link does not work</h1>
            <p className="mt-2 text-sm text-ink-muted">It may be old or changed. Reply to the notice email instead, and SBC will record your answer.</p>
          </>
        ) : q.done ? (
          <>
            <h1 className="text-xl font-medium">
              Thank you, {summary.directorName}. {q.done === 'yes' ? 'You will attend.' : 'We have noted that you cannot attend.'}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">SBC and the company see your reply. You can change it until the meeting day.</p>
            <MeetingCard summary={summary} />
          </>
        ) : (
          <>
            <h1 className="text-xl font-medium">Will you attend, {summary.directorName}?</h1>
            {q.error === 'closed' ? <p className="mt-2 text-sm text-danger">Replies for this meeting are closed.</p> : null}
            {q.error === 'invalid' ? <p className="mt-2 text-sm text-danger">Choose one of the two answers.</p> : null}
            <MeetingCard summary={summary} />
            {summary.open ? (
              <form method="post" action="/api/public/board-meetings/reply" className="mt-5 flex flex-col gap-3">
                <input type="hidden" name="t" value={q.t} />
                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-muted">
                  Note (optional)
                  <input name="note" maxLength={500} className="h-9 rounded-md border-[1.5px] border-line-strong px-2.5 text-sm text-ink" placeholder="For example: joining from Salt Lake City" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="submit" name="r" value="yes" className={`h-10 rounded-md text-sm font-medium ${chosen !== 'no' ? 'bg-brand text-white' : 'border-[1.5px] border-line-strong'}`}>
                    I will attend
                  </button>
                  <button type="submit" name="r" value="no" className={`h-10 rounded-md text-sm font-medium ${chosen === 'no' ? 'bg-brand text-white' : 'border-[1.5px] border-line-strong'}`}>
                    I can&apos;t attend
                  </button>
                </div>
                {summary.reply ? <p className="text-xs text-ink-muted">Your current reply: {summary.reply === 'yes' ? 'will attend' : "can't attend"}.</p> : null}
              </form>
            ) : (
              <p className="mt-4 text-sm text-ink-muted">Replies for this meeting are closed.</p>
            )}
          </>
        )}
        <p className="mt-5 text-xs text-ink-muted">No account or password is needed. This link works only for you and only for this meeting.</p>
      </section>
    </main>
  );
}

function MeetingCard({ summary }: { summary: NonNullable<Awaited<ReturnType<typeof systemReplySummary>>> }) {
  return (
    <div className="mt-4 flex flex-col gap-1 rounded-md border-[1.5px] border-line p-3.5 text-sm text-ink-2">
      <span className="font-medium text-ink">
        {summary.kindLabel} · {summary.companyName}
      </span>
      <span>
        {shortDate(summary.meetingDate)} · {noticeTime(summary.meetingTime)} IST{summary.secondZone ? ` · ${summary.secondZone}` : ''} · {MODE_LABEL[summary.mode]}
      </span>
      <span className="font-mono text-xs text-ink-muted">{summary.meetingNo}</span>
      {summary.teamsLink ? (
        <a className="text-brand underline" href={summary.teamsLink}>
          Join on Microsoft Teams
        </a>
      ) : null}
    </div>
  );
}
