import { describe, expect, it } from 'vitest';
import { affectedClients, obligationsNamedIn, type ClientFacts, type UpdateForImpact } from '../affected';

const client = (name: string, facts: Partial<ClientFacts> = {}): ClientFacts => ({
  engagementId: name,
  companyName: name,
  legalForm: 'company',
  gst: false,
  tan: false,
  pf: false,
  esi: false,
  pt: false,
  foreignInvestment: false,
  openObligations: [],
  ...facts,
});

const update = (fields: Partial<UpdateForImpact>): UpdateForImpact => ({ title: 'Update', area: null, act: null, changeType: 'other', summary: null, affects: null, quote: null, ...fields });

const names = (found: ReturnType<typeof affectedClients>) => found.clients.map((row) => row.companyName);

describe('which clients an update touches', () => {
  const clients = [
    client('Gst Co', { gst: true, openObligations: ['gst-gstr-3b'] }),
    client('Filed Co', { gst: true }),
    client('Tds Co', { tan: true }),
    client('Llp Firm', { legalForm: 'llp' }),
    client('Pf Co', { pf: true }),
    client('Abroad Co', { foreignInvestment: true }),
  ];

  it('a named filing touches only clients with it still open, whatever the area says', () => {
    const found = affectedClients(update({ title: 'GSTR-3B due date extended', area: 'gst' }), clients);
    expect(found.basis).toBe('filing');
    expect(names(found)).toEqual(['Gst Co']);
    expect(found.clients[0]!.reason).toContain('open');
  });

  it('with no filing named, the area decides through registrations', () => {
    expect(names(affectedClients(update({ area: 'gst' }), clients))).toEqual(['Gst Co', 'Filed Co']);
    expect(names(affectedClients(update({ area: 'fema' }), clients))).toEqual(['Abroad Co']);
    expect(names(affectedClients(update({ area: 'tax', summary: 'New TDS rate for rent.' }), clients))).toEqual(['Tds Co']);
    expect(names(affectedClients(update({ area: 'labour', summary: 'EPFO wage ceiling revised.' }), clients))).toEqual(['Pf Co']);
  });

  it('every client files income tax', () => {
    expect(names(affectedClients(update({ area: 'tax' }), clients))).toHaveLength(clients.length);
  });

  it('the act separates companies from LLPs', () => {
    const companies = names(affectedClients(update({ area: 'mca', act: 'Companies Act, 2013' }), clients));
    expect(companies).toContain('Gst Co');
    expect(companies).not.toContain('Llp Firm');
    expect(names(affectedClients(update({ area: 'mca', act: 'LLP Act, 2008' }), clients))).toEqual(['Llp Firm']);
  });

  it('says so when client data cannot answer, and a draft touches nobody', () => {
    expect(affectedClients(update({ area: 'securities' }), clients)).toEqual({ basis: 'none', clients: [] });
    expect(affectedClients(update({ area: 'gst', changeType: 'consultation' }), clients)).toEqual({ basis: 'none', clients: [] });
  });

  it('reads form names the way notices write them', () => {
    expect(obligationsNamedIn('Form GSTR 9C and DIR-3 KYC')).toEqual(['gst-gstr-9', 'mca-dir3-kyc']);
    expect(obligationsNamedIn('Form 11 of the LLP Rules')).toEqual(['llp-form-11']);
    expect(obligationsNamedIn('A general note on Form 11.')).toEqual([]);
  });
});
