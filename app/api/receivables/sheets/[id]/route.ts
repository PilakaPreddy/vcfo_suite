import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/parse-body';
import { siteUrl } from '@/lib/site-url';
import { publicPageUrl } from '@/lib/receivables/links';
import { getManagerSheet, updateSheetSettings } from '@/db/repositories/receivables';
import { denied, guardReceivables, receivablesError, type RouteContext } from '../../_respond';
import { sheetDto } from '../../_dto';

/**
 * GET   /api/receivables/sheets/:id — the manager area: sheet, partners, the live draft, the
 *       unpublished change count and the latest version.
 * PATCH /api/receivables/sheets/:id — settings: whether the link needs the key, reminder rules.
 */
export async function GET(_request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  try {
    const data = await getManagerSheet(guard.ctx, id);
    return NextResponse.json({
      ...data,
      sheet: sheetDto(data.sheet),
      publicUrl: publicPageUrl(siteUrl(), data.sheet),
    });
  } catch (e) {
    return receivablesError(e);
  }
}

const rules = z.object({
  enabled: z.boolean(),
  daysBefore: z.array(z.number().int().min(1).max(60)).max(10),
  onDueDate: z.boolean(),
  dailyAfterDue: z.boolean(),
  skipWeekends: z.boolean(),
  sendHourIst: z.number().int().min(6).max(20),
});
const patchSchema = z.object({ requireKey: z.boolean().optional(), reminderRules: rules.optional() });

export async function PATCH(request: Request, context: RouteContext) {
  const guard = await guardReceivables();
  if (guard.ok === false) return denied(guard);
  const { id } = await context.params;
  const body = await parseJsonBody(request, patchSchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });
  try {
    const sheet = await updateSheetSettings(guard.ctx, id, body.data);
    return NextResponse.json({ sheet: sheetDto(sheet), publicUrl: publicPageUrl(siteUrl(), sheet) });
  } catch (e) {
    return receivablesError(e);
  }
}
