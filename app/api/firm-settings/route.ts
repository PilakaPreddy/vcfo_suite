import { publicErrorMessage } from '@/lib/api-error';
import { NextResponse } from 'next/server';
import { requireAdmin, requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { firmSettingsPatchSchema } from '@/lib/firm-settings/firm-settings';
import {
  FirmSettingsForbiddenError,
  getFirmSettings,
  listFirmSettingsHistory,
  updateFirmSettings,
} from '@/db/repositories/firm-settings';

/**
 * GET /api/firm-settings — the firm's settings for any staff role. Firm-wide admins also get
 * the latest changes (`history`); other staff get an empty list.
 */
export async function GET() {
  const guard = await requireAnyRole('admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  try {
    const [settings, history] = await Promise.all([
      getFirmSettings(guard.ctx),
      listFirmSettingsHistory(guard.ctx),
    ]);
    return NextResponse.json({ settings, history });
  } catch (err) {
    if (err instanceof FirmSettingsForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = publicErrorMessage(err, 'read_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/firm-settings — admin and super admin change one or more fields. */
export async function PATCH(request: Request) {
  const guard = await requireAdmin();
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const body = await parseJsonBody(request, firmSettingsPatchSchema);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error, issues: body.issues }, { status: body.status });
  }
  try {
    const { settings, changes } = await updateFirmSettings(guard.ctx, body.data);
    return NextResponse.json({ settings, changed: changes.map((c) => c.field) });
  } catch (err) {
    if (err instanceof FirmSettingsForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = publicErrorMessage(err, 'update_failed');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
