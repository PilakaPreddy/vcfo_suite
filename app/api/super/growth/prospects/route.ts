import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  createProspect,
  createProspectFromDemoRequest,
  listProspectOwners,
  listProspects,
} from '@/db/repositories/prospects';
import { prospectCreateSchema } from '@/lib/growth/prospect-schema';
import { publicErrorMessage } from '@/lib/api-error';

/**
 * GET  /api/super/growth/prospects — the sales pipeline and the owner picker (G-21).
 * POST /api/super/growth/prospects — add a prospect, or `{ demoRequestId }` to add one from a
 * demo request ("Add as prospect").
 *
 * Super admin only (`requireSuperAdmin`); the repository refuses every other role again.
 */
function errorStatus(message: string): number {
  if (message === 'invalid_owner' || message === 'already_added') return 400;
  if (message.includes('super admin')) return 403;
  return 500;
}

export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const [prospects, owners] = await Promise.all([listProspects(guard.ctx), listProspectOwners(guard.ctx)]);
  return NextResponse.json({ prospects, owners });
}

export async function POST(request: Request) {
  const guard = await requireSuperAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, prospectCreateSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error, issues: body.issues }, { status: 400 });
  }
  try {
    const input = body.data;
    if ('demoRequestId' in input) {
      const prospect = await createProspectFromDemoRequest(guard.ctx, input.demoRequestId, { ownerId: input.ownerId });
      if (!prospect) return NextResponse.json({ error: 'Demo request not found' }, { status: 404 });
      return NextResponse.json({ prospect }, { status: 201 });
    }
    const prospect = await createProspect(guard.ctx, {
      ...input,
      company: input.company ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      nextStepOn: input.nextStepOn ?? null,
    });
    return NextResponse.json({ prospect }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    return NextResponse.json({ error: message }, { status: errorStatus(message) });
  }
}
