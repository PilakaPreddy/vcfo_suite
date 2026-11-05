import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrManager } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  createAnnouncementSource,
  listAnnouncementSources,
} from '@/db/repositories/announcements';
import { ingestAnnouncementSource } from '@/jobs/announcement-feeds';
import { publicErrorMessage } from '@/lib/api-error';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  feedUrl: z.string().trim().url().max(500),
  homepageUrl: z.string().trim().url().max(500).optional().nullable(),
});

/** GET /api/announcements/sources — RSS/Atom feeds staff configured. */
export async function GET() {
  const guard = await requireAdminOrManager();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const sources = await listAnnouncementSources(guard.ctx);
    return NextResponse.json({ sources });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    const status = message.includes('not permitted') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** POST /api/announcements/sources — add an official RSS/Atom URL, then fetch. */
export async function POST(request: Request) {
  const guard = await requireAdminOrManager();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  try {
    const source = await createAnnouncementSource(guard.ctx, {
      name: body.data.name,
      feedUrl: body.data.feedUrl,
      homepageUrl: body.data.homepageUrl,
    });
    const ingest = await ingestAnnouncementSource(source);
    await recordAuditEvent(guard.ctx, {
      action: 'announcement_sources.create',
      summary: `Added announcement feed “${source.name}”`,
      metadata: { sourceId: source.id, inserted: ingest.inserted, error: ingest.error ?? null },
    });
    return NextResponse.json({ source, ingest }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status =
      message.includes('not permitted')
        ? 403
        : message === 'invalid_body' ||
            message === 'feed_host_not_allowed' ||
            message === 'feed_must_be_https' ||
            message === 'invalid_feed_url' ||
            message === 'feed_already_added' ||
            message === 'invalid_link'
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
