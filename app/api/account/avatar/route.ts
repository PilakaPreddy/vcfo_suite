import { NextResponse } from 'next/server';
import { requireOwnAccount } from '@/auth/guards';
import {
  getOwnAvatarObjectKey,
  setOwnAvatarObjectKey,
} from '@/db/repositories/profiles';
import {
  MAX_AVATAR_BYTES,
  AVATAR_EXTENSIONS,
  profileAvatarObjectKey,
  sniffImageContentType,
} from '@/lib/account-avatar';
import { resolveUploadExtension } from '@/lib/upload-limits';
import { deleteObject, getObjectBuffer, putObject } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

/** GET /api/account/avatar — stream the signed-in user’s photo. */
export async function GET() {
  const auth = await requireOwnAccount();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const key = await getOwnAvatarObjectKey(auth.ctx);
    if (!key) return new NextResponse(null, { status: 404 });
    const bytes = await getObjectBuffer(key);
    if (!bytes) return new NextResponse(null, { status: 404 });
    const contentType = sniffImageContentType(bytes) ?? 'image/jpeg';
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=120',
      },
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'avatar_failed');
    const status = message === 'account_not_found' ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/** POST /api/account/avatar — multipart `file`; replaces any previous photo. */
export async function POST(request: Request) {
  const auth = await requireOwnAccount();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'invalid_form' }, { status: 400 });
  }

  const ext = resolveUploadExtension(file, AVATAR_EXTENSIONS);
  if (!ext) {
    return NextResponse.json({ ok: false, error: 'unsupported_type' }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > MAX_AVATAR_BYTES) {
    return NextResponse.json({ ok: false, error: 'file_too_large' }, { status: 400 });
  }

  const contentType = sniffImageContentType(bytes);
  if (!contentType) {
    return NextResponse.json({ ok: false, error: 'unsupported_type' }, { status: 400 });
  }

  try {
    const key = profileAvatarObjectKey(auth.ctx.userId);
    await putObject(key, bytes, contentType);
    const result = await setOwnAvatarObjectKey(auth.ctx, key);
    return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl });
  } catch (err) {
    const message = publicErrorMessage(err, 'upload_failed');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** DELETE /api/account/avatar — remove the signed-in user’s photo. */
export async function DELETE() {
  const auth = await requireOwnAccount();
  if (auth.ok === false) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  try {
    const existing = await getOwnAvatarObjectKey(auth.ctx);
    const result = await setOwnAvatarObjectKey(auth.ctx, null);
    if (existing) {
      await deleteObject(existing).catch(() => undefined);
    }
    return NextResponse.json({ ok: true, avatarUrl: result.avatarUrl });
  } catch (err) {
    const message = publicErrorMessage(err, 'remove_failed');
    const status = message === 'account_not_found' ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
