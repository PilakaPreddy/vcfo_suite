import { describe, expect, it } from 'vitest';

import { isHybrid } from '@/data/labour-registers/code-rules';
import { regimeNote, stateByCode } from '@/data/labour-registers/states';
import {
  codeRuleIndex,
  hybridFrom,
  oldestCheck,
  regimeLine,
  resolveCodeRules,
  type CodeRuleRecord,
} from './code-rules';

/**
 * Where a state has got to, code by code.
 *
 * The product used to hold one value per state for this, and the value could not be true of a
 * state at all: the four codes were commenced together and are being notified separately. The
 * case these tests exist for is the one the old shape could not express — a state that has
 * notified under one code and not the other — because that is the ordinary case rather than an
 * edge, and it decides which registers a client owes.
 */

function row(over: Partial<CodeRuleRecord> = {}): CodeRuleRecord {
  return {
    stateCode: 'KA',
    code: 'wages',
    stage: 'notified',
    notifiedOn: '2026-05-08',
    source: 'Karnataka Gazette, Part IVA, 8 May 2026',
    note: '',
    verifiedAt: new Date('2026-11-04T09:30:00.000Z'),
    ...over,
  };
}

describe('which reading governs', () => {
  it('uses the research pass where the firm has recorded nothing', () => {
    const rules = resolveCodeRules('KA');
    expect(rules).toHaveLength(4);
    expect(rules.every((r) => r.fromFirm)).toBe(false);
    expect(rules.find((r) => r.code === 'wages')?.stage).toBe('draft');
  });

  it('takes the firm\'s entry for the one code it was recorded against', () => {
    const rules = resolveCodeRules('KA', codeRuleIndex([row()]));
    expect(rules.find((r) => r.code === 'wages')?.stage).toBe('notified');
    expect(rules.find((r) => r.code === 'wages')?.fromFirm).toBe(true);
    /* The other three are untouched. A state's position under one code says nothing about
       its position under another, which is the whole reason this is per code. */
    expect(rules.find((r) => r.code === 'osh')?.stage).toBe('draft');
    expect(rules.find((r) => r.code === 'osh')?.fromFirm).toBe(false);
  });

  it('reads a state nobody has looked at as unknown, never as none', () => {
    /* "We looked and there are no rules" and "nobody looked" are different answers, and only
       one of them is a reason to stop worrying. */
    const rules = resolveCodeRules('MZ');
    expect(rules.every((r) => r.stage === 'unknown')).toBe(true);
    expect(rules[0].source).toContain('Nobody has looked');
    expect(oldestCheck(rules)).toBe('');
  });

  it('dates an entry by the row, not by anything typed', () => {
    const rules = resolveCodeRules('KA', codeRuleIndex([row()]));
    expect(rules.find((r) => r.code === 'wages')?.lastVerified).toBe('2026-11-04');
  });
});

describe('a split regime', () => {
  it('says which code is notified and which is not', () => {
    /* The sentence one lumped value could not produce. */
    const rules = resolveCodeRules('KA', codeRuleIndex([row({ code: 'wages', stage: 'notified' })]));
    const line = regimeLine(rules);
    expect(line).toContain('Wages Code but not under the OSH Code');
    expect(line).toContain('section 6 of the General Clauses Act 1897');
    expect(hybridFrom(rules)).toBe(true);
  });

  it('stops being hybrid only when both register-bearing codes are notified', () => {
    const both = codeRuleIndex([
      row({ code: 'wages', stage: 'notified' }),
      row({ code: 'osh', stage: 'notified' }),
    ]);
    const rules = resolveCodeRules('KA', both);
    expect(hybridFrom(rules)).toBe(false);
    expect(regimeLine(rules)).toContain('both codes that govern registers');

    /* Social Security still at draft does not make it hybrid: no register in the catalogue
       sits under that code today. */
    expect(rules.find((r) => r.code === 'socialSecurity')?.stage).toBe('draft');
  });

  it('treats an unchecked state as still on its own rules', () => {
    const rules = resolveCodeRules('MZ');
    expect(hybridFrom(rules)).toBe(true);
    expect(regimeLine(rules)).toContain('Nobody has recorded');
  });

  it('agrees with the catalogue-level flag the screens read', () => {
    expect(isHybrid('KA')).toBe(true);
    expect(isHybrid('GJ')).toBe(false);
  });
});

describe('the state note the catalogue screen prints', () => {
  it('comes from the four cells rather than from one value per state', () => {
    expect(regimeNote(stateByCode('GJ')!)).toContain('notified rules under both codes');
    expect(regimeNote(stateByCode('KL')!)).toContain('General Clauses Act 1897');
  });
});
