import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { requireAuth } from '@/auth/guards';
import {
  createNotification,
  createNotifications,
  dismissNotifications,
  getNotificationInboxHead,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  restoreNotifications,
} from '@/db/repositories/notifications';
import type { AppNotification } from '@/lib/checklist/checklist-notifications';
import {
  isPersistedNotificationId,
  parseNotificationIds,
  parseRestoreNotifications,
} from '@/lib/notifications/notification-dismiss';

function historyRequested(request: Request): boolean {
  const url = new URL(request.url);
  const history = url.searchParams.get('history');
  const scope = url.searchParams.get('scope');
  return history === '1' || history === 'true' || scope === 'history';
}

/** GET /api/notifications — inbox (undismissed). `?history=1` includes dismissed. */
export async function GET(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('head') === '1') {
      const head = await getNotificationInboxHead(guard.ctx);
      return NextResponse.json(head);
    }
    const includeDismissed = historyRequested(request);
    const notifications = await listNotifications(guard.ctx, { includeDismissed });
    return NextResponse.json({ notifications });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function restoreIdsFromBody(body: {
  id?: string;
  ids?: unknown;
  notifications?: unknown;
}): string[] | null {
  const fromIds = parseNotificationIds(body.ids ?? body.id);
  if (fromIds) return fromIds;
  const parsed = parseRestoreNotifications(body.notifications);
  if (!parsed) return null;
  return parsed.map((n) => n.id);
}

/** POST /api/notifications — create; mark read; dismiss (inbox hide); restore. */
export async function POST(request: Request) {
  const guard = await requireAuth();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  let body: {
    action?: string;
    id?: string;
    ids?: unknown;
    notification?: Omit<AppNotification, 'id' | 'read' | 'createdAt'>;
    notifications?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (body.action === 'mark_read') {
    if (!body.id) {
      return NextResponse.json({ error: 'id_required' }, { status: 400 });
    }
    const notification = await markNotificationRead(guard.ctx, body.id);
    if (!notification) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ notification });
  }

  if (body.action === 'mark_all_read') {
    const count = await markAllNotificationsRead(guard.ctx);
    return NextResponse.json({ count });
  }

  if (body.action === 'dismiss' || body.action === 'delete') {
    const parsed = parseNotificationIds(body.ids ?? body.id);
    if (!parsed) {
      return NextResponse.json({ error: 'ids_required' }, { status: 400 });
    }
    const ids = parsed.filter(isPersistedNotificationId);
    try {
      const notifications = await dismissNotifications(guard.ctx, ids);
      return NextResponse.json({ notifications });
    } catch (err) {
      const message = publicErrorMessage(err, 'dismiss_failed');
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.action === 'restore') {
    const parsed = restoreIdsFromBody(body);
    if (!parsed) {
      return NextResponse.json({ error: 'invalid_notifications' }, { status: 400 });
    }
    const ids = parsed.filter(isPersistedNotificationId);
    try {
      const notifications = await restoreNotifications(guard.ctx, ids);
      return NextResponse.json({ notifications });
    } catch (err) {
      const message = publicErrorMessage(err, 'restore_failed');
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (body.notifications && Array.isArray(body.notifications)) {
    const notifications = await createNotifications(
      guard.ctx,
      body.notifications as Array<Omit<AppNotification, 'id' | 'read' | 'createdAt'>>,
    );
    return NextResponse.json({ notifications }, { status: 201 });
  }

  if (body.notification) {
    const notification = await createNotification(guard.ctx, body.notification);
    return NextResponse.json({ notification }, { status: 201 });
  }

  return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
}
