import { describe, expect, it, vi } from 'vitest';
import type { AssistProfile } from '@/lib/assist-profile/types';
import { planFilingPatch, FilingRefusal, type FilingFacts } from '@/lib/mca-filing/filing-state';
import {
  canonicalJson,
  dscDate,
  dscDeadlinesToAlert,
  filingReadiness,
  packetChanges,
  packetContent,
  repeatCauses,
  signerReadiness,
  type ReadinessInput,
} from '@/lib/mca-filing/readiness';
import type { KnownSigner } from '@/lib/mca-filing/signers';
import type { AssistAttachmentItem } from '@/lib/mca-filing/types';

vi.mock('server-only', () => ({}));
const { packetHash } = await import('@/lib/mca-filing/packet-hash');

const today = '2026-11-09';
const signer = (over: Partial<KnownSigner> = {}): KnownSigner => ({ id: 'd1', name: 'Asha Rao', email: 'asha@example.com', role: 'director', hasDsc: true, dscExpiry: '2027-06-30', ...over });
const confirmed = { businessUserOn: '2026-11-01', dscAssociatedOn: '2026-11-02' };
const attachment = (over: Partial<AssistAttachmentItem> = {}): AssistAttachmentItem => ({ key: 'office-proof.noc', group: 'office-proof', label: 'NOC', status: 'done', available: true, fileName: 'noc.pdf', size: 10, contentType: 'application/pdf', note: null, ...over });

describe('signer readiness', () => {
  it('is ready only with an email, a DSC valid for 30 days, and both MCA confirmations', () => {
    expect(signerReadiness(signer(), confirmed, today).ready).toBe(true);
    expect(signerReadiness(signer(), undefined, today).items.filter((i) => !i.ok).map((i) => i.key)).toEqual(['business_user', 'dsc_associated']);
    expect(signerReadiness(signer({ email: null }), confirmed, today).items.find((i) => i.key === 'email')?.ok).toBe(false);
  });

  it('names an expired, a soon-lapsing and a missing DSC', () => {
    expect(signerReadiness(signer({ dscExpiry: '2026-11-01' }), confirmed, today).items.find((i) => i.key === 'dsc_expiry')?.text).toMatch(/expired on 2026-11-01/);
    expect(signerReadiness(signer({ dscExpiry: '2026-11-20' }), confirmed, today).items.find((i) => i.key === 'dsc_expiry')?.text).toMatch(/in 11 days/);
    const none = signerReadiness(signer({ hasDsc: false, dscExpiry: null }), confirmed, today);
    expect(none.items.find((i) => i.key === 'dsc')?.ok).toBe(false);
    expect(none.items.some((i) => i.key === 'dsc_expiry')).toBe(false);
  });

  it('reads an older DD/MM/YYYY expiry, and refuses text that is not a date', () => {
    expect(dscDate('30/06/2027')).toBe('2027-06-30');
    expect(dscDate('2027-06-30T00:00:00Z')).toBe('2027-06-30');
    expect(dscDate('next June')).toBeNull();
    expect(signerReadiness(signer({ dscExpiry: 'next June' }), confirmed, today).ready).toBe(false);
  });
});

describe('DSC alerts', () => {
  it('alerts from 15 days before to 7 days after, once a day, and skips a signer with no DSC', () => {
    const signers = [
      signer({ id: 'a', dscExpiry: '2026-11-24' }),
      signer({ id: 'b', dscExpiry: '2026-11-25' }),
      signer({ id: 'c', dscExpiry: '2026-11-02' }),
      signer({ id: 'd', dscExpiry: '2026-11-01' }),
      signer({ id: 'e', hasDsc: false, dscExpiry: '2026-11-10' }),
    ];
    expect(dscDeadlinesToAlert(signers, today, {}).map((d) => d.key)).toEqual(['dsc:a', 'dsc:c']);
    expect(dscDeadlinesToAlert(signers, today, { 'dsc:a': today }).map((d) => d.key)).toEqual(['dsc:c']);
  });
});

describe('remark causes', () => {
  it('turns a cause seen twice into a check, most first, and never counts other', () => {
    const out = repeatCauses(['office_proof', 'name', 'office_proof', 'other', 'other', 'director_kyc', 'director_kyc', 'director_kyc', 'nonsense', null]);
    expect(out.map((c) => [c.cause, c.count])).toEqual([['director_kyc', 3], ['office_proof', 2]]);
    expect(out[0].check).toMatch(/proof copies/);
  });

  it('stores a cause with a remark, and refuses a cause with no remark', () => {
    const facts: FilingFacts = { form: 'spice-part-b', state: 'resubmit', srn: null, srnAt: null, signedUploadedAt: null, paidAt: null, nameApprovedAt: null, reviewedAt: null, remarks: [], hasFreshSignedPdf: false };
    const set = planFilingPatch(facts, { remark: 'Utility bill is older than two months', remarkCause: 'office_proof' }, new Date('2026-11-09T06:00:00Z'), 'Lead');
    expect(set.remarks?.[0]).toMatchObject({ cause: 'office_proof', byName: 'Lead' });
    expect(() => planFilingPatch(facts, { remarkCause: 'office_proof' }, new Date(), 'Lead')).toThrow(FilingRefusal);
  });
});

describe('filing packet', () => {
  const profile = { mcaLogin: { userId: '' }, company: { name: 'Acme' } } as unknown as AssistProfile;
  const content = packetContent(profile, [attachment()], [signer()], [{ key: 'b', label: 'B', stepId: 's' }, { key: 'a', label: 'A', stepId: 's' }]);

  it('hashes the same data the same way whatever the key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    const reordered = { ...content, profile: { company: { name: 'Acme' }, mcaLogin: { userId: '' } } as unknown as AssistProfile };
    expect(packetHash(reordered)).toBe(packetHash(content));
    expect(content.missing).toEqual(['a', 'b']);
  });

  it('keeps no storage key, and names the parts that changed', () => {
    expect(JSON.stringify(content)).not.toMatch(/storage|contentType/);
    const later = { ...content, signers: [{ ...content.signers[0], dscExpiry: '2028-01-01' }] };
    expect(packetChanges(content, later)).toEqual(['signers']);
  });
});

describe('the verdict', () => {
  const ready = signerReadiness(signer(), confirmed, today);
  const base: ReadinessInput = { form: 'spice-part-b', missing: [], attachments: [attachment()], signers: [ready], packet: { frozenVersion: 1, changed: [], portalPdf: false }, causes: [] };

  it('is ready when nothing blocks', () => {
    expect(filingReadiness(base)).toMatchObject({ ready: true, blockers: [], warnings: [] });
  });

  it('blocks Part B on blank values, unstored attachments and signer gaps, but not on MOA and AOA', () => {
    const out = filingReadiness({
      ...base,
      missing: [{ key: 'x', label: 'X', stepId: 's' }, { key: 'y', label: 'Y', stepId: 's', reason: 'not held' }],
      attachments: [attachment({ available: false, label: 'Utility bill' }), attachment({ key: 'moa', group: 'moa', available: false })],
      signers: [signerReadiness(signer({ email: null }), confirmed, today)],
    });
    expect(out.ready).toBe(false);
    expect(out.blockers.map((b) => b.group)).toEqual(['values', 'attachments', 'signers']);
    expect(out.blockers[1].text).toMatch(/1 attachment not stored: Utility bill/);
    expect(out.warnings.map((w) => w.group)).toEqual(['values']);
  });

  it('only warns about signers and ignores attachments on Part A', () => {
    const out = filingReadiness({ ...base, form: 'spice-part-a', attachments: [attachment({ available: false })], signers: [] });
    expect(out.ready).toBe(true);
    expect(out.warnings.map((w) => w.group)).toEqual(['signers']);
  });

  it('warns with no frozen packet, and blocks a change after the freeze once a portal PDF is stored', () => {
    expect(filingReadiness({ ...base, packet: { frozenVersion: null, changed: [], portalPdf: false } }).warnings[0].group).toBe('packet');
    expect(filingReadiness({ ...base, packet: { frozenVersion: 2, changed: ['profile'], portalPdf: false } }).ready).toBe(true);
    const blocked = filingReadiness({ ...base, packet: { frozenVersion: 2, changed: ['profile'], portalPdf: true } });
    expect(blocked.ready).toBe(false);
    expect(blocked.blockers[0].text).toMatch(/since packet 2 \(profile\)/);
  });
});
