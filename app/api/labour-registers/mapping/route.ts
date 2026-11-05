import { NextResponse } from 'next/server';
import { z } from 'zod';

import { UPLOAD_SLOTS } from '@/lib/labour-registers/parse';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import { getBatch, listUploads, saveColumnMap } from '@/db/repositories/labour-registers';
import { normaliseHeader } from '@/lib/labour-registers/normalise';
import type { UploadSlot } from '@/lib/labour-registers/parse';

/**
 * Save a confirmed column mapping.
 *
 * It is stored against the **engagement**, not the batch, which is what makes the second month
 * free: `getColumnMap` reads it back for whatever period comes next, the matcher is handed it
 * as `remembered`, and those headings are claimed before anything else is scored.
 *
 * The heading is stored **as the file spells it**, not normalised. `buildDataset` reads a cell
 * by that spelling, so a normalised "emp no" would find nothing in a sheet whose column is
 * "Emp No" — every register would come out empty. Normalising happens at the matcher's own
 * boundary instead (`load-mapping.ts`), which is the only place that compares headings rather
 * than reading by them, and is what lets a change from "Emp No" to "Emp. No." between months
 * still be remembered.
 *
 * `lastHeaders` is stored alongside: the full shape of the file the mapping was confirmed
 * against, so next month's upload can be diffed against it and the screen can open by saying
 * what moved rather than making somebody look.
 *
 * One column may fill one field. The screen prevents a clash and this refuses one, because a
 * column silently feeding two registers is not an error anybody finds in time.
 *
 * POST /api/labour-registers/mapping  { batchId, slot, mapping, valueMaps? }
 */
const bodySchema = z.object({
  batchId: z.string().min(1).max(64),
  slot: z.enum(UPLOAD_SLOTS),
  /** Canonical field to the heading it is taken from, as the client's file spells it. */
  mapping: z.record(z.string().min(1).max(80), z.string().min(1).max(300)),
  /** Per field, the client's own values to ours. */
  valueMaps: z.record(z.string().min(1).max(80), z.record(z.string().max(80), z.string().max(80))).optional(),
});

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  const { batchId, slot, mapping, valueMaps } = body.data;

  const batch = await getBatch(guard.ctx, batchId);
  if (!batch) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (batch.markedReadyAt) {
    return NextResponse.json(
      { error: 'The period is closed. Reopen the inputs to change the mapping.' },
      { status: 409 },
    );
  }

  const claimed = new Map<string, string>();
  for (const [field, heading] of Object.entries(mapping)) {
    const already = claimed.get(heading);
    if (already) {
      return NextResponse.json(
        { error: `"${heading}" is mapped to both ${already} and ${field}. A column can fill one field only.` },
        { status: 400 },
      );
    }
    claimed.set(heading, field);
  }

  /* The mapping must refer to columns the uploaded file actually has. A stale screen offering
     last month's headings would otherwise save a mapping that silently maps to nothing. */
  const uploads = await listUploads(guard.ctx, batch.id);
  const upload = uploads.find((u) => u.slot === slot);
  if (!upload) return NextResponse.json({ error: 'That slot has nothing uploaded.' }, { status: 409 });

  const headers = (upload.headers ?? []) as string[];
  const known = new Set(headers.map(normaliseHeader));
  const unknown = Object.values(mapping).filter((h) => !known.has(normaliseHeader(h)));
  if (unknown.length > 0) {
    return NextResponse.json(
      { error: `Not a column of the uploaded file: ${unknown.slice(0, 3).join(', ')}. Reload and try again.` },
      { status: 409 },
    );
  }

  /* Stored as the file spells it. The heading a register is read by and the heading the
     matcher compares are not the same string, and this is the one that has to read. */
  const exact = Object.fromEntries(
    Object.entries(mapping).map(([field, heading]) => {
      const actual = headers.find((h) => normaliseHeader(h) === normaliseHeader(heading));
      return [field, actual ?? heading];
    }),
  );

  await saveColumnMap(guard.ctx, {
    engagementId: batch.engagementId,
    slot: slot as UploadSlot,
    mapping: exact,
    valueMaps: valueMaps ?? {},
    lastHeaders: headers,
  });

  return NextResponse.json({ saved: Object.keys(exact).length, slot });
}
