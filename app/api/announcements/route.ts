import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireAdminOrManager } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import {
  createAnnouncement,
  getAnnouncementBoardHead,
  listAnnouncements,
} from '@/db/repositories/announcements';
import { canWriteAnnouncements } from '@/lib/notifications/announcements';
import { publicErrorMessage } from '@/lib/api-error';

const createSchema = z.object({
  title: z.string().trim().max(200).optional().default(''),
  body: z.string().trim().max(8000).optional().default(''),
  kind: z.enum([
    'post-incorp',
    'incorp',
    'reg',
    'compliance',
    'tax',
    'gst',
    'mca',
    'deadline',
    'general',
  ]).optional().default('general'),
  sourceUrl: z.string().trim().url().max(500).optional().nullable(),
  /** C-741: an in-app client portal page (`/app/client/...`) for the "Open" button. */
  linkPath: z.string().trim().max(300).optional().nullable(),
});

/** GET /api/announcements — firm-wide news for every signed-in role. */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const url = new URL(request.url);
  if (url.searchParams.get('head') === '1') {
    try {
      const head = await getAnnouncementBoardHead(guard.ctx);
      return NextResponse.json(head);
    } catch (err) {
      const message = publicErrorMessage(err, 'list_failed');
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  const rawLimit = Number(url.searchParams.get('limit') ?? '80');
  const limit = Number.isFinite(rawLimit) ? rawLimit : 80;
  try {
    const announcements = await listAnnouncements(guard.ctx, limit);
    return NextResponse.json({
      announcements,
      canWrite: canWriteAnnouncements(guard.ctx.role),
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/announcements — manager / admin / super admin compose. */
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
    const announcement = await createAnnouncement(guard.ctx, {
      title: body.data.title,
      body: body.data.body,
      kind: body.data.kind,
      sourceUrl: body.data.sourceUrl,
      linkPath: body.data.linkPath,
    });
    await recordAuditEvent(guard.ctx, {
      action: 'announcements.create',
      summary: `Posted announcement “${announcement.title}”`,
      metadata: { announcementId: announcement.id },
    });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    const status = message.includes('not permitted') ? 403 : message === 'invalid_body' ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
