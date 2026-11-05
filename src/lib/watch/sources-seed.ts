import type { RegArea, RegSourceType } from './types';

/**
 * The official sources Watch knows, from the portal table in the master plan. Feeds are read every
 * 3 hours and pages twice a day. MCA and Income Tax India answer the crawler with 403, so they are
 * manual sources: staff paste a link or upload the PDF. The staff audience is for professional-body
 * notices, which never reach a client. Other sources are retested and added in the second release.
 */
export interface WatchSourceSeed {
  name: string;
  url: string;
  type: RegSourceType;
  adapter: string | null;
  area: RegArea;
  audience: 'everyone' | 'staff';
}

const FEED_MINUTES = 180;
const PAGE_MINUTES = 720;

export const everyMinutes = (type: RegSourceType): number => (type === 'feed' ? FEED_MINUTES : PAGE_MINUTES);

export const WATCH_SOURCES: readonly WatchSourceSeed[] = [
  { name: 'RBI notifications', url: 'https://www.rbi.org.in/notifications_rss.xml', type: 'feed', adapter: 'rbi-notifications', area: 'fema', audience: 'everyone' },
  { name: 'RBI press releases', url: 'https://www.rbi.org.in/pressreleases_rss.xml', type: 'feed', adapter: 'rbi-press', area: 'fema', audience: 'everyone' },
  { name: 'SEBI', url: 'https://www.sebi.gov.in/sebirss.xml', type: 'feed', adapter: 'sebi', area: 'securities', audience: 'everyone' },
  { name: 'PIB press releases', url: 'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', type: 'feed', adapter: 'pib', area: 'general', audience: 'everyone' },
  { name: 'CBIC GST central tax', url: 'https://cbic-gst.gov.in/hindi/central-tax-notifications.html', type: 'page', adapter: 'cbic-gst', area: 'gst', audience: 'everyone' },
  { name: 'Income Tax e-filing news', url: 'https://www.incometax.gov.in/iec/foportal/latest-news', type: 'page', adapter: 'income-tax-news', area: 'tax', audience: 'everyone' },
  { name: 'ESIC circulars', url: 'https://www.esic.gov.in/circulars', type: 'page', adapter: 'esic', area: 'labour', audience: 'everyone' },
  { name: 'GST Council press releases', url: 'https://gstcouncil.gov.in/press-release', type: 'page', adapter: 'gst-council', area: 'gst', audience: 'everyone' },
  { name: 'NFRA circulars', url: 'https://nfra.gov.in/document-category/circulars/', type: 'page', adapter: 'nfra', area: 'audit', audience: 'staff' },
  { name: 'ICAI notifications', url: 'https://www.icai.org/category/notifications', type: 'page', adapter: 'icai', area: 'audit', audience: 'staff' },
  { name: 'ICAI announcements', url: 'https://www.icai.org/category/announcements', type: 'page', adapter: 'icai', area: 'audit', audience: 'staff' },
  { name: 'EPFO circulars', url: 'https://www.epfo.gov.in/circulars/', type: 'page', adapter: 'epfo', area: 'labour', audience: 'everyone' },
  { name: 'IBBI circulars', url: 'https://ibbi.gov.in/legal-framework/circulars', type: 'page', adapter: 'ibbi', area: 'insolvency', audience: 'everyone' },
  { name: 'IBBI notifications', url: 'https://ibbi.gov.in/legal-framework/notifications', type: 'page', adapter: 'ibbi', area: 'insolvency', audience: 'everyone' },
  { name: 'MCA', url: 'https://www.mca.gov.in/content/mca/global/en/acts-rules/notifications.html', type: 'manual', adapter: null, area: 'mca', audience: 'everyone' },
  { name: 'Income Tax India', url: 'https://www.incometaxindia.gov.in/communications/notification', type: 'manual', adapter: null, area: 'tax', audience: 'everyone' },
];
