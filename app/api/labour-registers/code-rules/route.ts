import { NextResponse } from 'next/server';
import { z } from 'zod';

import { requireAnyRole } from '@/auth/guards';
import { parseJsonBody } from '@/lib/api/parse-body';
import {
  clearCodeRuleOverride,
  listCodeRuleOverrides,
  saveCodeRuleOverride,
} from '@/db/repositories/labour-registers';
import { LABOUR_CODES } from '@/data/labour-registers/code-rules';
import { stateByCode } from '@/data/labour-registers/states';
import { codeRuleIndex, resolveCodeRules } from '@/lib/labour-registers/code-rules';

/**
 * Record how far a state has got under one of the four codes.
 *
 * Like the verification verdict, this belongs to no client: which rules govern registers in
 * Karnataka is the same question for every client in Karnataka. Unlike a form's layout it is a
 * fact about a state on a date rather than a property of the law, so the source and the date
 * are required rather than optional — an entry saying "notified" with nothing behind it is
 * worse than the research pass's reading, because it looks settled.
 *
 * It is not folded into any document's content address. A state's position decides which forms
 * a period calls for, and `formsFor` is run when a batch is opened and again when it is
 * generated; a change here therefore shows up on the next generation without re-keying the
 * documents already produced, which is correct — a register produced under last month's
 * reading was produced under last month's reading.
 *
 * GET    /api/labour-registers/code-rules
 * POST   /api/labour-registers/code-rules            { stateCode, code, stage, ... }
 * DELETE /api/labour-registers/code-rules?stateCode=KA&code=wages
 */
const CODE_KEYS = LABOUR_CODES.map((c) => c.key) as [string, ...string[]];

const bodySchema = z.object({
  stateCode: z.string().min(2).max(3),
  code: z.enum(CODE_KEYS),
  stage: z.enum(['notified', 'draft', 'none']),
  /** ISO date the rules were notified or the draft published. */
  notifiedOn: z.string().max(20).optional(),
  /** Where it was read: a gazette citation, a department circular, a tracker. */
  source: z.string().max(400).optional(),
  note: z.string().max(600).optional(),
});

export async function GET() {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern', 'client');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  return NextResponse.json({ overrides: await listCodeRuleOverrides(guard.ctx) });
}

export async function POST(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager', 'intern');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await parseJsonBody(request, bodySchema);
  if (body.ok === false) return NextResponse.json({ error: body.error }, { status: body.status });

  if (!stateByCode(body.data.stateCode)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  /* A position recorded with no source looks settled and is not. The research pass's own
     reading at least says it came from a tracker that disagreed with another tracker. */
  if (!body.data.source?.trim()) {
    return NextResponse.json(
      { error: 'Say where you read it. An entry with no source looks settled, which is the one thing this screen must not do.' },
      { status: 400 },
    );
  }
  if (body.data.stage !== 'none' && !body.data.notifiedOn?.trim()) {
    return NextResponse.json(
      { error: 'Give the date of the notification or the draft. A stage with no date cannot be compared with the next one.' },
      { status: 400 },
    );
  }

  const row = await saveCodeRuleOverride(guard.ctx, body.data);
  if (!row) return NextResponse.json({ error: 'not_saved' }, { status: 500 });

  const rules = resolveCodeRules(body.data.stateCode, codeRuleIndex([row]));
  return NextResponse.json({ rule: rules.find((r) => r.code === body.data.code) });
}

export async function DELETE(request: Request) {
  const guard = await requireAnyRole('super_admin', 'admin', 'manager');
  if (guard.ok === false) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const url = new URL(request.url);
  const stateCode = url.searchParams.get('stateCode');
  const code = url.searchParams.get('code');
  if (!stateCode || !code) return NextResponse.json({ error: 'state_and_code_required' }, { status: 400 });

  await clearCodeRuleOverride(guard.ctx, stateCode, code);
  return NextResponse.json({ rule: resolveCodeRules(stateCode).find((r) => r.code === code) });
}
