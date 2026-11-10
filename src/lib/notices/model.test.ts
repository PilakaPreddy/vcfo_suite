import { describe, expect, it } from 'vitest';
import { authorityFromText, dueEscalation, escalationAudience, isOpenStage, looksLikeNotice, noticeLabel } from './model';

const TODAY = '2026-11-10';
const subject = (over: Partial<Parameters<typeof dueEscalation>[0]> = {}) => ({ stage: 'received', responseDueOn: '2026-11-17', lastEscalation: null, lastEscalationDueOn: null, ...over });

describe('dueEscalation', () => {
  it('fires t7 within seven days, t2 within two, and overdue after the date', () => {
    expect(dueEscalation(subject({ responseDueOn: '2026-11-18' }), TODAY)).toBeNull();
    expect(dueEscalation(subject({ responseDueOn: '2026-11-17' }), TODAY)).toBe('t7');
    expect(dueEscalation(subject({ responseDueOn: '2026-11-12' }), TODAY)).toBe('t2');
    expect(dueEscalation(subject({ responseDueOn: '2026-11-10' }), TODAY)).toBe('t2');
    expect(dueEscalation(subject({ responseDueOn: '2026-11-09' }), TODAY)).toBe('overdue');
  });

  it('fires each stage once per due date, and only the stage the case is in after a missed day', () => {
    expect(dueEscalation(subject({ responseDueOn: '2026-11-15', lastEscalation: 't7', lastEscalationDueOn: '2026-11-15' }), TODAY)).toBeNull();
    expect(dueEscalation(subject({ responseDueOn: '2026-11-12', lastEscalation: 't7', lastEscalationDueOn: '2026-11-12' }), TODAY)).toBe('t2');
    expect(dueEscalation(subject({ responseDueOn: '2026-11-01', lastEscalation: 'overdue', lastEscalationDueOn: '2026-11-01' }), TODAY)).toBeNull();
    expect(dueEscalation(subject({ responseDueOn: '2026-11-01' }), TODAY)).toBe('overdue');
  });

  it('starts again when the due date moves', () => {
    expect(dueEscalation(subject({ responseDueOn: '2026-11-16', lastEscalation: 't2', lastEscalationDueOn: '2026-11-11' }), TODAY)).toBe('t7');
  });

  it('never fires without a date or once the reply is submitted or the case closed', () => {
    expect(dueEscalation(subject({ responseDueOn: null }), TODAY)).toBeNull();
    expect(dueEscalation(subject({ stage: 'submitted', responseDueOn: '2026-11-01' }), TODAY)).toBeNull();
    expect(dueEscalation(subject({ stage: 'closed', responseDueOn: '2026-11-01' }), TODAY)).toBeNull();
    expect(isOpenStage('reply_drafted')).toBe(true);
  });

  it('reaches the partner only when overdue', () => {
    expect(escalationAudience('t7')).toEqual(['owner', 'manager']);
    expect(escalationAudience('overdue')).toEqual(['owner', 'manager', 'partner']);
  });
});

describe('recognising a notice', () => {
  it('takes notice wording in names and values', () => {
    expect(looksLikeNotice({ texts: ['SCN_Acme_FY2324.pdf'] })).toBe(true);
    expect(looksLikeNotice({ texts: ['Form GST DRC-01 summary'] })).toBe(true);
    expect(looksLikeNotice({ texts: ['Notice u/s 143(2) of the Income-tax Act'] })).toBe(true);
    expect(looksLikeNotice({ texts: ['Show Cause Notice'] })).toBe(true);
    expect(looksLikeNotice({ texts: ['GST notice March'] })).toBe(true);
    expect(looksLikeNotice({ docType: 'tax_notice', texts: [] })).toBe(true);
  });

  it('leaves meeting notices, a bare "notice" and ordinary files alone', () => {
    expect(looksLikeNotice({ texts: ['Notice of Board Meeting 12 Nov'] })).toBe(false);
    expect(looksLikeNotice({ texts: ['AGM notice 2026'] })).toBe(false);
    expect(looksLikeNotice({ texts: ['notice.pdf'] })).toBe(false);
    expect(looksLikeNotice({ texts: ['invoice 156.pdf', 'rent agreement'] })).toBe(false);
  });

  it('reads the authority from the words', () => {
    expect(authorityFromText('Form GST DRC-01')).toBe('gst');
    expect(authorityFromText('Notice under section 143(2) for Assessment Year 2024-25')).toBe('income_tax');
    expect(authorityFromText('TDS default intimation from TRACES')).toBe('tds');
    expect(authorityFromText('Registrar of Companies, Hyderabad')).toBe('mca');
    expect(authorityFromText('a letter')).toBeNull();
  });

  it('labels a case', () => {
    expect(noticeLabel({ authority: 'gst', section: '73', periodLabel: 'FY 2023-24' })).toBe('GST notice u/s 73 (FY 2023-24)');
    expect(noticeLabel({ authority: 'other', section: null, periodLabel: null })).toBe('Other notice');
  });
});
