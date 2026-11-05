import { NextResponse } from 'next/server';
import { requireAnyRole } from '@/auth/guards';
import { fetchOwnOutlookPhoto } from '@/db/repositories/outlook-connections';
import { setOwnAvatarObjectKey } from '@/db/repositories/profiles';
import {
  MAX_AVATAR_BYTES,
  profileAvatarObjectKey,
  sniffImageContentType,
} from '@/lib/account-avatar';
import { putObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

/** POST /api/account/avatar/outlook — copy Graph `/me/photo` into the user’s avatar. */
export async function POST() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  try {
    const photo = await fetchOwnOutlookPhoto(guard.ctx);
    if (photo.bytes.length > MAX_AVATAR_BYTES) {
      return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
    }
    const contentType = sniffImageContentType(photo.bytes);
    if (!contentType) {
      return NextResponse.json({ ok: false, error: 'unsupported_type' }, { status: 400 });
    }
    const key = profileAvatarObjectKey(guard.ctx.userId);
    await putObject(key, photo.bytes, contentType);
    const result = await setOwnAvatarObjectKey(guard.ctx, key);
    return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl });
  } catch (err) {
    const message = publicErrorMessage(err, 'outlook_photo_failed');
    const status =
      message === 'outlook_not_connected'
        ? 409
        : message === 'outlook_photo_missing'
          ? 404
          : message.includes('not permitted')
            ? 403
            : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
