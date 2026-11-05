import { describe, expect, it } from 'vitest';
import type { Partner, SnapshotRow } from './model';
import { cleanRecipients, contactSuggestions, recipientLists, tidyEmailHtml } from './recipients';

const P = (slug: string, active = true): Partner => ({ id: slug, slug, name: slug.toUpperCase(), email: `${slug}@summit.in`, active });
const PARTNERS = [P('yash'), P('sandeep'), P('gone', false)];
const row = (partnerSlug: string, dueDate: string, status: 'open' | 'received' = 'open') => ({ partnerSlug, dueDate, status }) as SnapshotRow;

describe('recipientLists', () => {
  it('offers last time first, then every active partner, then the overdue ones', () => {
    const lists = recipientLists({
      partners: PARTNERS,
      rows: [row('yash', '2026-10-16'), row('sandeep', '2026-11-14'), row('sandeep', '2026-10-01', 'received')],
      today: '2026-11-03',
      lastSend: { to: [{ name: 'A', email: 'a@x.in' }], cc: [{ name: 'B', email: 'b@x.in' }], bcc: [] },
    });
    expect(lists.map((l) => l.key)).toEqual(['last', 'partners', 'overdue', 'empty']);
    expect(lists[0].cc).toEqual([{ name: 'B', email: 'b@x.in' }]);
    expect(lists[1].to.map((r) => r.email)).toEqual(['yash@summit.in', 'sandeep@summit.in']);
    expect(lists[2].to.map((r) => r.email)).toEqual(['yash@summit.in']);
  });

  it('skips "last time" before the first send', () => {
    expect(recipientLists({ partners: PARTNERS, rows: [], today: '2026-11-03', lastSend: null })[0].key).toBe('partners');
  });
});

describe('cleanRecipients', () => {
  it('drops bad addresses and duplicates across To, Cc and Bcc', () => {
    const r = cleanRecipients({
      to: [{ name: 'Yash', email: 'yash@summit.in' }, { name: 'Bad', email: 'not-an-email' }],
      cc: [{ name: 'Yash again', email: 'YASH@summit.in' }, { name: 'Rakesh', email: 'rakesh@summit.in' }],
      bcc: [{ name: '', email: 'rakesh@summit.in' }, { name: '', email: 'audit@sbcllp.in' }],
    });
    expect(r.to.map((x) => x.email)).toEqual(['yash@summit.in']);
    expect(r.cc.map((x) => x.email)).toEqual(['rakesh@summit.in']);
    expect(r.bcc.map((x) => x.email)).toEqual(['audit@sbcllp.in']);
    expect(r.invalid).toEqual(['not-an-email']);
  });
});

describe('contactSuggestions', () => {
  it('lists active partners and past recipients once', () => {
    const c = contactSuggestions(PARTNERS, { to: [{ name: 'Yash', email: 'yash@summit.in' }], cc: [{ name: 'Rakesh', email: 'rakesh@summit.in' }], bcc: [] });
    expect(c.map((x) => x.email)).toEqual(['yash@summit.in', 'sandeep@summit.in', 'rakesh@summit.in']);
  });
});

describe('tidyEmailHtml', () => {
  it('removes scripts and inline handlers but keeps the tables', () => {
    expect(tidyEmailHtml('<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:x">l</a><table><tr><td>1</td></tr></table>')).toBe('<p>Hi</p><a href="x">l</a><table><tr><td>1</td></tr></table>');
  });
});
