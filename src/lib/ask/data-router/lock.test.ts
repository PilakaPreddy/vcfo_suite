import { describe, expect, it } from 'vitest';
import { companiesNamed, documentMatches, lockEngagement } from './lock';

const acme = { id: 'a', slug: 'acme-robotics', companyName: 'Acme Robotics Private Limited' };
const acmeFoods = { id: 'b', slug: 'acme-foods', companyName: 'Acme Foods LLP' };
const kestrel = { id: 'c', slug: 'kestrel', companyName: 'Kestrel Robotics Pvt Ltd' };
const engagements = [acme, acmeFoods, kestrel];

describe('lockEngagement', () => {
  it('locks to the one company a message names', () => {
    expect(lockEngagement({ message: 'Add this as director 2 for Kestrel', engagements })).toEqual({ kind: 'locked', engagement: kestrel });
    expect(lockEngagement({ message: 'file for acme robotics', engagements })).toEqual({ kind: 'locked', engagement: acme });
  });

  it('asks when two companies match', () => {
    const lock = lockEngagement({ message: 'Add this as director 2 for Acme', engagements });
    expect(lock).toEqual({ kind: 'choose', options: [acme, acmeFoods] });
  });

  it('never falls back to the page when the message names a company out of reach', () => {
    const lock = lockEngagement({ message: 'Add this for Zeta Industries', pagePath: '/app/intern/projects/kestrel', engagements });
    expect(lock).toEqual({ kind: 'unknown', mentioned: 'Zeta Industries' });
  });

  it('uses the page, then the only project, then asks', () => {
    expect(lockEngagement({ message: 'Add this as director 2', pagePath: '/app/intern/projects/kestrel/step/pre-15', engagements })).toEqual({ kind: 'locked', engagement: kestrel });
    expect(lockEngagement({ message: 'Add this', engagements: [kestrel] })).toEqual({ kind: 'locked', engagement: kestrel });
    expect(lockEngagement({ message: 'Add this', engagements })).toEqual({ kind: 'unknown', mentioned: null });
  });

  it('never locks to a company outside the scoped list it is given', () => {
    expect(lockEngagement({ message: 'Add this for Zeta', pagePath: '/app/intern/projects/zeta', engagements: [] })).toEqual({ kind: 'unknown', mentioned: 'Zeta' });
    expect(lockEngagement({ message: 'Add this', pagePath: '/app/intern/projects/zeta', engagements: [] })).toEqual({ kind: 'unknown', mentioned: null });
  });
});

describe('companiesNamed', () => {
  it('prefers the whole name over a first word', () => {
    expect(companiesNamed('Acme Foods', engagements)).toEqual([acmeFoods]);
  });
});

describe('documentMatches', () => {
  it('accepts the same company in other words and refuses another', () => {
    expect(documentMatches('ACME ROBOTICS PVT. LTD.', [acme.companyName])).toBe(true);
    expect(documentMatches('Zeta Industries Limited', [acme.companyName])).toBe(false);
    expect(documentMatches('Solstice Energy Private Limited', [acme.companyName, 'Solstice Energy'])).toBe(true);
  });
});
