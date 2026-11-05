import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { adapterFor } from './index';
import { noiseReason } from '../noise';

const fixture = (name: string): string => readFileSync(path.join(import.meta.dirname, '__fixtures__', name), 'utf8');

function listed(adapterId: string, file: string, base: string) {
  const adapter = adapterFor(adapterId)!;
  const items = adapter.list(fixture(file), base);
  return { adapter, items, kept: items.filter((item) => !noiseReason(adapter, item)) };
}

describe('Watch adapters on saved copies', () => {
  it('reads the RBI notifications feed with its full text', () => {
    const { items } = listed('rbi-notifications', 'rbi-notifications.xml', 'https://www.rbi.org.in/notifications_rss.xml');
    expect(items.length).toBe(2);
    expect(items[0]!.url).toMatch(/^https:\/\/www\.rbi\.org\.in\//);
    expect(items[0]!.publishedOn).toMatch(/^2026-/);
    expect(items[0]!.body).toBe('');
    expect(items[1]!.body).toMatch(/FEMA 23\(R\)\/\(2\)\/2026-RB/);
  });

  it('reads the RBI press feed and drops routine market data', () => {
    const { items, kept, adapter } = listed('rbi-press', 'rbi-press.xml', 'https://www.rbi.org.in/pressreleases_rss.xml');
    expect(items.length).toBeGreaterThan(3);
    expect(noiseReason(adapter, { ...items[0]!, title: 'Money Market Operations as on November 04, 2026' })).toBe('routine_market_data');
    expect(kept.every((item) => !/money market operations/i.test(item.title))).toBe(true);
  });

  it('keeps SEBI circulars, drops enforcement papers and repairs a doubled host', () => {
    const { items, kept } = listed('sebi', 'sebi.xml', 'https://www.sebi.gov.in/sebirss.xml');
    expect(items.length).toBe(18);
    expect(kept.some((item) => /accredited investors/i.test(item.title))).toBe(true);
    expect(kept.every((item) => !item.url.includes('/enforcement/'))).toBe(true);
    expect(items.every((item) => item.url.lastIndexOf('https://') === 0)).toBe(true);
    expect(items[0]!.publishedOn).toBe('2026-11-06');
  });

  it('reads the PIB feed shape and keeps only compliance ministries', () => {
    const { items, kept } = listed('pib', 'pib.xml', 'https://www.pib.gov.in/RssMain.aspx');
    expect(items.length).toBe(2);
    expect(kept.map((item) => item.title)).toEqual(['Finance Ministry notifies changes to GST return due dates']);
  });

  it('reads CBIC notifications with number, date and English PDF', () => {
    const { items } = listed('cbic-gst', 'cbic-gst.html', 'https://cbic-gst.gov.in/hindi/central-tax-notifications.html');
    expect(items[0]).toMatchObject({
      title: 'Notification 27/2022 - Central Tax dated 26.12.2022: Notification under sub-rule (4B) of rule 8 of CGST Rules, 2017',
      url: 'https://cbic-gst.gov.in/pdf/central-tax/ct27-2022.pdf',
      publishedOn: '2022-12-26',
    });
  });

  it('reads Income Tax news with its text and PDF', () => {
    const { items } = listed('income-tax-news', 'income-tax-news.html', 'https://www.incometax.gov.in/iec/foportal/latest-news');
    expect(items.length).toBe(4);
    expect(items[0]!.publishedOn).toBe('2026-11-03');
    expect(items[0]!.url).toMatch(/\.pdf$/);
    expect(items[0]!.title).toMatch(/Notification No\. 139\/2026/);
    expect(items[0]!.body).toMatch(/Rule 189A/);
  });

  it('reads ESIC circulars in English and drops internal divisions', () => {
    const { items, kept } = listed('esic', 'esic.html', 'https://esic.gov.in/circulars');
    expect(items.length).toBeGreaterThan(3);
    expect(items[0]!.title).toMatch(/^Unorganised/);
    expect(items.every((item) => !/[ऀ-ॿ]/.test(item.title))).toBe(true);
    expect(items[0]!.publishedOn).toBe('2026-11-05');
    expect(kept.every((item) => !/^(HRM|Ayush|Vigilance)/.test(item.section ?? ''))).toBe(true);
  });

  it('reads GST Council press releases', () => {
    const { items } = listed('gst-council', 'gst-council.html', 'https://gstcouncil.gov.in/press-release');
    expect(items[0]!.publishedOn).toBe('2026-10-08');
    expect(items[0]!.url).toBe('https://gstcouncil.gov.in/sites/default/files/2026-10/press_release.pdf');
  });

  it('reads NFRA circulars from the government CDN', () => {
    const { items } = listed('nfra', 'nfra.html', 'https://nfra.gov.in/document-category/circulars/');
    expect(items[0]!.publishedOn).toBe('2025-12-16');
    expect(items[0]!.url).toMatch(/^https:\/\/cdnbbsr\.s3waas\.gov\.in\//);
  });

  it('reads ICAI notices and drops routine ones', () => {
    const { items, kept } = listed('icai', 'icai.html', 'https://www.icai.org/category/notifications');
    expect(items.length).toBe(6);
    expect(items[0]!.publishedOn).toBe('2026-10-29');
    expect(items[0]!.title).not.toMatch(/\(29-10-2026\)/);
    expect(kept.length).toBeLessThan(items.length);
  });

  it('reads EPFO circulars and drops training and staff divisions', () => {
    const { items, adapter } = listed('epfo', 'epfo.html', 'https://www.epfo.gov.in/circulars/');
    expect(items[0]!.publishedOn).toBe('2026-03-28');
    expect(items[0]!.section).toBeTruthy();
    expect(noiseReason(adapter, { ...items[0]!, section: 'hrd' })).toBe('internal_division');
    expect(noiseReason(adapter, { ...items[0]!, title: 'Amendments in Section 14AC', section: 'legal' })).toBeNull();
  });

  it('reads IBBI circulars, ignoring commented-out links', () => {
    const { items } = listed('ibbi', 'ibbi.html', 'https://ibbi.gov.in/legal-framework/circulars');
    expect(items[0]!.publishedOn).toBe('2026-10-30');
    expect(items[0]!.title).toMatch(/^Compliance with RERA/);
    expect(items[0]!.url).toMatch(/\.pdf$/);
    expect(items[0]!.title).not.toMatch(/newwindow/);
  });

  it('returns nothing for a page whose layout changed, which raises the alert', () => {
    expect(adapterFor('esic')!.list('<html><body>Maintenance</body></html>', 'https://esic.gov.in/circulars')).toEqual([]);
    expect(adapterFor('rbi-press')!.list('<html></html>', 'https://www.rbi.org.in/')).toEqual([]);
  });

  it('treats a staff-added feed with no adapter as a plain feed', () => {
    expect(adapterFor(null)!.id).toBe('feed');
    expect(adapterFor('nope')).toBeNull();
  });
});
