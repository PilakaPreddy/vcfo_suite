import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BoardMeetingError } from '@/db/repositories/board-meetings';

/**
 * Shared parts of the /api/board-meetings routes (docs/specs/board-meetings/PLAN.md): the error
 * mapping and field schemas. Repository errors carry their HTTP status and a short code.
 */
export function meetingError(e: unknown) {
  if (e instanceof BoardMeetingError) return NextResponse.json({ error: e.code }, { status: e.status });
  console.error('[board-meetings] route failed', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date');
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'invalid_time');

export const agendaItem = z.object({
  key: z.string().max(40),
  libraryId: z.string().max(20).nullable(),
  text: z.string().max(2000),
  subs: z.array(z.string().max(1000)).max(20).default([]),
  fixed: z.enum(['top', 'end']).optional(),
});

export const recipient = z.object({
  kind: z.enum(['to', 'cc']),
  directorId: z.string().uuid().nullable(),
  name: z.string().max(120),
  email: z.string().max(200).nullable(),
  role: z.string().max(60).nullable(),
});

export const secondZone = z.object({ label: z.string().max(12), time: hhmm }).nullable();

export type RouteContext = { params: Promise<{ id: string }> };
export type DocContext = { params: Promise<{ docId: string }> };

/** A PDF from a multipart body (`file`). */
export async function pdfFrom(request: Request): Promise<{ name: string; type: string; bytes: Uint8Array } | null> {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return null;
  return { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export const resolutionSchema = z.object({
  title: z.string().min(1, 'title_required').max(200),
  description: z.string().min(1, 'description_required').max(4000),
  resolutionDate: isoDate,
  changesItem: z.string().max(200).nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  signerIds: z.array(z.string().uuid()).min(1, 'signers_required').max(30),
});
