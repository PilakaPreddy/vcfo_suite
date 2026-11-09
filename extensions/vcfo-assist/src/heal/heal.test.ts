import { describe, expect, it, vi } from 'vitest';
import { resolveField } from './ladder';
import { labelScore, matchT1 } from './fuzzy';
import { buildResolvePayload, profileLeafValues, validChoice } from './payload';
import type { RecipeField, ResolvePayload, ScanResult, ScannedField } from '../shared/types';

let n = 0;
function field(p: Partial<ScannedField>): ScannedField {
  n += 1;
  return {
    uid: `f${n}`,
    tag: 'input',
    type: 'text',
    name: '',
    id: '',
    label: '',
    aria: '',
    placeholder: '',
    som: null,
    css: `#f${n}`,
    visible: true,
    ...p,
  };
}

function scan(fields: ScannedField[], probes: Record<string, string | null> = {}): ScanResult {
  return { url: 'http://127.0.0.1:4318/spice-a.html', host: '127.0.0.1', fields, probes, loginVisible: false, hasGuideBridge: true };
}

const NAME2: RecipeField = { key: 'company.proposedNames.1', label: 'Proposed name 2', name: 'proposedName2', control: 'text' };

/** Sentinel profile, in the spirit of SAFETY.md G9 ("PAN SENTINELA1234Z"). */
const PROFILE = {
  company: { proposedNames: ['SENTINEL ALPHA PRIVATE LIMITED', 'SENTINEL BETA PRIVATE LIMITED'], nicCode: '62011' },
  directors: [{ pan: 'SENTINELA1234Z', email: 'sentinel@example.test', mobile: '9999912345' }],
};

describe('T1 fuzzy rules', () => {
  it('scores digits strictly: "name 2" never matches "name 1"', () => {
    expect(labelScore('Proposed name 2', 'Proposed Name (Option 1)')).toBeLessThan(0.5);
    expect(labelScore('Proposed name 2', 'Proposed Name (Option 2)')).toBeGreaterThan(0.9);
  });

  it('heals a renamed label and name on the drift page', () => {
    const one = field({ name: 'proposedName1', label: 'Proposed name 1' });
    const two = field({ name: 'nameOption2', label: 'Proposed Name (Option 2)' });
    const m = matchT1(NAME2, [one, two]);
    expect(m?.candidate.uid).toBe(two.uid);
    expect(m?.by).toBe('label');
  });

  it('prefers an exact name', () => {
    const a = field({ name: 'proposedName2', label: 'Something else' });
    expect(matchT1(NAME2, [a, field({ label: 'Proposed name 2' })])?.by).toBe('name');
  });

  it('refuses to guess between two equally good labels', () => {
    const a = field({ label: 'Proposed name 2 (English)' });
    const b = field({ label: 'Proposed name 2 (Hindi)' });
    expect(matchT1({ ...NAME2, name: undefined }, [a, b])).toBeNull();
  });

  it('never matches a refused control', () => {
    const secret = field({ label: 'Proposed name 2', refused: { code: 'G2', reason: 'captcha field' } });
    expect(matchT1({ ...NAME2, name: undefined }, [secret])).toBeNull();
  });
});

describe('resolveField', () => {
  it('T0 uses the probe', async () => {
    const two = field({ name: 'proposedName2', label: 'Proposed name 2' });
    const r = await resolveField(NAME2, scan([two], { [NAME2.key]: two.uid }), { claimed: new Set() });
    expect(r).toMatchObject({ found: true, tier: 'T0' });
  });

  it('T0 on a refused control reports the refusal, never fills elsewhere', async () => {
    const cap = field({ name: 'captcha', refused: { code: 'G2', reason: 'captcha field' } });
    const r = await resolveField(NAME2, scan([cap, field({ label: 'Proposed name 2' })], { [NAME2.key]: cap.uid }), { claimed: new Set() });
    expect(r.found).toBe(false);
    expect('refused' in r && r.refused.code).toBe('G2');
  });

  it('T1 when the probe misses (drift)', async () => {
    const two = field({ name: 'nameOption2', label: 'Proposed Name (Option 2)' });
    const resolve = vi.fn();
    const r = await resolveField(NAME2, scan([field({ name: 'proposedName1', label: 'Proposed name 1' }), two], { [NAME2.key]: null }), {
      claimed: new Set(),
      resolve,
    });
    expect(r).toMatchObject({ found: true, tier: 'T1', tokens: 0 });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('T3 when rules fail; the payload carries labels only and no profile value', async () => {
    const fields = [
      field({ name: 'x1', label: 'Applicant reference', options: ['SENTINEL ALPHA PRIVATE LIMITED'] }),
      field({ name: 'x2', label: 'Name you would like (second choice) e.g. SENTINEL BETA PRIVATE LIMITED' }),
      field({ name: 'otp', label: 'Enter OTP', refused: { code: 'G3', reason: 'OTP field' } }),
    ];
    let sent: ResolvePayload | undefined;
    const r = await resolveField(NAME2, scan(fields, {}), {
      claimed: new Set(),
      redactValues: profileLeafValues(PROFILE),
      resolve: async (p) => {
        sent = p;
        return { choice: 1, tier: 'haiku', tokens: 1200 };
      },
    });
    expect(r).toMatchObject({ found: true, tier: 'T3', tokens: 1200, aiCalls: 1 });
    const json = JSON.stringify(sent);
    for (const v of profileLeafValues(PROFILE)) expect(json).not.toContain(v);
    expect(json).not.toContain('SENTINEL');
    expect(json).not.toContain('Enter OTP');
    expect(Object.keys(sent!).sort()).toEqual(['candidates', 'fieldKey', 'fieldLabel']);
    for (const c of sent!.candidates) {
      expect(Object.keys(c).every((k) => ['i', 'label', 'name', 'aria'].includes(k))).toBe(true);
    }
  });

  it.each([
    ['a selector', '#btn-submit'],
    ['a URL', 'https://evil.example/'],
    ['free text', 'click Submit now'],
    ['an out-of-range index', 99],
    ['a negative index', -1],
    ['a fraction', 0.5],
  ])('G10: discards %s and falls to T4', async (_what, choice) => {
    const r = await resolveField(NAME2, scan([field({ label: 'Unrelated' })], {}), {
      claimed: new Set(),
      resolve: async () => ({ choice: choice as never, tier: 'haiku', tokens: 900 }),
    });
    expect(r).toMatchObject({ found: false, tier: 'T4', aiCalls: 1, tokens: 900 });
  });

  it('falls to T4 when the resolver throws', async () => {
    const r = await resolveField(NAME2, scan([field({ label: 'Unrelated' })], {}), {
      claimed: new Set(),
      resolve: async () => {
        throw new Error('503');
      },
    });
    expect(r).toMatchObject({ found: false, tier: 'T4' });
  });
});

describe('payload privacy', () => {
  it('redacts profile values echoed into labels, names and aria labels', () => {
    const values = profileLeafValues(PROFILE);
    const { payload } = buildResolvePayload(NAME2, [
      field({ label: 'Director SENTINELA1234Z', name: 'sentinel@example.test', aria: 'Call 9999912345' }),
    ], values);
    const json = JSON.stringify(payload);
    for (const v of values) expect(json).not.toContain(v);
    expect(json).toContain('[redacted]');
  });

  it('validChoice accepts only integer indexes or null', () => {
    expect(validChoice(null, 3)).toBeNull();
    expect(validChoice(2, 3)).toBe(2);
    expect(validChoice(3, 3)).toBe('invalid');
    expect(validChoice('1', 3)).toBe('invalid');
  });
});
