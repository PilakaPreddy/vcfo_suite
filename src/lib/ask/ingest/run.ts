import 'server-only';

import {
  systemGetAskDocument,
  systemReplaceAskChunks,
  systemSetAskDocumentResult,
} from '@/db/repositories/ask-documents';
import { systemRecordAskUsage, systemTodayTokenTotal } from '@/db/repositories/ask-usage';
import { getObjectBuffer } from '@/storage/s3';
import { askBudgets, askConfig } from '@/lib/ask/config';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';
import { getAskProvider } from '@/lib/ask/provider';
import { meterProvider } from '@/lib/ask/provider/meter';
import { chunkDocument } from './chunk';
import { contextualizeChunks } from './contextualize';
import { ExtractError, extractSourceText } from './extract';

export const ASK_INGEST_EVENT = 'ask/document.ingest';

/** Storage key convention for uploaded Ask VCFO sources (knowledge-bank prefix). */
export function askSourceStoragePath(documentId: string, fileName: string): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'source';
  return `ask-sources/${documentId}/${safe}`;
}

/**
 * Extract → chunk → contextualize → replace chunks → ready → embed. Idempotent:
 * the chunk set is replaced wholesale, so a retry never duplicates rows. Any
 * failure marks the source `failed` with a readable reason. Model calls count
 * toward the daily token budget; past it, a text PDF still indexes without
 * context prefixes and a scan waits for a retry.
 */
export async function runAskIngestion(documentId: string): Promise<{ status: 'ready' | 'failed' | 'skipped'; chunks: number }> {
  const doc = await systemGetAskDocument(documentId);
  if (!doc || doc.status === 'archived') return { status: 'skipped', chunks: 0 };
  if (!doc.s3Key) {
    // A source loaded from this repository has no file. Its text comes from the load script.
    await systemSetAskDocumentResult(doc.id, { status: 'ready' });
    return { status: 'skipped', chunks: 0 };
  }
  const configured = await getAskProvider();
  const provider = configured ? meterProvider(configured) : null;
  try {
    const bytes = await getObjectBuffer(doc.s3Key);
    if (!bytes) throw new ExtractError('The uploaded file is missing from storage.');
    const config = askConfig();
    const usable = provider && (await systemTodayTokenTotal()) < askBudgets().dailyTokens ? provider : null;
    const text = await extractSourceText({
      bytes,
      fileName: doc.s3Key.split('/').pop() ?? doc.s3Key,
      contentType: null,
      provider: usable,
      model: config.models.extract,
    });
    const chunks = chunkDocument(text);
    if (chunks.length === 0) throw new ExtractError('No text was found in this file.');
    const prefixes = await contextualizeChunks({
      provider: usable,
      model: config.models.contextualizer,
      title: doc.title,
      documentText: text,
      chunks,
    });
    await systemReplaceAskChunks(
      doc.id,
      chunks.map((c, i) => ({ ordinal: c.ordinal, text: c.text, contextPrefix: prefixes[i] ?? null })),
    );
    await systemSetAskDocumentResult(doc.id, { status: 'ready' });
    // Search works on full text meanwhile, and the sweep fills what this misses.
    await backfillEmbeddings().catch((error) => console.warn('[ask-vcfo] embedding failed; the backfill will retry', error));
    return { status: 'ready', chunks: chunks.length };
  } catch (error) {
    const reason = error instanceof ExtractError ? error.message : 'Indexing failed. Try again.';
    console.error('[ask-vcfo] ingestion failed', documentId, error);
    await systemSetAskDocumentResult(doc.id, { status: 'failed', error: reason });
    return { status: 'failed', chunks: 0 };
  } finally {
    const spend = provider?.spend() ?? [];
    if (spend.length > 0) await systemRecordAskUsage('ingest', spend).catch((error) => console.error('[ask-vcfo] usage not recorded', error));
  }
}

/**
 * Queue ingestion on Inngest; when no Inngest is reachable (local dev, or
 * cloud keys not yet set) run it in-process so a source never sits in
 * "processing" forever.
 */
export async function queueAskIngestion(documentId: string): Promise<'queued' | 'inline'> {
  try {
    const { inngest } = await import('@/jobs/client');
    await inngest.send({ name: ASK_INGEST_EVENT, data: { documentId } });
    return 'queued';
  } catch (error) {
    console.warn('[ask-vcfo] inngest unavailable; indexing inline', error);
    void runAskIngestion(documentId);
    return 'inline';
  }
}
