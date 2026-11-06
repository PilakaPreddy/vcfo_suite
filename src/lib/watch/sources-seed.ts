import type { RegArea, RegSourceType } from './types';

/**
 * The official sources Watch knows, from the portal table in the master plan. Feeds are read every
 * 3 hours and pages twice a day. MCA and Income Tax India answer the crawler with 403, and CBIC's
 * portal has no plain list to read, so they are manual sources: staff paste a link or upload the
 * PDF. The GST Council's CGST lists are the readable record of CBIC's papers, and health says when
 * they fall behind. The staff audience is for professional-body notices, which never reach a client.
 * Each source that cannot be read carries the reason staff see on the health list. These were tested
 * once on 6 November 2026 from a laptop, so they are retested from AWS before anything changes.
 */
export interface WatchSourceSeed {
  name: string;
  url: string;
  type: RegSourceType;
  adapter: string | null;
  area: RegArea;
  audience: 'everyone' | 'staff';
  /** Why a person adds this source's updates: shown on the health list. */
  note?: string;
}

/** The alert mailbox has no page, so this stands for it in the sources' unique URL column. */
export const ALERT_MAIL_SOURCE_URL = 'mail:official-alerts';

const FEED_MINUTES = 180;
const PAGE_MINUTES = 720;

const REFUSED = 'The site answers the reader with 403 Access Denied on the list and on robots.txt.';
const SCRIPT_LOADED = 'The list loads through scripts, so the plain page has nothing to read.';

export const everyMinutes = (type: RegSourceType): number => (type === 'feed' ? FEED_MINUTES : PAGE_MINUTES);

export const WATCH_SOURCES: readonly WatchSourceSeed[] = [
  { name: 'RBI notifications', url: 'https://www.rbi.org.in/notifications_rss.xml', type: 'feed', adapter: 'rbi-notifications', area: 'fema', audience: 'everyone' },
  { name: 'RBI press releases', url: 'https://www.rbi.org.in/pressreleases_rss.xml', type: 'feed', adapter: 'rbi-press', area: 'fema', audience: 'everyone' },
  { name: 'SEBI', url: 'https://www.sebi.gov.in/sebirss.xml', type: 'feed', adapter: 'sebi', area: 'securities', audience: 'everyone' },
  { name: 'PIB press releases', url: 'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', type: 'feed', adapter: 'pib', area: 'general', audience: 'everyone' },
  { name: 'CGST notifications', url: 'https://gstcouncil.gov.in/cgst-tax-notification', type: 'page', adapter: 'gst-council-notifications', area: 'gst', audience: 'everyone' },
  { name: 'CGST rate notifications', url: 'https://gstcouncil.gov.in/cgst-rate-notification', type: 'page', adapter: 'gst-council-rates', area: 'gst', audience: 'everyone' },
  { name: 'CGST circulars', url: 'https://gstcouncil.gov.in/cgst-circulars', type: 'page', adapter: 'gst-council-circulars', area: 'gst', audience: 'everyone' },
  { name: 'Income Tax e-filing news', url: 'https://www.incometax.gov.in/iec/foportal/latest-news', type: 'page', adapter: 'income-tax-news', area: 'tax', audience: 'everyone' },
  { name: 'ESIC circulars', url: 'https://www.esic.gov.in/circulars', type: 'page', adapter: 'esic', area: 'labour', audience: 'everyone' },
  { name: 'GST Council press releases', url: 'https://gstcouncil.gov.in/press-release', type: 'page', adapter: 'gst-council', area: 'gst', audience: 'everyone' },
  { name: 'NFRA circulars', url: 'https://nfra.gov.in/document-category/circulars/', type: 'page', adapter: 'nfra', area: 'audit', audience: 'staff' },
  { name: 'ICAI notifications', url: 'https://www.icai.org/category/notifications', type: 'page', adapter: 'icai', area: 'audit', audience: 'staff' },
  { name: 'ICAI announcements', url: 'https://www.icai.org/category/announcements', type: 'page', adapter: 'icai', area: 'audit', audience: 'staff' },
  { name: 'EPFO circulars', url: 'https://www.epfo.gov.in/circulars/', type: 'page', adapter: 'epfo', area: 'labour', audience: 'everyone' },
  { name: 'IBBI circulars', url: 'https://ibbi.gov.in/legal-framework/circulars', type: 'page', adapter: 'ibbi', area: 'insolvency', audience: 'everyone' },
  { name: 'IBBI notifications', url: 'https://ibbi.gov.in/legal-framework/notifications', type: 'page', adapter: 'ibbi', area: 'insolvency', audience: 'everyone' },
  { name: 'DGFT notifications', url: 'https://www.dgft.gov.in/CP/?opt=notification', type: 'page', adapter: 'dgft', area: 'general', audience: 'everyone' },
  { name: 'MCA', url: 'https://www.mca.gov.in/content/mca/global/en/acts-rules/notifications.html', type: 'manual', adapter: null, area: 'mca', audience: 'everyone', note: REFUSED },
  { name: 'Income Tax India', url: 'https://www.incometaxindia.gov.in/communications/notification', type: 'manual', adapter: null, area: 'tax', audience: 'everyone', note: REFUSED },
  { name: 'CBIC tax information', url: 'https://taxinformation.cbic.gov.in/', type: 'manual', adapter: null, area: 'gst', audience: 'everyone', note: 'The list loads through scripts, and the server omits a security certificate the reader needs.' },
  { name: 'GST news and updates', url: 'https://www.gst.gov.in/newsandupdates', type: 'manual', adapter: null, area: 'gst', audience: 'everyone', note: SCRIPT_LOADED },
  { name: 'GST advisories', url: 'https://services.gst.gov.in/services/advisory/advisoryandreleases', type: 'manual', adapter: null, area: 'gst', audience: 'everyone', note: SCRIPT_LOADED },
  { name: 'Telangana commercial taxes', url: 'https://www.tgct.gov.in/tgportal/AllActs/APPT/Gos_Notifications.aspx', type: 'manual', adapter: null, area: 'tax', audience: 'everyone', note: 'Each paper opens only through a page script, so there is no link to read, and the newest row is from 2021.' },
  { name: 'ICSI', url: 'https://www.icsi.edu/home/announcements/', type: 'manual', adapter: null, area: 'mca', audience: 'staff', note: SCRIPT_LOADED },
  { name: 'DPIIT', url: 'https://www.dpiit.gov.in/whats-new', type: 'manual', adapter: null, area: 'fema', audience: 'everyone', note: REFUSED },
  { name: 'Labour Ministry', url: 'https://www.labour.gov.in/whatsnew', type: 'manual', adapter: null, area: 'labour', audience: 'everyone', note: REFUSED },
  { name: 'India Code', url: 'https://www.indiacode.nic.in/', type: 'manual', adapter: null, area: 'general', audience: 'everyone', note: REFUSED },
  { name: 'eGazette', url: 'https://egazette.gov.in/', type: 'manual', adapter: null, area: 'general', audience: 'everyone', note: 'The server omits a security certificate the reader needs, so no connection can be trusted.' },
  { name: 'Finance Ministry', url: 'https://finmin.gov.in/', type: 'manual', adapter: null, area: 'general', audience: 'everyone', note: 'The site gave no response within the time limit.' },
  { name: 'Official alert mail', url: ALERT_MAIL_SOURCE_URL, type: 'email', adapter: null, area: 'general', audience: 'everyone', note: 'Comes through the alert mailbox, or when staff paste an official email.' },
];
