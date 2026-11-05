import { NextResponse } from 'next/server';
import { askUsageReport } from '@/db/repositories/ask-usage';
import { AskForbiddenError } from '@/lib/ask/access';
import { requireAsk } from '@/lib/ask/route-guard';


/** GET /api/ask/admin/usage?days=30 — tokens per path for a super admin. */
export async function GET(request: Request) {
  const gate = await requireAsk();
  if (gate.ok === false) return gate.response;
  const asked = Number(new URL(request.url).searchParams.get('days'));
  const days = [7, 30, 90].includes(asked) ? asked : 30;
  try {
    return NextResponse.json(await askUsageReport(gate.ctx, { days }));
  } catch (error) {
    if (error instanceof AskForbiddenError) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    console.error('[ask-vcfo] token report failed', error);
    return NextResponse.json({ error: 'Could not load token use' }, { status: 500 });
  }
}
