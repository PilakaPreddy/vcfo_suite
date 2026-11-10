import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { REQUEST_TEMPLATES } from '@/data/request-templates';
import { createRequestList, createRequestListFromTemplate, listRequestLists } from '@/db/repositories/request-lists';
import { REQUEST_LIST_STATUSES } from '@/lib/request-lists/model';
import { isoDay, itemKind, requestListError, STAFF, STAFF_AND_CLIENT } from './_respond';

/**
 * Client request lists (IDEAS-PLAN wave 2, A).
 *
 * GET  /api/request-lists?engagementId=&status=sent,complete — staff in scope; a client its own
 *      sent lists. Staff also get the template library.
 * POST /api/request-lists — staff create a draft, from a template or by hand. Sending is a
 *      separate, reviewed step (`/api/request-lists/:id/send`).
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole(...STAFF_AND_CLIENT);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const p = new URL(request.url).searchParams;
  const status = (p.get('status') ?? '')
    .split(',')
    .filter((s): s is (typeof REQUEST_LIST_STATUSES)[number] => (REQUEST_LIST_STATUSES as readonly string[]).includes(s));
  try {
    const lists = await listRequestLists(guard.ctx, { engagementId: p.get('engagementId'), status });
    const templates =
      guard.ctx.role === 'client'
        ? []
        : REQUEST_TEMPLATES.map((t) => ({ id: t.id, title: t.title, summary: t.summary, periodHint: t.periodHint, itemCount: t.items.length, cadenceDays: t.cadenceDays }));
    return NextResponse.json({ lists, templates });
  } catch (e) {
    return requestListError(e);
  }
}

const createSchema = z.object({
  engagementId: z.string().min(1).max(64),
  templateId: z.string().max(40).optional(),
  title: z.string().trim().max(200).optional(),
  periodLabel: z.string().trim().max(60).nullable().optional(),
  dueOn: isoDay.nullable().optional(),
  cadenceDays: z.number().int().min(1).max(30).optional(),
  items: z.array(z.object({ kind: itemKind, label: z.string().trim().min(1).max(300), help: z.string().max(500).nullable().optional() })).max(60).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole(...STAFF);
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(request, createSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: 400 });
  const b = body.data;
  try {
    const list = b.templateId
      ? await createRequestListFromTemplate(guard.ctx, { engagementId: b.engagementId, templateId: b.templateId, periodLabel: b.periodLabel, dueOn: b.dueOn, title: b.title })
      : await createRequestList(guard.ctx, {
          engagementId: b.engagementId,
          title: b.title ?? '',
          periodLabel: b.periodLabel,
          dueOn: b.dueOn,
          cadenceDays: b.cadenceDays,
          items: b.items ?? [],
        });
    return NextResponse.json({ list }, { status: 201 });
  } catch (e) {
    return requestListError(e);
  }
}
