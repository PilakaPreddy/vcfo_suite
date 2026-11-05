import { describe, expect, it } from 'vitest';
import {
  cleanDemoRequest,
  clientIp,
  createRateLimiter,
  demoRequestEmail,
  demoRequestSchema,
  isHoneypotFilled,
} from './demo-request';

describe('demoRequestSchema', () => {
  it('needs a name and a valid email', () => {
    expect(demoRequestSchema.safeParse({ name: '', email: 'a@b.co' }).success).toBe(false);
    expect(demoRequestSchema.safeParse({ name: 'Asha', email: 'nope' }).success).toBe(false);
    const ok = demoRequestSchema.safeParse({ name: ' Asha ', email: 'Asha@Firm.IN', company: ' ' });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(cleanDemoRequest(ok.data)).toEqual({
        name: 'Asha',
        email: 'asha@firm.in',
        company: null,
        phone: null,
        message: null,
      });
    }
  });

  it('spots a filled honeypot', () => {
    const parsed = demoRequestSchema.parse({ name: 'Bot', email: 'bot@x.io', website: 'http://spam' });
    expect(isHoneypotFilled(parsed)).toBe(true);
    expect(isHoneypotFilled(demoRequestSchema.parse({ name: 'Asha', email: 'a@b.co' }))).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('allows the limit per window, then refuses until the window ends', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.take('ip', 0)).toBe(true);
    expect(limiter.take('ip', 10)).toBe(true);
    expect(limiter.take('ip', 20)).toBe(false);
    expect(limiter.take('other', 20)).toBe(true);
    expect(limiter.take('ip', 1001)).toBe(true);
  });
});

describe('clientIp', () => {
  it('reads the last forwarded address, the one App Runner appended', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('demoRequestEmail', () => {
  it('escapes the message and leaves out empty fields', () => {
    const mail = demoRequestEmail({ name: 'Asha', email: 'a@b.co', company: null, phone: null, message: '<b>hi</b>' });
    expect(mail.subject).toBe('Demo request from Asha');
    expect(mail.html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(mail.text).not.toContain('Firm:');
  });
});
