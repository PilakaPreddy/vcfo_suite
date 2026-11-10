import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { listNoticeCases } from '@/db/repositories/notice-cases';
import { openNotice, openNoticeInput } from '@/lib/actions/compliance/open-notice';
import { parseJsonBody } from '@/lib/api/parse-body';
import { noticeError, routeActionContext, STAFF } from './_respond';

/**
 * GET /api/notices — the notice board in the caller's scope, the soonest reply date first.
 * `?open=1` keeps open cases, `?open=0` submitted and closed ones; `?engagementId=` one client.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const url = new URL(request.url);
  const open = url.searchParams.get('open');
  try {
    const items = await listNoticeCases(guard.ctx, { open: open === '1' ? true : open === '0' ? false : undefined, engagementId: url.searchParams.get('engagementId') });
    return NextResponse.json({ items });
  } catch (e) {
    return noticeError(e);
  }
}

/**
 * POST /api/notices { ...compliance.openNotice input, confirm: true } — the person's approval of
 * the review the read step showed. The action's checks run again as that person, then it files
 * the notice in the vault and opens the case.
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const parsed = await parseJsonBody(request, openNoticeInput.extend({ confirm: z.literal(true) }));
  if (parsed.ok === false) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { confirm: _confirm, ...input } = parsed.data;
  try {
    const result = await openNotice.execute(routeActionContext(guard.ctx), input);
    if (result.ok === false) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return noticeError(e);
  }
}
