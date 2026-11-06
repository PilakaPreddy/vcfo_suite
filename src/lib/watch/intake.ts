import 'server-only';

import { randomUUID } from 'node:crypto';
import type { AuthContext } from '@/auth/guards';
import { createManualRegUpdate } from '@/db/repositories/reg-updates';
import { assertSafeFeedUrl } from '@/lib/notifications/announcements';
import { putObject } from '@/storage/s3';
import { MAX_PDF_BYTES } from './fetch';
import { hostOf, queueWatchProcess } from './process';

/**
 * Manual intake is first-class: MCA and Income Tax India refuse the reader, so staff paste a link or
 * upload the PDF and it enters the same pipeline at the read step. A pasted link must still be on an
 * official host, and a site that refuses the reader for it is told apart so staff upload instead.
 */
export class WatchIntakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchIntakeError';
  }
}

export async function intakeLink(ctx: AuthContext, input: { url: string; title?: string; sourceId: string | null }): Promise<string> {
  let url: URL;
  try {
    url = assertSafeFeedUrl(input.url);
  } catch {
    throw new WatchIntakeError('Paste an https link from an official government site, or upload the PDF.');
  }
  const id = await createManualRegUpdate(ctx, { title: input.title?.trim() || url.pathname.split('/').pop() || url.hostname, url: url.href, sourceId: input.sourceId });
  await queueWatchProcess([{ id, host: url.hostname }]);
  return id;
}

export async function intakeFile(ctx: AuthContext, input: { name: string; bytes: Buffer; title?: string; sourceId: string | null }): Promise<string> {
  if (input.bytes.byteLength > MAX_PDF_BYTES) throw new WatchIntakeError('That file is over the 15 MB limit.');
  if (input.bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new WatchIntakeError('Upload a PDF file.');
  const s3Key = `watch/${randomUUID()}.pdf`;
  await putObject(s3Key, input.bytes, 'application/pdf');
  const id = await createManualRegUpdate(ctx, { title: input.title?.trim() || input.name.replace(/\.pdf$/i, ''), url: null, sourceId: input.sourceId, s3Key });
  await queueWatchProcess([{ id, host: hostOf(null) }]);
  return id;
}
