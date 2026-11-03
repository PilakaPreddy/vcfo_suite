import { describe, expect, it } from 'vitest';
import { describeChange, diffPublishForPartners, publishAlertEmail } from './publish-alerts';

/** Phase 8 publish alerts: which invoices of which partner changed between two published versions. */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  partnerId: 'p1',
  clientName: 'Duravant',
  invoiceNo: 'SC/09/03' as string | null,
  amountInr: 6456984,
  status: 'open' as 'open' | 'received',
  dueDate: '2026-10-16',
  ...over,
});

describe('diffPublishForPartners', () => {
  it('finds nothing when nothing the partner sees changed', () => {
    expect(diffPublishForPartners([row()], [row({ amountInr: 6456984.001 })]).size).toBe(0);
  });

  it('reports added, removed and changed invoices per partner', () => {
    const prev = [row(), row({ id: 'inv-2', clientName: 'Acme' }), row({ id: 'inv-3', partnerId: 'p2' })];
    const next = [row({ status: 'received', dueDate: '2026-10-20' }), row({ id: 'inv-3', partnerId: 'p2' }), row({ id: 'inv-4', partnerId: 'p2', clientName: 'Zeta' })];
    const d = diffPublishForPartners(prev, next);
    expect(d.get('p1')).toEqual([
      expect.objectContaining({ invoiceId: 'inv-1', kind: 'changed', fields: ['status', 'dueDate'] }),
      expect.objectContaining({ invoiceId: 'inv-2', kind: 'removed' }),
    ]);
    expect(d.get('p2')).toEqual([expect.objectContaining({ invoiceId: 'inv-4', kind: 'added' })]);
  });

  it('treats a move to another partner as removed for one and added for the other', () => {
    const d = diffPublishForPartners([row()], [row({ partnerId: 'p2' })]);
    expect(d.get('p1')?.[0].kind).toBe('removed');
    expect(d.get('p2')?.[0].kind).toBe('added');
  });

  it('skips invoices with no partner', () => {
    expect(diffPublishForPartners([], [row({ partnerId: null })]).size).toBe(0);
  });

  it('counts every invoice as added on the first publish', () => {
    expect(diffPublishForPartners([], [row(), row({ id: 'inv-2' })]).get('p1')).toHaveLength(2);
  });
});

describe('publishAlertEmail', () => {
  it('lists the changes and links to the partner page, escaping names', () => {
    const changes = diffPublishForPartners([row()], [row({ status: 'received', clientName: 'A <b>&</b> Co' })]).get('p1')!;
    expect(describeChange(changes[0])).toContain('marked received');
    const mail = publishAlertEmail({ partnerName: 'Yash Babbar', clientOrgName: 'Summit Consulting', changes, url: 'https://app.sbctrack.in/receivables' });
    expect(mail.subject).toBe('Receivables updated: one of your invoices changed');
    expect(mail.text).toContain('https://app.sbctrack.in/receivables');
    expect(mail.text).toContain('Dear Yash,');
    expect(mail.html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; Co');
    expect(mail.html).not.toContain('<b>&</b>');
  });
});
