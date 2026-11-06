import { describe, expect, it } from 'vitest';
import { onOfficialDomain, parseAlertMail, receiverVouches } from '../mail-parse';

const RAW = [
  'Authentication-Results: mx.sbcllp.in; dkim=pass header.d=mca.gov.in; spf=fail smtp.mailfrom=other.example',
  'Received: from mail.mca.gov.in',
  'From: "MCA Alerts" <alerts@mca.gov.in>',
  'Subject: =?UTF-8?B?VGltZSBleHRlbmRlZA==?= for MGT-7',
  'Date: Thu, 05 Nov 2026 22:00:00 +0000',
  'Message-ID: <abc-1@mca.gov.in>',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  'preamble',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'The due date is extended to 31 December 2026 =E2=80=94 see',
  'https://www.mca.gov.in/content/dam/mca/pdf/GC-5-2026.pdf.',
  '--b1',
  'Content-Type: text/html',
  '',
  '<p>Ignored HTML</p>',
  '--b1--',
].join('\r\n');

describe('reading an alert mail', () => {
  it('takes headers, the plain text, an official link and the Indian date', () => {
    const mail = parseAlertMail(RAW);
    expect(mail.messageId).toBe('abc-1@mca.gov.in');
    expect(mail.sender).toBe('alerts@mca.gov.in');
    expect(mail.subject).toBe('Time extended for MGT-7');
    expect(mail.body).toContain('31 December 2026 — see');
    expect(mail.body).not.toContain('Ignored');
    expect(mail.link).toBe('https://www.mca.gov.in/content/dam/mca/pdf/GC-5-2026.pdf');
    expect(mail.sentOn).toBe('2026-11-06');
  });

  it('falls back to HTML, skips an attachment and decodes base64', () => {
    const html = Buffer.from('<p>Extended to <b>31 December 2026</b></p>').toString('base64');
    const raw = [
      'From: a@cbic.gov.in',
      'Subject: S',
      'Content-Type: multipart/mixed; boundary=x',
      '',
      '--x',
      'Content-Type: text/plain',
      'Content-Disposition: attachment; filename=a.txt',
      '',
      'Attached text',
      '--x',
      'Content-Type: text/html',
      'Content-Transfer-Encoding: base64',
      '',
      html,
      '--x--',
    ].join('\n');
    expect(parseAlertMail(raw).body).toBe('Extended to 31 December 2026');
  });

  it('reads text pasted from a mail app, opening line and all', () => {
    const pasted = 'Forwarded message\nFrom: MCA <alerts@mca.gov.in>\nSent: 5 November 2026 10:00\nTo: Team\nSubject: Time extended\n\nMGT-7 may be filed by 31 December 2026.';
    const mail = parseAlertMail(pasted);
    expect(mail).toMatchObject({ sender: 'alerts@mca.gov.in', subject: 'Time extended', body: 'MGT-7 may be filed by 31 December 2026.', link: null, sentOn: '2026-11-05' });
    expect(mail.messageId).toMatch(/^[0-9a-f]{64}$/);
    expect(parseAlertMail(pasted).messageId).toBe(mail.messageId);
  });

  it('keeps only official links with a path, and prefers the PDF', () => {
    const body = 'See https://evil.example/a.pdf and https://www.mca.gov.in/ and https://www.mca.gov.in/notice and https://www.mca.gov.in/n.pdf';
    expect(parseAlertMail(`From: a@mca.gov.in\nSubject: S\n\n${body}`).link).toBe('https://www.mca.gov.in/n.pdf');
    expect(parseAlertMail('From: a@mca.gov.in\nSubject: S\n\nSee https://evil.example/a.pdf').link).toBeNull();
  });
});

describe('who may send one', () => {
  it('allows official domains and their subdomains only', () => {
    expect(onOfficialDomain('a@mca.gov.in')).toBe(true);
    expect(onOfficialDomain('a@rbi.org.in')).toBe(true);
    expect(onOfficialDomain('a@icsi.edu')).toBe(true);
    expect(onOfficialDomain('a@fakegov.in')).toBe(false);
    expect(onOfficialDomain('a@gov.in.evil.example')).toBe(false);
    expect(onOfficialDomain(null)).toBe(false);
  });

  it('refuses a From line that hides another address, or two From lines', () => {
    expect(parseAlertMail('From: alerts@mca.gov.in <x@evil.example>\nSubject: S\n\nB').sender).toBeNull();
    expect(parseAlertMail('From: "alerts@mca.gov.in" <x@evil.example>\nSubject: S\n\nB').sender).toBe('x@evil.example');
    expect(parseAlertMail('From: a@mca.gov.in\nFrom: x@evil.example\nSubject: S\n\nB').sender).toBeNull();
  });
});

describe('the receiving server', () => {
  const headed = (...lines: string[]) => [...lines, 'From: a@mca.gov.in', '', 'Body'].join('\n');

  it('vouches through a passing check aligned with the sender', () => {
    expect(receiverVouches(RAW, 'alerts@mca.gov.in')).toBe(true);
    expect(receiverVouches(headed('Authentication-Results: mx; spf=pass smtp.mailfrom=bounce@mail.mca.gov.in'), 'a@mca.gov.in')).toBe(true);
  });

  it('does not vouch for a failure, another domain or a missing result', () => {
    expect(receiverVouches(headed('Authentication-Results: mx; dkim=fail header.d=mca.gov.in'), 'a@mca.gov.in')).toBe(false);
    expect(receiverVouches(headed('Authentication-Results: mx; dkim=pass header.d=evil.example'), 'a@mca.gov.in')).toBe(false);
    expect(receiverVouches(headed(), 'a@mca.gov.in')).toBe(false);
  });

  it('reads only the top result, as a lower one can be written by the sender', () => {
    const forged = headed('Authentication-Results: mx; dkim=fail header.d=mca.gov.in', 'Authentication-Results: mx; dkim=pass header.d=mca.gov.in');
    expect(receiverVouches(forged, 'a@mca.gov.in')).toBe(false);
  });

  it('does not take a pass written in the server name', () => {
    expect(receiverVouches(headed('Authentication-Results: dkim=pass header.d=mca.gov.in; none'), 'a@mca.gov.in')).toBe(false);
  });
});
