import { NextResponse } from 'next/server';

const MESSAGE: Record<string, string> = {
  not_found: 'This file is no longer here.',
  forbidden: 'You do not have access to this file.',
  download_failed: 'This file could not be loaded right now. Try again in a minute, or download it instead.',
};

/**
 * The error answer of a file route. A preview frame or a new tab loads the route as a page
 * (`Accept: text/html`), and a JSON body would show there as raw text. That request gets a short
 * readable page in the app's colours instead; every other caller still gets the JSON error.
 */
export function fileErrorResponse(request: Request, code: string, status: number): NextResponse {
  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/html')) return NextResponse.json({ error: code }, { status });
  const text = MESSAGE[code] ?? MESSAGE.download_failed!;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>File not available</title><style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f8fb;color:#3c4f69}
@media (prefers-color-scheme:dark){body{background:#13151a;color:#b6beca}}
p{max-width:32ch;margin:16px;text-align:center}
</style></head><body><p>${text}</p></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
