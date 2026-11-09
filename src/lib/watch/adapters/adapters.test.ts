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
  it('reads the DGFT table, encodes its file links and drops one commodity\'s trade policy', () => {
    const { items, kept } = listed('dgft', 'dgft.html', 'https://www.dgft.gov.in/CP/?opt=notification');
    expect(items.length).toBe(6);
    expect(items[0]).toMatchObject({ publishedOn: '2026-10-30' });
    expect(items[0]!.title).toMatch(/^Notification 46\/2026-27: Amendment in Export Policy of Agarwood/);
    expect(items.every((item) => item.url.startsWith('https://content.dgft.gov.in/') && !item.url.includes(' '))).toBe(true);
    expect(kept.length).toBeLessThan(items.length);
    expect(kept.every((item) => !/agarwood/i.test(item.title))).toBe(true);
  });

  it('reads the RBI notifications feed with its full text', () => {
    const { items } = listed('rbi-notifications', 'rbi-notifications.xml', 'https://www.rbi.org.in/notifications_rss.xml');
    expect(items.length).toBe(2);
    expect(items[0]!.url).toMatch(/^https:\/\/www\.rbi\.org\.in\//);
    expect(items[0]!.publishedOn).toMatch(/^2026-/);
    expect(items[0]!.body).toBe('');
    expect(items[1]!.body).toMatch(/FEMA 23\(R\)\/\(2\)\/2026-RB/);
  });

  it('drops RBI sanctions list amendments and directions to one named bank', () => {
    const notice = { externalKey: 'k', url: 'https://www.rbi.org.in/a', publishedOn: null };
    expect(noiseReason(adapterFor('rbi-notifications')!, { ...notice, title: 'Implementation of Section 51A of UAPA, 1967: Updates to the Sanctions List' })).toBe('sanctions_list');
    expect(noiseReason(adapterFor('rbi-press')!, { ...notice, title: 'Directions under Section 35A read with Section 56 of the Banking Regulation Act' })).toBe('routine_market_data');
    expect(noiseReason(adapterFor('rbi-notifications')!, { ...notice, title: 'Master Direction on External Commercial Borrowings' })).toBeNull();
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
    expect(items[0]!.publishedOn).toBe('2026-11-05');
  });

  it('reads the PIB feed shape and keeps only compliance ministries', () => {
    const { items, kept } = listed('pib', 'pib.xml', 'https://www.pib.gov.in/RssMain.aspx');
    expect(items.length).toBe(2);
    expect(kept.map((item) => item.title)).toEqual(['Finance Ministry notifies changes to GST return due dates']);
  });

  it('reads the GST Council CGST lists with number, subject and English PDF', () => {
    const notifications = listed('gst-council-notifications', 'gst-council-notifications.html', 'https://gstcouncil.gov.in/cgst-tax-notification').items;
    expect(notifications[0]).toMatchObject({
      title: '11/2025-Central Tax: Seeks to notify Central Goods and Services Tax (Second Amendment) Rules 2025',
      url: 'https://gstcouncil.gov.in/sites/default/files/2025-04/gst-ct-11-2025.pdf',
      publishedOn: null,
      listedMonth: '2025-04',
    });
    const rates = listed('gst-council-rates', 'gst-council-rates.html', 'https://gstcouncil.gov.in/cgst-rate-notification').items;
    expect(rates[0]!.title).toMatch(/^08\/2025-Central Tax \(Rate\): Seeks to amend/);
    expect(rates[0]!.url).toMatch(/ctr08-2025\.pdf$/);
    const circulars = listed('gst-council-circulars', 'gst-council-circulars.html', 'https://gstcouncil.gov.in/cgst-circulars').items;
    expect(circulars[0]).toMatchObject({ publishedOn: '2025-06-24', url: 'https://gstcouncil.gov.in/sites/default/files/2025-07/circular-no-250-2025_1.pdf' });
    expect(circulars[0]!.title).toMatch(/^250\/07\/2025-GST: Reviewing authority/);
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
    expect(items[0]!.title).not.toMatch(/Size:/);
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

  it('reads IBBI notifications, whose link sits in the subject cell', () => {
    const { items } = listed('ibbi', 'ibbi-notifications.html', 'https://ibbi.gov.in/legal-framework/notifications');
    expect(items[2]!.publishedOn).toBe('2026-05-25');
    expect(items[2]!.title).toMatch(/^Notification under sub-section \(2\) of section 1/);
    expect(items[2]!.url).toMatch(/^https:\/\/ibbi\.gov\.in\/uploads\/.+\.pdf$/);
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
