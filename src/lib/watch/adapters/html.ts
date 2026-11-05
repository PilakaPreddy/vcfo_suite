import { assertSafeFeedUrl, stripHtml } from '@/lib/notifications/announcements';

/** Small readers for plain listing pages. Commented-out markup never counts as a listed item. */
export interface HtmlLink {
  href: string;
  text: string;
}

const HREF = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

export const withoutComments = (html: string): string => html.replace(/<!--[\s\S]*?-->/g, ' ');

/** An official absolute URL for a listed link, or null when it leaves the allowlist. */
export function officialUrl(href: string, base: string): string | null {
  try {
    return assertSafeFeedUrl(encodeURI(decodeURI(new URL(href.trim(), base).href))).href;
  } catch {
    return null;
  }
}

export function linksIn(html: string, base: string): HtmlLink[] {
  const links: HtmlLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attr = HREF.exec(match[1]!);
    const href = attr && officialUrl(attr[1] ?? attr[2] ?? attr[3] ?? '', base);
    if (href) links.push({ href, text: stripHtml(match[2]!) });
  }
  return links;
}

export interface TableRow {
  cells: string[];
  links: HtmlLink[][];
}

export function tableRows(html: string, base: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const row of withoutComments(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1]!.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]!);
    if (cells.length > 0) rows.push({ cells: cells.map(stripHtml), links: cells.map((cell) => linksIn(cell, base)) });
  }
  return rows;
}
