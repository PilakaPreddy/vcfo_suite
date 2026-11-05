import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminOrManager } from '@/auth/guards';
import { deleteProfileAccount, updatePersonEmail } from '@/db/repositories/profiles';
import { recordAuditEvent } from '@/db/repositories/audit-events';
import { parseJsonBody } from '@/lib/api/parse-body';
import { emailSchema } from '@/lib/api/schemas';
import { publicErrorMessage } from '@/lib/api-error';

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  email: emailSchema,
});

/** PATCH /api/admin/people/[id] — change sign-in email (admin anyone; manager leads). */
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
  }

  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  try {
    const updated = await updatePersonEmail(auth.ctx, id.trim(), body.data.email);
    await recordAuditEvent(auth.ctx, {
      action: 'account.email_change',
      summary: `Changed email for ${updated.name}`,
      metadata: {
        profileId: updated.id,
        previousEmail: updated.previousEmail,
        email: updated.email,
      },
    });
    return NextResponse.json({ ok: true, ...updated });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    const status =
      message === 'not_found'
        ? 404
        : message === 'email_already_registered'
          ? 409
          : message === 'managers_may_only_edit_leads' ||
              message === 'lead_not_in_your_roster' ||
              message === 'cannot_edit_super_admin' ||
              message === 'Not permitted'
            ? 403
            : 400;
    const friendly: Record<string, string> = {
      managers_may_only_edit_leads: 'Managers can only change emails for project leads.',
      lead_not_in_your_roster: 'That project lead is not on your roster.',
      cannot_edit_super_admin: 'Only a super admin can change that account.',
      email_already_registered: 'That email is already in use.',
      not_found: 'Account not found.',
    };
    return NextResponse.json(
      { ok: false, error: friendly[message] ?? message },
      { status },
    );
  }
}

/** DELETE /api/admin/people/[id] — admin: anyone; manager: their leads. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireAdminOrManager();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: 'missing_id' }, { status: 400 });
  }

  try {
    const deleted = await deleteProfileAccount(auth.ctx, id.trim());
    await recordAuditEvent(auth.ctx, {
      action: 'account.delete',
      summary: `Deleted ${deleted.role} account ${deleted.name}`,
      metadata: { email: deleted.email, role: deleted.role, deletedId: deleted.deletedId },
    });
    return NextResponse.json({ ok: true, ...deleted });
  } catch (err) {
    const message = publicErrorMessage(err, 'delete_failed');
    const status =
      message === 'not_found'
        ? 404
        : message === 'cannot_delete_self' ||
            message === 'cannot_delete_last_admin' ||
            message === 'managers_may_only_delete_leads' ||
            message === 'lead_not_in_your_roster' ||
            message === 'cannot_edit_super_admin'
          ? 403
          : 400;
    const friendly: Record<string, string> = {
      cannot_delete_self: 'You cannot delete your own account.',
      cannot_delete_last_admin: 'Cannot delete the last firm admin.',
      cannot_edit_super_admin: 'Only a super admin can remove that account.',
      managers_may_only_delete_leads: 'Managers can only delete project leads.',
      lead_not_in_your_roster: 'That project lead is not on your roster.',
      not_found: 'Account not found.',
      account_still_referenced: 'Account is still linked to firm data. Try again or contact support.',
    };
    return NextResponse.json(
      { ok: false, error: friendly[message] ?? message },
      { status },
    );
  }
}
