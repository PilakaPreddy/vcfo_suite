import { describe, expect, it } from 'vitest';
import { DEFAULT_REMINDER_RULES as RULES } from './model';
import { nextReminderDate, reminderDraft, reminderOn, reminderQueue } from './reminder-rule';

// 3 Nov 2026 is a Tuesday; 7 and 8 Nov are the weekend.
const TODAY = '2026-11-03';
const inv = (dueDate: string, over: Partial<{ status: 'open' | 'received'; remindersPausedUntil: string | null }> = {}) => ({
  status: 'open' as const,
  dueDate,
  remindersPausedUntil: null,
  ...over,
});

describe('reminderOn', () => {
  it('fires 5 and 3 days before, on the due date, and every day after', () => {
    expect(reminderOn(inv('2026-11-06'), '2026-11-01', { ...RULES, skipWeekends: false })?.label).toBe('5 days before due');
    expect(reminderOn(inv('2026-11-06'), TODAY, RULES)).toMatchObject({ kind: 'before', daysLeft: 3 });
    expect(reminderOn(inv(TODAY), TODAY, RULES)).toMatchObject({ kind: 'due', label: 'Due today' });
    expect(reminderOn(inv('2026-11-02'), TODAY, RULES)).toMatchObject({ kind: 'overdue', daysLeft: -1, label: '1 day overdue' });
    expect(reminderOn(inv('2026-10-16'), TODAY, RULES)?.label).toBe('18 days overdue');
  });

  it('stays quiet on the other days before due', () => {
    expect(reminderOn(inv('2026-11-07'), TODAY, RULES)).toBeNull(); // 4 days
    expect(reminderOn(inv('2026-11-13'), TODAY, RULES)).toBeNull(); // 10 days
  });

  it('never fires for a received invoice', () => {
    expect(reminderOn(inv('2026-10-16', { status: 'received' }), TODAY, RULES)).toBeNull();
  });

  it('respects a pause up to and including its date', () => {
    const paused = inv('2026-10-15', { remindersPausedUntil: '2026-11-12' });
    expect(reminderOn(paused, TODAY, RULES)).toBeNull();
    expect(reminderOn(paused, '2026-11-12', RULES)).toBeNull();
    expect(reminderOn(paused, '2026-11-13', RULES)?.kind).toBe('overdue');
  });

  it('skips weekends only when the rule says so', () => {
    expect(reminderOn(inv('2026-10-30'), '2026-11-07', RULES)).toBeNull();
    expect(reminderOn(inv('2026-10-30'), '2026-11-07', { ...RULES, skipWeekends: false })?.kind).toBe('overdue');
  });

  it('follows custom rules', () => {
    const rules = { ...RULES, daysBefore: [7], onDueDate: false, dailyAfterDue: false };
    expect(reminderOn(inv('2026-11-10'), TODAY, rules)?.daysLeft).toBe(7);
    expect(reminderOn(inv(TODAY), TODAY, rules)).toBeNull();
    expect(reminderOn(inv('2026-10-16'), TODAY, rules)).toBeNull();
  });
});

describe('nextReminderDate', () => {
  it('finds the next rule day and skips the weekend', () => {
    expect(nextReminderDate(inv('2026-11-13'), TODAY, RULES)).toBe('2026-11-10'); // T-3 (T-5 is Sunday 8 Nov)
    expect(nextReminderDate(inv('2026-10-16'), TODAY, RULES)).toBe(TODAY);
    expect(nextReminderDate(inv('2026-10-16'), TODAY, RULES, true)).toBe('2026-11-04');
    expect(nextReminderDate(inv('2026-11-06'), '2026-11-06', RULES, true)).toBe('2026-11-09'); // Sat and Sun skipped
  });

  it('is null for a received invoice', () => {
    expect(nextReminderDate(inv('2026-10-16', { status: 'received' }), TODAY, RULES)).toBeNull();
  });
});

describe('reminderQueue', () => {
  it('lists only the invoices due a reminder today', () => {
    const list = [inv('2026-10-16'), inv('2026-11-13'), inv('2026-11-08'), inv('2026-10-30', { status: 'received' })];
    expect(reminderQueue(list, TODAY, RULES).map((x) => x.hit.label)).toEqual(['18 days overdue', '5 days before due']);
  });
});

describe('reminderDraft', () => {
  it('addresses the partner by first name and names the invoice', () => {
    const hit = reminderOn(inv('2026-10-16'), TODAY, RULES)!;
    const d = reminderDraft({ clientName: 'Duravant', invoiceNo: 'SC/09/03', amountInr: 6456984, dueDate: '2026-10-16' }, hit, { name: 'Yash Babbar' }, { liveUrl: 'https://x/receivables?invoice=abc', signerName: 'Krishna Tungam' });
    expect(d.subject).toBe('Reminder: Duravant invoice SC/09/03 · 18 days overdue');
    expect(d.text).toContain('Hi Yash,');
    expect(d.text).toContain('₹64,56,984');
    expect(d.text).toContain('16-Oct-26');
    expect(d.text).toContain('https://x/receivables?invoice=abc');
  });
});
