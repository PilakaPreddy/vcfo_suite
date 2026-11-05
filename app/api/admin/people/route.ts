import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, requireAdminOrManager } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  createAdminProfile,
  createInternProfile,
  createManagerProfile,
  listStaffPeople,
} from '@/db/repositories/profiles';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { publicErrorMessage } from '@/lib/api-error';

const DEFAULT_TEMP_PASSWORD = 'SBC@2026';

const createBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128).default(DEFAULT_TEMP_PASSWORD),
  name: z.string().trim().max(120).optional(),
  role: z.enum(['admin', 'manager', 'intern', 'client']), // client rejected in handler — use project create
  phone: z.string().trim().max(32).optional(),
  reportsToManagerId: z.string().uuid().optional(),
});

/** GET /api/admin/people — firm admin / super admin full roster. */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  try {
    const people = await listStaffPeople(auth.ctx);
    return NextResponse.json({ people });
  } catch (err) {
    const message = publicErrorMessage(err, 'list_failed');
    const status = message.includes('Only firm admins') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/admin/people
 * - Admin: admin | manager | intern
 * - Manager: intern only
 * Client accounts are created with projects (POST /api/engagements), not here.
 */
export async function POST(request: Request) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await parseJsonBody(request, createBodySchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  if (body.data.role === 'client') {
    return NextResponse.json(
      {
        ok: false,
        error: 'Create the client when adding a project (email + initial password).',
      },
      { status: 400 },
    );
  }

  if (auth.ctx.role === 'manager' && body.data.role !== 'intern') {
    return NextResponse.json(
      { ok: false, error: 'Managers may only create project leads.' },
      { status: 403 },
    );
  }

  const password = body.data.password || DEFAULT_TEMP_PASSWORD;

  try {
    if (body.data.role === 'admin') {
      const created = await createAdminProfile(auth.ctx, {
        email: body.data.email,
        password,
        fullName: body.data.name,
      });
      await recordAuditEvent(auth.ctx, {
        action: 'admin.create',
        summary: `Created firm admin ${created.name}`,
        metadata: { email: created.email },
      });
      return NextResponse.json({ ok: true, ...created, role: 'admin' }, { status: 201 });
    }

    if (body.data.role === 'manager') {
      const created = await createManagerProfile(auth.ctx, {
        email: body.data.email,
        password,
        fullName: body.data.name,
      });
      await recordAuditEvent(auth.ctx, {
        action: 'manager.create',
        summary: `Created project manager ${created.name}`,
        metadata: { email: created.email },
      });
      return NextResponse.json({ ok: true, ...created, role: 'manager' }, { status: 201 });
    }

    const created = await createInternProfile(auth.ctx, {
      email: body.data.email,
      password,
      fullName: body.data.name,
      phone: body.data.phone,
      reportsToManagerId:
        auth.ctx.role === 'manager'
          ? auth.ctx.userId
          : body.data.reportsToManagerId,
    });
    await recordAuditEvent(auth.ctx, {
      action: 'intern.create',
      summary: `Created project lead ${created.name}`,
      metadata: { email: created.email, internId: created.internId },
    });
    return NextResponse.json({ ok: true, ...created, role: 'intern' }, { status: 201 });
  } catch (err) {
    const message = publicErrorMessage(err, 'create_failed');
    if (message === 'email_already_registered') {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
