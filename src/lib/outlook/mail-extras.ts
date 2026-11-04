/**
 * Pure helpers for `/api/outlook/send` (G-23): the signature line (K-40) and the attachment
 * limits. Microsoft Graph takes a `fileAttachment` inline only under 3 MB, so each file is
 * capped there, and the firm caps one message at 10 MB in all.
 */

const ATTACHMENT_MAX_BYTES = 3 * 1024 * 1024;
const ATTACHMENTS_TOTAL_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENTS_MAX_COUNT = 20;

/** Add the signature under a plain-text body, after one blank line. */
export function appendSignatureText(text: string, signature: string | null | undefined): string {
  const sig = signature?.trim();
  if (!sig) return text;
  const body = text.replace(/\s+$/, '');
  return body ? `${body}\n\n${sig}` : sig;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Add the signature to an HTML body, before `</body>` when there is one. */
export function appendSignatureHtml(html: string, signature: string | null | undefined): string {
  const sig = signature?.trim();
  if (!sig) return html;
  const block = `<p style="margin:16px 0 0">${escapeHtml(sig).replace(/\n/g, '<br />')}</p>`;
  const close = html.search(/<\/body>/i);
  return close >= 0 ? `${html.slice(0, close)}${block}${html.slice(close)}` : `${html}${block}`;
}

/** Bytes a base64 string decodes to, without decoding it. */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s+/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

export interface AttachmentSize {
  name: string;
  size: number;
}

/**
 * The first limit a list of attachments breaks, as an error the route returns with a 400, or
 * null when it fits.
 */
export function attachmentLimitError(files: AttachmentSize[]): string | null {
  if (files.length > ATTACHMENTS_MAX_COUNT) {
    return `Attach up to ${ATTACHMENTS_MAX_COUNT} files`;
  }
  for (const f of files) {
    if (f.size > ATTACHMENT_MAX_BYTES) return `${f.name} is over 3 MB. Attach files up to 3 MB each.`;
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > ATTACHMENTS_TOTAL_MAX_BYTES) return 'Attachments are over 10 MB in all';
  return null;
}

/** A content type Graph will accept, or the generic binary type. */
export function attachmentContentType(value: string | null | undefined): string {
  const v = (value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(v) ? v : 'application/octet-stream';
}

/** A file name safe for a mail client: no path, no control characters. */
export function attachmentFileName(value: string): string {
  const base = value.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are what this strips
  return base.replace(/[\u0000-\u001f\u007f]+/g, '').trim().slice(0, 150) || 'attachment';
}
