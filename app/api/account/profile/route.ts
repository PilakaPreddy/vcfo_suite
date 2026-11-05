import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwnAccount } from '@/auth/guards';
import { getOwnProfile, updateOwnProfile } from '@/db/repositories/profiles';
import { parseJsonBody } from '@/lib/api/parse-body';
import { emailSchema } from '@/lib/api/schemas';
import { publicErrorMessage } from '@/lib/api-error';

const patchSchema = z.object({
  name: z.string().trim().min(1, 'name_required').max(120),
  phone: z.string().trim().max(32).optional().nullable(),
  /** WhatsApp destination in E.164. Null clears it. */
  phoneE164: z
    .union([z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'invalid_phone_e164'), z.null()])
    .optional(),
  /** true = give consent, false = withdraw it. Omitted leaves consent untouched. */
  whatsappOptIn: z.boolean().optional(),
  email: emailSchema.optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  /** Staff title, such as "Senior manager" (P-617). Null clears it. */
  designation: z.string().trim().max(80).optional().nullable(),
  /** ICAI or ICSI membership number: letters, digits, "/" and "-". Null or "" clears it. */
  membershipNo: z
    .union([z.string().trim().max(24).regex(/^[A-Za-z0-9/-]*$/, 'invalid_membership_no'), z.null()])
    .optional(),
});

/** GET /api/account/profile — own profile for settings. */
export async function GET() {
  const auth = await requireOwnAccount();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const profile = await getOwnProfile(auth.ctx);
    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json({ ok: false, error: 'account_not_found' }, { status: 404 });
  }
}

/** PATCH /api/account/profile — update name / phone / email (email needs password). */
export async function PATCH(request: Request) {
  const auth = await requireOwnAccount();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) {
    return NextResponse.json({ ok: false, error: body.error }, { status: body.status });
  }

  try {
    const result = await updateOwnProfile(auth.ctx, body.data);
    if (result.ok === false) {
      const status =
        result.error === 'account_not_found'
          ? 404
          : result.error === 'email_already_registered'
            ? 409
            : 401;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }
    return NextResponse.json({
      ok: true,
      profile: {
        name: result.name,
        email: result.email,
        phone: result.phone,
        designation: result.designation ?? null,
        membershipNo: result.membershipNo ?? null,
      },
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'update_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
