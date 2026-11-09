import { describe, expect, it } from 'vitest';
import { titleWithPeriod } from './period-title';

describe('titleWithPeriod', () => {
  it('joins a name and a month period', () => {
    expect(titleWithPeriod('GSTR-3B', 'Oct 2026')).toBe('GSTR-3B · Oct 2026');
  });

  it('does not repeat a name the period label already starts with', () => {
    expect(titleWithPeriod('Advance Tax Payment Q4', 'Advance Tax Payment Q4 2026')).toBe('Advance Tax Payment Q4 2026');
    expect(titleWithPeriod('Form MGT-7', 'form mgt-7 FY 2025-26')).toBe('form mgt-7 FY 2025-26');
  });

  it('keeps a period label that names the form differently', () => {
    expect(titleWithPeriod('Income Tax Return Filing', 'ITR FY 2025-26')).toBe('Income Tax Return Filing · ITR FY 2025-26');
  });

  it('falls back to the name when there is no period', () => {
    expect(titleWithPeriod('DPT-3 Filing', null)).toBe('DPT-3 Filing');
    expect(titleWithPeriod('DPT-3 Filing', '  ')).toBe('DPT-3 Filing');
  });
});
