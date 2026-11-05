import { parseRssOrAtom, stripHtml } from '@/lib/notifications/announcements';
import { firstDateIn, istDay } from '../dates';
import type { ListedItem, SourceAdapter } from '../types';
import { linksIn, officialUrl, tableRows, withoutComments } from './html';

/**
 * One adapter per way a source lists its items, keyed by `announcement_sources.adapter`. A staff-added
 * feed has no adapter and reads as `feed`. Each is tested on a saved copy in `__fixtures__`; a
 * layout change that yields nothing raises the source's `empty` alert rather than silence.
 */
const clean = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** SEBI's feed sometimes repeats its host in front of an already absolute link. */
const lastAbsolute = (link: string): string => link.slice(link.lastIndexOf('https://'));

function feedAdapter(id: string, noise?: SourceAdapter['noise']): SourceAdapter {
  return {
    id,
    noise,
    list(body) {
      return parseRssOrAtom(body).map((item) => ({
        externalKey: item.externalId,
        title: clean(item.title),
        url: lastAbsolute(item.link),
        publishedOn: istDay(item.publishedAt),
        body: item.body,
      }));
    },
  };
}

/** A table with a title cell, a date cell and a link cell, the shape most listing pages share. */
function tableAdapter(
  id: string,
  columns: { title: number; date?: number; link: number | 'any'; rowTitle?: (cells: string[]) => string },
  noise?: SourceAdapter['noise'],
): SourceAdapter {
  return {
    id,
    noise,
    list(body, baseUrl) {
      const items: ListedItem[] = [];
      for (const row of tableRows(body, baseUrl)) {
        const href = (columns.link === 'any' ? row.links.flat() : (row.links[columns.link] ?? []))[0]?.href;
        const title = clean(columns.rowTitle?.(row.cells) ?? row.cells[columns.title] ?? '');
        if (!href || !title) continue;
        items.push({
          externalKey: href,
          title: title.slice(0, 300),
          url: href,
          publishedOn: firstDateIn(row.cells[columns.date ?? -1] ?? ''),
          listedMonth: /\/(\d{4}-\d{2})\//.exec(href)?.[1],
        });
      }
      return items;
    },
  };
}

const RBI_ROUTINE =
  /money market operations|treasury bills?|government stock|state government (securities|stock)|government of india (securities|dated)|variable rate (repo|reverse repo)|reserve money|lending and deposit rates|weekly statistical|scheduled banks|foreign exchange (turnover|reserves)|overnight variable|monetary penalty|imposes? (a )?penalty|cancel(s|led)? (the )?certificate of registration|inflation expectations|consumer confidence|data on|survey/i;

/** SEBI's feed mixes rules with individual enforcement papers, told apart by the link's path. */
function sebiNoise(item: ListedItem): string | null {
  if (/\/enforcement\//.test(item.url) || /^(adjudication|settlement|exemption|recovery)\b|\bappeal no\b/i.test(item.title)) return 'enforcement_paper';
  return null;
}

const PIB_RELEVANT = /\b(tax|gst|cbic|cbdt|customs|finance|company|companies|corporate|mca|rbi|sebi|labour|epfo|esic|compliance|insolvency|audit|fema)\b/i;

const ESIC_INTERNAL = /^(hrm|vigilance|ayush|nta|medical|rajbhasha|e-?i+|administration|finance|budget)/i;
const ESIC_ROUTINE = /^(office order|user manual|office memorandum regarding (transfer|posting))/i;
const EPFO_INTERNAL = /^(pdunass|exam|hrd|hdr|hrm|vigilance|procurement|conference)$/i;
const ICAI_ROUTINE = /\b(exam(ination)?s?|assessment test|eligibility test|quiz|competition|winners?|certificate course|campus|branch|convocation|election|webinar|awards?|brochure|observations of the candidates|skill|batch)\b/i;

const hasHindi = (text: string): boolean => /[ऀ-ॿ]/.test(text);

/** The GST Council's own lists of CGST papers: a number cell, an English PDF cell and a subject cell. */
const gstCouncilList = (id: string, cells: { number: number; link: number; subject: number; date?: number }): SourceAdapter =>
  tableAdapter(id, {
    title: cells.subject,
    date: cells.date,
    link: cells.link,
    rowTitle: (row) => `${clean(row[cells.number] ?? '')}: ${row[cells.subject] ?? ''}`,
  });

const incomeTaxNews: SourceAdapter = {
  id: 'income-tax-news',
  list(body, baseUrl) {
    const items: ListedItem[] = [];
    for (const block of withoutComments(body).split('class="views-row"').slice(1)) {
      const id = /<div id="([\w-]{20,})"/.exec(block)?.[1];
      const paragraph = /<p>([\s\S]*?)<\/p>/.exec(block)?.[1];
      if (!id || !paragraph) continue;
      const text = clean(stripHtml(paragraph.replace(/<a\b[\s\S]*?<\/a>/gi, ' ')));
      if (!text) continue;
      const pdf = linksIn(block, baseUrl).find((link) => /\.pdf(\?|$)/i.test(link.href));
      items.push({
        externalKey: id,
        title: (/^.{20,}?[.;](?=\s+[A-Z]|$)/.exec(text)?.[0] ?? text).slice(0, 300),
        url: pdf?.href ?? `${baseUrl}#${id}`,
        publishedOn: firstDateIn(/up-date">([^<]*)/.exec(block)?.[1] ?? ''),
        body: text,
      });
    }
    return items;
  },
};

const esic: SourceAdapter = {
  id: 'esic',
  noise: (item) => (ESIC_INTERNAL.test(item.section ?? '') || ESIC_ROUTINE.test(item.title) ? 'internal_division' : null),
  list(body, baseUrl) {
    const items: ListedItem[] = [];
    for (const row of tableRows(body, baseUrl)) {
      if (row.cells.length < 6) continue;
      const links = row.links[3] ?? [];
      const link = links.find((l) => !hasHindi(l.text));
      if (!link) continue;
      items.push({
        externalKey: link.href,
        title: clean(link.text).replace(/\s*-\s*PDF\b.*$/i, '').slice(0, 300),
        url: link.href,
        publishedOn: firstDateIn(row.cells[4] ?? '') ?? firstDateIn(row.cells[2] ?? ''),
        section: clean(row.cells[1] ?? ''),
      });
    }
    return items;
  },
};

const epfo: SourceAdapter = {
  id: 'epfo',
  noise: (item) => (EPFO_INTERNAL.test(item.section ?? '') ? 'internal_division' : null),
  list(body, baseUrl) {
    const items: ListedItem[] = [];
    for (const block of body.split('class="download-box"').slice(1)) {
      const title = /class="download-title">([\s\S]*?)<\/h3>/.exec(block)?.[1];
      const href = /<a href="([^"]+)" class="view-pdf-btn"/.exec(block)?.[1];
      const url = href && officialUrl(href, baseUrl);
      if (!title || !url) continue;
      const meta = /class="meta-row">([\s\S]*?)<\/div>/.exec(block)?.[1] ?? '';
      items.push({
        externalKey: url,
        title: clean(stripHtml(title)).slice(0, 300),
        url,
        publishedOn: firstDateIn(stripHtml(meta)),
        section: stripHtml(/data-division="([^"]*)"/.exec(block)?.[1] ?? ''),
      });
    }
    return items;
  },
};

const icai: SourceAdapter = {
  id: 'icai',
  noise: (item) => (ICAI_ROUTINE.test(item.title) ? 'routine_notice' : null),
  list(body, baseUrl) {
    const items: ListedItem[] = [];
    for (const row of body.matchAll(/<li class='list-group-item'>([\s\S]*?)<\/li>/gi)) {
      const link = linksIn(row[1]!, baseUrl)[0];
      if (!link?.text) continue;
      const dated = /^(.*?)\s*-\s*\((\d{2}-\d{2}-\d{4})\)\s*$/.exec(link.text);
      items.push({
        externalKey: link.href,
        title: clean(dated?.[1] ?? link.text).slice(0, 300),
        url: link.href,
        publishedOn: dated ? firstDateIn(dated[2]!) : null,
      });
    }
    return items;
  },
};

const ADAPTERS: readonly SourceAdapter[] = [
  feedAdapter('feed'),
  feedAdapter('rbi-notifications'),
  feedAdapter('rbi-press', (item) => (RBI_ROUTINE.test(item.title) ? 'routine_market_data' : null)),
  feedAdapter('sebi', sebiNoise),
  feedAdapter('pib', (item) => (PIB_RELEVANT.test(item.title) ? null : 'not_a_compliance_ministry')),
  gstCouncilList('gst-council-notifications', { number: 1, link: 2, subject: 4 }),
  gstCouncilList('gst-council-rates', { number: 0, link: 1, subject: 3 }),
  gstCouncilList('gst-council-circulars', { number: 1, link: 2, subject: 4, date: 3 }),
  incomeTaxNews,
  esic,
  tableAdapter('gst-council', { title: 2, date: 1, link: 2, rowTitle: (cells) => (cells[2] ?? '').replace(/\(Size:[^)]*\)/i, '') }),
  tableAdapter('nfra', { title: 0, date: 1, link: 2 }),
  icai,
  epfo,
  tableAdapter('ibbi', { title: 2, date: 1, link: 'any' }),
];

export function adapterFor(id: string | null): SourceAdapter | null {
  return ADAPTERS.find((adapter) => adapter.id === (id ?? 'feed')) ?? null;
}
