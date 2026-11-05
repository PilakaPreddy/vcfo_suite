import { describe, expect, it } from 'vitest';

import { assessReadiness, closeSentence, type ReadinessInput } from './readiness';
import { formsFor, monthPeriod } from './catalogue';

const SEPTEMBER = monthPeriod(2026, 9);
const FORMS = formsFor('TG', SEPTEMBER, 'central');

function input(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    forms: FORMS,
    uploads: { paysheet: { rowCount: 422, fileName: 'paysheet.xlsx' }, attendance: { rowCount: 419, fileName: 'att.xlsx' } },
    requiredFields: ['employeeId', 'name', 'basic', 'grossEarnings'],
    mappedFields: ['employeeId', 'name', 'basic', 'grossEarnings'],
    unresolvedValues: 0,
    employees: 422,
    employeesShort: 0,
    overtimeCoverageUnresolved: 0,
    ...over,
  };
}

describe('assessReadiness', () => {
  it('closes a complete period', () => {
    const r = assessReadiness(input());
    expect(r.canClose).toBe(true);
    expect(r.lines.some((l) => l.kind === 'blocked')).toBe(false);
    expect(r.employeesComplete).toBe(422);
  });

  it('counts the registers and the acts the close will produce', () => {
    const r = assessReadiness(input());
    expect(r.registers).toBe(FORMS.length);
    expect(r.acts).toBeGreaterThan(1);
  });

  it('blocks on a missing paysheet, because every wage register needs one', () => {
    const r = assessReadiness(input({ uploads: { attendance: { rowCount: 419, fileName: 'a.xlsx' } } }));
    expect(r.canClose).toBe(false);
    expect(r.lines.find((l) => l.kind === 'blocked')?.text).toContain('No paysheet');
  });

  it('blocks on no attendance when a form carries a day grid, and names the forms', () => {
    const r = assessReadiness(input({ uploads: { paysheet: { rowCount: 422, fileName: 'p.xlsx' } } }));
    expect(r.canClose).toBe(false);
    const blocked = r.lines.find((l) => l.kind === 'blocked');
    expect(blocked?.text).toContain('day grid');
    expect(blocked?.text).toContain('Form');
  });

  it('lets an assumed month through, but says so on the record', () => {
    const r = assessReadiness(input({
      uploads: { paysheet: { rowCount: 422, fileName: 'p.xlsx' } },
      attendanceAssumed: true,
    }));
    expect(r.canClose).toBe(true);
    expect(r.lines.some((l) => l.kind === 'short' && l.text.includes('assumed full'))).toBe(true);
  });

  it('blocks on an unmapped required column', () => {
    const r = assessReadiness(input({ mappedFields: ['employeeId', 'name'] }));
    expect(r.canClose).toBe(false);
    expect(r.lines.find((l) => l.kind === 'blocked')?.text).toContain('2 required columns not mapped');
  });

  it('blocks on an attendance code nobody matched', () => {
    const r = assessReadiness(input({ unresolvedValues: 3 }));
    expect(r.canClose).toBe(false);
    expect(r.lines.find((l) => l.kind === 'blocked')?.text).toContain('3 attendance codes');
  });

  it('blocks when overtime is on and a coverage decision is missing', () => {
    const r = assessReadiness(input({ overtimeCoverageUnresolved: 4 }));
    expect(r.canClose).toBe(false);
    expect(r.lines.find((l) => l.kind === 'blocked')?.text).toContain('minimum wage coverage');
  });


  it('reports short employees without blocking, because that is a judgement call', () => {
    const r = assessReadiness(input({ employeesShort: 2 }));
    expect(r.canClose).toBe(true);
    const short = r.lines.find((l) => l.kind === 'short');
    expect(short?.count).toBe(2);
    expect(short?.fix?.to).toBe('employees');
    expect(r.employeesComplete).toBe(420);
  });

  it('names the optional columns that will print nil, without blocking on them', () => {
    const r = assessReadiness(input({ optionalUnmapped: ['overtimeHours', 'nightShiftAllowance'] }));
    expect(r.canClose).toBe(true);
    const line = r.lines.find((l) => l.text.includes('print nil'));
    expect(line?.text).toContain('Overtime hours');
    expect(line?.kind).toBe('short');
  });

  it('blocks when overtime was worked and nobody decided the minimum wage coverage', () => {
    /* Overtime at twice the ordinary rate applies only where a minimum wage is fixed, so an
       undecided employee would put a figure in the register the firm cannot stand behind. */
    const r = assessReadiness(input({ overtimeCoverageUnresolved: 4 }));
    expect(r.canClose).toBe(false);
    expect(r.lines.find((l) => l.kind === 'blocked')?.text).toContain('minimum wage coverage');
  });
});

describe('closeSentence', () => {
  it('says exactly what the tick commits to', () => {
    const s = closeSentence(assessReadiness(input()), SEPTEMBER);
    expect(s).toContain('2026-09-01');
    expect(s).toContain('2026-09-30');
    expect(s).toContain('422 employees');
    expect(s).toContain('registers under');
  });
});
