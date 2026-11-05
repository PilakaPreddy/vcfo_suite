import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAnyRole, type AuthContext } from '@/auth/guards';
import { rejectLargeBody } from '@/lib/api/body-limit';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getOutlookStatus, sendMailViaOutlook } from '@/db/repositories/outlook-connections';
import { getEmailTemplate } from '@/db/repositories/email-templates';
import { resolveVaultFiles } from '@/db/repositories/documents';
import { expandMailGroups, MailGroupError } from '@/db/repositories/mail-groups';
import { wrapComposeBodyHtml, type EmailBranding } from '@/lib/email/compose-branding';
import {
  appendSignatureHtml,
  appendSignatureText,
  attachmentContentType,
  attachmentFileName,
  attachmentLimitError,
  ATTACHMENTS_MAX_COUNT,
  base64ByteLength,
} from '@/lib/outlook/mail-extras';
import type { GraphFileAttachment } from '@/lib/outlook/oauth';
import { getObjectBuffer } from '@/storage/s3';
import { publicErrorMessage } from '@/lib/api-error';

const emailList = z.union([z.string().email(), z.array(z.string().email())]);

const bodySchema = z.object({
  to: emailList.optional(),
  cc: emailList.optional(),
  subject: z.string().trim().min(1).max(500),
  text: z.string().max(20000).optional(),
  html: z.string().max(50000).optional(),
  branding: z.enum(['sbc', 'plain']).optional(),
  templateId: z.string().uuid().optional(),
  /** Mail groups (G-23) the caller may use; each expands to its addresses on send. */
  groupIds: z.array(z.string().uuid()).max(20).optional(),
  /** Files sent with the message as base64 (JSON form of the request). */
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        contentType: z.string().max(200).optional(),
        contentBase64: z.string().min(1).max(5_000_000),
      }),
    )
    .max(ATTACHMENTS_MAX_COUNT)
    .optional(),
  /** Vault documents (documents-table ids) attached by reference; read through the scoped repository. */
  documentIds: z.array(z.string().uuid()).max(ATTACHMENTS_MAX_COUNT).optional(),
});

type SendBody = z.infer<typeof bodySchema>;

/** 10 MB of files plus base64 growth and the rest of the form. */
const MAX_REQUEST_BYTES = 14 * 1024 * 1024;

function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

type Parsed = { ok: true; data: SendBody; files: File[] } | { ok: false; status: number; error: string };

/**
 * JSON, or multipart with the same JSON in a `payload` field and the files under `files`.
 */
async function readBody(request: Request): Promise<Parsed> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    const parsed = await parseJsonBody(request, bodySchema);
    if (parsed.ok === false) return parsed;
    return { ok: true, data: parsed.data, files: [] };
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, status: 400, error: 'invalid_form' };
  }
  let json: unknown;
  try {
    json = JSON.parse(String(form.get('payload') ?? ''));
  } catch {
    return { ok: false, status: 400, error: 'invalid_payload' };
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: 400, error: parsed.error.issues[0]?.message || 'invalid_body' };
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  return { ok: true, data: parsed.data, files };
}

/**
 * Every attachment as Graph wants it, after the size limits. Uploaded files and base64 parts
 * are measured before they are read; vault documents are read through the documents repository
 * (scoped to the caller) and their bytes come from S3.
 */
async function collectAttachments(
  ctx: AuthContext,
  data: SendBody,
  files: File[],
): Promise<{ ok: true; attachments: GraphFileAttachment[] } | { ok: false; status: number; error: string }> {
  const inline = data.attachments ?? [];
  const docIds = [...new Set(data.documentIds ?? [])];
  const vault = docIds.length > 0 ? await resolveVaultFiles(ctx, docIds.map((documentId) => ({ documentId }))) : [];
  if (vault.length !== docIds.length) {
    return { ok: false, status: 400, error: 'document_not_found' };
  }

  const known = [
    ...files.map((f) => ({ name: f.name, size: f.size })),
    ...inline.map((a) => ({ name: a.name, size: base64ByteLength(a.contentBase64) })),
    ...vault.map((v) => ({ name: v.fileName, size: v.sizeBytes ?? 0 })),
  ];
  const early = attachmentLimitError(known);
  if (early) return { ok: false, status: 400, error: early };

  const out: GraphFileAttachment[] = [];
  for (const f of files) {
    out.push({
      name: attachmentFileName(f.name),
      contentType: attachmentContentType(f.type),
      contentBase64: Buffer.from(await f.arrayBuffer()).toString('base64'),
    });
  }
  for (const a of inline) {
    out.push({
      name: attachmentFileName(a.name),
      contentType: attachmentContentType(a.contentType),
      contentBase64: a.contentBase64.replace(/\s+/g, ''),
    });
  }
  const measured = [...known.slice(0, files.length + inline.length)];
  for (const v of vault) {
    const bytes = await getObjectBuffer(v.storageKey);
    if (!bytes) return { ok: false, status: 400, error: `${v.fileName} is missing from storage` };
    measured.push({ name: v.fileName, size: bytes.length });
    // The index row's size can be missing or stale, so measure the bytes as read.
    const late = attachmentLimitError(measured);
    if (late) return { ok: false, status: 400, error: late };
    out.push({
      name: attachmentFileName(v.fileName),
      contentType: attachmentContentType(v.contentType),
      contentBase64: bytes.toString('base64'),
    });
  }
  return { ok: true, attachments: out };
}

/**
 * POST /api/outlook/send — Graph Mail.Send from the linked mailbox.
 *
 * JSON body, or multipart (`payload` JSON + `files`). Recipients come from `to`, `cc` and
 * `groupIds` (mail groups expand to their addresses here). Attachments: uploaded files,
 * base64 `attachments` and vault `documentIds`, up to 3 MB each and 10 MB in all; anything
 * larger is a 400 with a plain message. When the caller's signature is on (K-40), it is added
 * under the body.
 */
export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const tooLarge = rejectLargeBody(request, MAX_REQUEST_BYTES);
  if (tooLarge) {
    return tooLarge.status === 413
      ? NextResponse.json({ error: 'Attachments are over 10 MB in all' }, { status: 400 })
      : tooLarge;
  }

  const body = await readBody(request);
  if (body.ok === false) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }
  const data = body.data;

  let groupAddresses: string[];
  try {
    groupAddresses = await expandMailGroups(guard.ctx, data.groupIds ?? []);
  } catch (err) {
    const status = err instanceof MailGroupError ? err.status : 400;
    return NextResponse.json({ error: publicErrorMessage(err, 'groups_failed') }, { status });
  }
  if ((data.groupIds?.length ?? 0) > 0 && groupAddresses.length === 0) {
    return NextResponse.json({ error: 'group_not_found' }, { status: 400 });
  }

  const to = [...new Set([...asList(data.to), ...groupAddresses].map((a) => a.trim().toLowerCase()))];
  if (to.length === 0) {
    return NextResponse.json({ error: 'recipient_required' }, { status: 400 });
  }
  if (to.length > 500) {
    return NextResponse.json({ error: 'too_many_recipients' }, { status: 400 });
  }
  const cc = asList(data.cc).filter((a) => !to.includes(a.trim().toLowerCase()));

  let branding: EmailBranding = data.branding ?? 'plain';
  if (data.templateId) {
    try {
      const template = await getEmailTemplate(guard.ctx, data.templateId);
      if (!template) {
        return NextResponse.json({ error: 'template_not_found' }, { status: 400 });
      }
      branding = template.branding;
    } catch (err) {
      const message = publicErrorMessage(err, 'template_failed');
      const status = message.includes('not permitted') ? 403 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  let signature: string | null = null;
  try {
    const status = await getOutlookStatus(guard.ctx);
    if (status.signatureEnabled) signature = status.signatureText;
  } catch {
    signature = null;
  }

  const rawText = data.text?.trim() ?? '';
  const text = rawText ? appendSignatureText(rawText, signature) : '';
  const givenHtml = data.html?.trim();
  const html = givenHtml
    ? appendSignatureHtml(givenHtml, signature)
    : text
      ? wrapComposeBodyHtml(text, branding, data.subject)
      : '';
  if (!html) {
    return NextResponse.json({ error: 'body_required' }, { status: 400 });
  }

  const attached = await collectAttachments(guard.ctx, data, body.files);
  if (attached.ok === false) {
    return NextResponse.json({ error: attached.error }, { status: attached.status });
  }

  try {
    const sent = await sendMailViaOutlook(guard.ctx, {
      to,
      cc,
      subject: data.subject,
      html,
      text: text || undefined,
      attachments: attached.attachments,
    });
    return NextResponse.json({
      ok: true,
      from: sent.msEmail,
      to,
      attachments: attached.attachments.length,
      signature: Boolean(signature?.trim()),
    });
  } catch (err) {
    const message = publicErrorMessage(err, 'send_failed');
    const status =
      message === 'outlook_not_connected'
        ? 409
        : message === 'outlook_not_configured'
          ? 503
          : message.includes('not permitted')
            ? 403
            : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
