import { NextResponse } from 'next/server';
import { optionalViewer } from '@/auth/guards';
import { systemOpenShareLink } from '@/db/repositories/receivables';
import { clientIp, createRateLimiter } from '@/lib/growth/demo-request';
import { receivablesWorkbook, receivablesWorkbookName } from '@/lib/receivables/xlsx';

/**
 * GET /api/public/receivables/share/:token/export — the rows of a shared view as Excel (Phase 10).
 * Public on purpose, like the page: the token plus the link's visibility rule is the authority,
 * checked against the session when there is one (`systemOpenShareLink`). A link that hides the
 * download, or that this viewer may not open, gets the same 404 as an unknown token, and a
 * download does not count as a view.
 */
const limiter = createRateLimiter({ limit: 30, windowMs: 10 * 60_000 });

const NOT_FOUND = () => NextResponse.json({ error: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  if (!limiter.take(clientIp(request.headers))) {
    return NextResponse.json({ error: 'Too many downloads. Try again in a few minutes.' }, { status: 429 });
  }
  const { token } = await context.params;
  const viewer = await optionalViewer();
  const out = await systemOpenShareLink(token, viewer, { log: false });
  if (out.status !== 'ok' || !out.view.link.allowDownload) return NOT_FOUND();
  const { view } = out;
  const bytes = await receivablesWorkbook(view.rows, view.today);
  const name = receivablesWorkbookName(`${view.clientOrgName} ${view.link.name}`.trim() || 'Receivables', view.today);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w .-]/g, '')}"`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
