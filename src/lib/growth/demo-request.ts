import { z } from 'zod';

/**
 * "BOOK A DEMO" — the pure parts of the public demo request (G-30): the input schema, a small
 * in-memory per-IP rate limiter, and the email the firm receives.
 *
 * The route is `app/api/public/demo-request/route.ts`; the store is `demo_requests` through
 * `src/db/repositories/demo-requests.ts`.
 */

/** A stored request as the Growth screen reads it. Dates are ISO strings. */
export interface DemoRequest {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  message: string | null;
  /** Set once a super admin added the request as a prospect. */
  prospectId: string | null;
  createdAt: string;
}

/** The honeypot field. People never see it; a bot that fills it gets a quiet 200. */
const DEMO_HONEYPOT_FIELD = 'website';

export const demoRequestSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(200),
  company: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(4000).optional().nullable(),
  [DEMO_HONEYPOT_FIELD]: z.string().max(500).optional().nullable(),
});

export type DemoRequestInput = z.infer<typeof demoRequestSchema>;

/** Blank strings become null so the stored row reads plainly. */
export function cleanDemoRequest(input: DemoRequestInput): {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  message: string | null;
} {
  const orNull = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    name: input.name.trim(),
    email: input.email.trim(),
    company: orNull(input.company),
    phone: orNull(input.phone),
    message: orNull(input.message),
  };
}

export function isHoneypotFilled(input: DemoRequestInput): boolean {
  return Boolean(input[DEMO_HONEYPOT_FIELD]?.trim());
}

/**
 * A fixed-window limiter kept in this process's memory. App Runner can run more than one
 * instance, so the real ceiling is `limit` per instance; that is enough to stop a script
 * hammering the form, which is all this is for.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** True when the key may go ahead; counts the hit. */
    take(key: string, now = Date.now()): boolean {
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      if (entry.count >= limit) return false;
      entry.count += 1;
      return true;
    },
  };
}

/** The caller's IP from the proxy headers App Runner and local dev set. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** The notice the firm gets for each request. Reply-To is the person who asked. */
export function demoRequestEmail(row: ReturnType<typeof cleanDemoRequest>): {
  subject: string;
  text: string;
  html: string;
} {
  const lines: Array<[string, string | null]> = [
    ['Name', row.name],
    ['Email', row.email],
    ['Firm', row.company],
    ['Phone', row.phone],
  ];
  const kept = lines.filter((l): l is [string, string] => Boolean(l[1]));
  const subject = `Demo request from ${row.company || row.name}`;
  const text = [
    'A demo request came in from the website.',
    '',
    ...kept.map(([k, v]) => `${k}: ${v}`),
    ...(row.message ? ['', row.message] : []),
    '',
    'It is listed on Growth in VCFO Suite, where you can add it as a prospect.',
  ].join('\n');
  const html = [
    '<p>A demo request came in from the website.</p>',
    `<table>${kept.map(([k, v]) => `<tr><td style="padding-right:12px"><b>${k}</b></td><td>${escapeHtml(v)}</td></tr>`).join('')}</table>`,
    row.message ? `<p style="white-space:pre-wrap">${escapeHtml(row.message)}</p>` : '',
    '<p>It is listed on Growth in VCFO Suite, where you can add it as a prospect.</p>',
  ].join('');
  return { subject, text, html };
}
