import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { importLibrary, listLibrary } from '@/db/repositories/board-meetings';
import { meetingError } from '../board-meetings/_respond';

/**
 * GET  /api/agenda-library[?all=1] — the SBC agenda master (every staff role; `all` adds inactive
 *      items for firm-wide admins).
 * POST /api/agenda-library — import rows from an uploaded sheet (parsed in the browser). Admins.
 */
export async function GET(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  try {
    return NextResponse.json(await listLibrary(guard.ctx, { includeInactive: new URL(request.url).searchParams.get('all') === '1' }));
  } catch (e) {
    return meetingError(e);
  }
}

const row = z.object({
  id: z.string().min(1).max(20),
  topic: z.string().max(200),
  scenario: z.string().max(300),
  wording: z.string().max(2000),
  law: z.string().max(300).optional(),
  applicability: z.string().max(200).optional(),
  action: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const body = await parseJsonBody(request, z.object({ items: z.array(row).min(1).max(2000) }));
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    return NextResponse.json(await importLibrary(guard.ctx, body.data.items));
  } catch (e) {
    return meetingError(e);
  }
}
