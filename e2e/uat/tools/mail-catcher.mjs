// Test-only mail catcher for the acceptance run. Preload it into the app server with
//   NODE_OPTIONS="--import ./e2e/uat/tools/mail-catcher.mjs" RESEND_API_KEY=re_uat_catcher next start
// Every POST to the Resend API is answered here with a fake id and written, in full, to
// e2e/uat/results/mail.jsonl. Nothing leaves the machine. It refuses to start with a real key.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const key = process.env.RESEND_API_KEY ?? '';
if (key && !key.startsWith('re_uat_')) {
  throw new Error('mail-catcher: a real RESEND_API_KEY is set; refusing to intercept real mail.');
}
const dir = join(process.cwd(), 'e2e/uat/results');
mkdirSync(dir, { recursive: true });
const file = join(dir, 'mail.jsonl');
const realFetch = globalThis.fetch;
let n = 0;

globalThis.fetch = async function catcher(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  if (url && url.startsWith('https://api.resend.com/')) {
    let body = {};
    try {
      body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    } catch {}
    const id = `uat-${Date.now()}-${++n}`;
    const list = Array.isArray(body) ? body : [body];
    for (const m of list) {
      appendFileSync(
        file,
        JSON.stringify({
          id,
          at: new Date().toISOString(),
          to: m.to, cc: m.cc, bcc: m.bcc, from: m.from, subject: m.subject,
          html: m.html, text: m.text,
          attachments: (m.attachments ?? []).map((a) => a.filename),
        }) + '\n',
      );
    }
    return new Response(JSON.stringify(Array.isArray(body) ? { data: list.map(() => ({ id })) } : { id }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return realFetch(input, init);
};
console.log('[mail-catcher] Resend calls are caught and written to', file);
