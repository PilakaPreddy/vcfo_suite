import { Suspense } from 'react';
import { MeetingPage } from '@/views/board-meetings/MeetingPage';
import { pageMetadata } from '@/lib/shell/page-metadata';

export const metadata = pageMetadata('Board meeting', 'Notice, replies, minutes and resolutions of one meeting');

/** Route shell only. `id` is the meeting id; the meeting route scopes it by `AuthContext`. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-ink-muted">Loading meeting…</div>}>
      <MeetingPage basePath="/app/intern/compliances" meetingId={decodeURIComponent(id)} />
    </Suspense>
  );
}
