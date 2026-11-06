import { createHash } from 'node:crypto';
import { stripHtml } from '@/lib/notifications/announcements';
import { officialUrl } from './adapters/html';
import { istDay } from './dates';

/**
 * Reads an official alert mail with code only: a raw message from the mailbox, or text a person pasted
 * from their mail app. The sender is only an allowlist check. A forwarded mailbox message must also
 * show the receiving server's pass for that domain, because a From line alone can be typed by anyone.
 * Nothing in the body can widen either check, as the body is data.
 */
const OFFICIAL_MAIL_DOMAINS = ['gov.in', 'nic.in', 'rbi.org.in', 'icai.org', 'icai.in', 'icsi.edu'];
const MAX_MIME_DEPTH = 5;

export interface AlertMail {
  messageId: string;
  sender: string | null;
  subject: string;
  body: string;
  /** The notice itself when the mail links to one on an official host. */
  link: string | null;
  sentOn: string | null;
}

type Headers = Map<string, string[]>;

function splitMessage(raw: string): { headers: Headers; body: string } {
  const [head, ...rest] = raw.split(/\n[ \t]*\n/);
  const headers: Headers = new Map();
  for (const line of (head ?? '').replace(/\n[ \t]+/g, ' ').split('\n')) {
    const match = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1]!.toLowerCase();
    headers.set(name, [...(headers.get(name) ?? []), match[2]!.trim()]);
  }
  return { headers, body: rest.join('\n\n') };
}

const paramOf = (value: string, name: string): string | null => new RegExp(`\\b${name}="?([^";]+)"?`, 'i').exec(value)?.[1] ?? null;

function decoded(bytes: Buffer, charset: string | null): string {
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

const quotedPrintableBytes = (text: string): Buffer =>
  Buffer.from(
    text
      .replace(/=\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})|([\s\S])/g, (_, hex: string | undefined, char: string) => (hex ? String.fromCharCode(parseInt(hex, 16)) : char)),
    'latin1',
  );

function partBody(headers: Headers, body: string, contentType: string): string {
  const encoding = headers.get('content-transfer-encoding')?.[0]?.toLowerCase();
  const charset = paramOf(contentType, 'charset');
  if (encoding === 'base64') return decoded(Buffer.from(body.replace(/\s/g, ''), 'base64'), charset);
  if (encoding === 'quoted-printable') return decoded(quotedPrintableBytes(body), charset);
  return body;
}

/** The first plain and first HTML text in the message. An attachment is never the mail's text. */
function textParts(headers: Headers, body: string, depth = 0): { plain?: string; html?: string } {
  const contentType = headers.get('content-type')?.[0] ?? 'text/plain';
  if (/^multipart\//i.test(contentType) && depth < MAX_MIME_DEPTH) {
    const boundary = paramOf(contentType, 'boundary');
    if (!boundary) return {};
    const parts = body.split(`--${boundary}`).slice(1);
    return parts.reduce<{ plain?: string; html?: string }>((found, part) => {
      if (part.startsWith('--')) return found;
      const inner = splitMessage(part.replace(/^[ \t]*\n/, ''));
      return { ...textParts(inner.headers, inner.body, depth + 1), ...found };
    }, {});
  }
  if (/attachment/i.test(headers.get('content-disposition')?.[0] ?? '')) return {};
  if (/^text\/html/i.test(contentType)) return { html: partBody(headers, body, contentType) };
  if (/^text\/plain/i.test(contentType)) return { plain: partBody(headers, body, contentType) };
  return {};
}

const decodeWords = (value: string): string =>
  value.replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, kind: string, text: string) =>
    decoded(kind.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : quotedPrintableBytes(text.replace(/_/g, ' ')), charset),
  );

/** One clear address or none: a line with two addresses reads as the first and delivers from the last. */
function senderOf(headers: Headers): string | null {
  const from = headers.get('from');
  if (from?.length !== 1) return null;
  const addresses = from[0]!.replace(/"[^"]*"|\([^)]*\)/g, ' ').match(/[^\s<>,;:]+@[^\s<>,;:]+/g) ?? [];
  return addresses.length === 1 ? addresses[0]!.toLowerCase() : null;
}

function officialLink(text: string): string | null {
  const links = [...text.matchAll(/https:\/\/[^\s"'<>)\]]+/g)].flatMap((match) => {
    const url = officialUrl(match[0].replace(/[.,;:]+$/, '').replace(/&amp;/g, '&'), match[0]);
    return url && new URL(url).pathname !== '/' ? [url] : [];
  });
  return links.find((url) => /\.pdf(\?|#|$)/i.test(url)) ?? links[0] ?? null;
}

export function parseAlertMail(raw: string): AlertMail {
  const text = raw.replace(/\r\n?/g, '\n');
  // Text pasted from a mail app can open with a line such as "Forwarded message".
  const start = text.search(/^[\w-]+:[ \t]/m);
  const message = splitMessage(start > 0 ? text.slice(start) : text);
  const parts = textParts(message.headers, message.body);
  const body = (parts.plain?.trim() || stripHtml(parts.html ?? '')).trim();
  const sent = Date.parse(message.headers.get('date')?.[0] ?? message.headers.get('sent')?.[0] ?? '');
  const subject = decodeWords(message.headers.get('subject')?.[0] ?? '').trim();
  return {
    messageId: message.headers.get('message-id')?.[0]?.replace(/[<>]/g, '') || createHash('sha256').update(`${subject}\n${body}`).digest('hex'),
    sender: senderOf(message.headers),
    subject: subject || body.split('\n')[0]!.trim().slice(0, 300),
    body,
    link: officialLink(`${parts.plain ?? ''}\n${parts.html ?? ''}`),
    sentOn: Number.isNaN(sent) ? null : istDay(new Date(sent)),
  };
}

export const onOfficialDomain = (address: string | null): boolean => {
  const domain = address?.split('@')[1];
  return Boolean(domain && OFFICIAL_MAIL_DOMAINS.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`)));
};

/**
 * Whether the receiving server vouches for this sender. Servers add their own result on top, so only
 * the first header counts, and any below it may have been written by the sender.
 */
export function receiverVouches(raw: string, sender: string | null): boolean {
  const domain = sender?.split('@')[1];
  const result = splitMessage(raw.replace(/\r\n?/g, '\n')).headers.get('authentication-results')?.[0];
  if (!domain || !result) return false;
  return result
    .split(';')
    .slice(1)
    .some((clause) => {
      if (!/^\s*(dkim|dmarc|spf)=pass\b/i.test(clause)) return false;
      const signer = /\b(?:header\.d|header\.i|header\.from|smtp\.mailfrom|envelope-from)=@?(?:[^\s@]*@)?([^\s;]+)/i.exec(clause)?.[1]?.toLowerCase();
      return Boolean(signer && (signer === domain || signer.endsWith(`.${domain}`) || domain.endsWith(`.${signer}`)));
    });
}
