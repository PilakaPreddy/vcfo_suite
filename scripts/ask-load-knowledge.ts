import './load-env';

import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { askChunks, askDocuments, askIndexItems } from '@/db/schema';
import { systemLoadRepoDocument } from '@/db/repositories/ask-documents';
import { backfillEmbeddings } from '@/lib/ask/embeddings/backfill';
import { chunkDocument } from '@/lib/ask/ingest/chunk';
import { extractSourceText } from '@/lib/ask/ingest/extract';
import { buildRepoSources } from '@/lib/ask/ingest/repo-sources';
import { rebuildIndexCards } from '@/lib/ask/index-cards/refresh';
import { listTopics } from '@/lib/ask/topics';

/**
 * Loads what the repository holds into the Ask VCFO knowledge tables: the firm playbook, obligation
 * texts, statutory calendar, glossary and reviewed topics, plus the staff overview PDFs. It then
 * rebuilds the record cards and embeds whatever has no vector. Safe to run again: unchanged sources
 * stay as they are, and an archived source stays archived.
 *
 * Usage: npm run ask:knowledge:load
 */

const STAFF_PDFS = [
  { title: 'VCFO Suite overview', path: 'docs/overview/vcfo-suite-overview.pdf' },
  { title: 'Incorporation documents map', path: 'docs/overview/incorporation-docs-er.pdf' },
];

async function main() {
  for (const source of buildRepoSources(listTopics())) {
    const result = await systemLoadRepoDocument(source);
    console.log(`${result.padEnd(10)} ${source.title} (${source.chunks.length} chunks)`);
  }
  for (const pdf of STAFF_PDFS) {
    const bytes = await readFile(pdf.path).catch(() => null);
    if (!bytes) {
      console.log(`skipped    ${pdf.title}: ${pdf.path} is not here`);
      continue;
    }
    const text = await extractSourceText({ bytes, fileName: pdf.path, contentType: 'application/pdf', provider: null, model: '' });
    const chunks = chunkDocument(text).map((c) => c.text);
    const result = await systemLoadRepoDocument({ title: pdf.title, sourceType: 'firm_pdf', audience: 'staff', chunks });
    console.log(`${result.padEnd(10)} ${pdf.title} (${chunks.length} chunks)`);
  }

  console.log('record cards', await rebuildIndexCards());
  console.log('embedded', await backfillEmbeddings());

  const count = async (table: typeof askDocuments | typeof askChunks | typeof askIndexItems) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n;
  console.log(`rows: ask_documents ${await count(askDocuments)}, ask_chunks ${await count(askChunks)}, ask_index_items ${await count(askIndexItems)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
