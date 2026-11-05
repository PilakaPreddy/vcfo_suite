import { describe, expect, it } from 'vitest';
import type { SuperInsights, SuperMonth } from '@/lib/super/super-insights-model';
import {
  buildPartnerReport,
  monthKeyLabel,
  partnerParams,
  partnerReportFilename,
  pickReportMonth,
} from './partner-report';
import { isReportDue } from './schedule';

function month(key: string, longLabel: string): SuperMonth {
  return {
    key,
    label: longLabel.slice(0, 3),
    longLabel,
    engagementsStarted: 2,
    certificatesIssued: 1,
    avgDaysToCoi: null,
    filingsDue: 4,
    filedOnTime: 2,
    filedLate: 1,
    overdue: 1,
    open: 0,
  };
}

const insights = {
  generatedAt: '2026-10-29T06:00:00.000Z',
  clients: [],
  registrationTypes: [],
  filings: [],
  months: [month('2026-09', 'September 2026'), month('2026-10', 'October 2026')],
  team: {
    managers: [
      {
        id: 'm1',
        name: 'Pranay',
        email: 'p@x.in',
        status: 'active',
        lastActiveAt: null,
        clients: 3,
        incorporating: 1,
        openSteps: 0,
        overdueSteps: 1,
        approvalsPending: 0,
        attention: 0,
        overdueFilings: 2,
        filedOnTime: 3,
        filedLate: 1,
        avgDaysToCoi: 21,
        leads: [],
      },
    ],
    unassignedLeads: [],
    admins: [],
  },
  adminFeed: [],
} as SuperInsights;

describe('pickReportMonth', () => {
  it('picks a fixed month, or null when the insights no longer hold it', () => {
    expect(pickReportMonth(insights, { month: '2026-09' })?.key).toBe('2026-09');
    expect(pickReportMonth(insights, { month: '2025-01' })).toBeNull();
  });
  it('reads latest as this month, and as last month for a monthly email', () => {
    expect(pickReportMonth(insights, { month: 'latest' })?.key).toBe('2026-10');
    expect(pickReportMonth(insights, { month: 'latest' }, { schedule: 'monthly' })?.key).toBe('2026-09');
  });
});

describe('monthKeyLabel', () => {
  it('reads a month key as words', () => {
    expect(monthKeyLabel('2026-10')).toBe('October 2026');
    expect(monthKeyLabel('latest')).toBe('Latest month');
  });
});

describe('partnerParams', () => {
  it('keeps a valid month key and turns anything else into latest', () => {
    expect(partnerParams({ month: '2026-10' })).toEqual({ month: '2026-10' });
    expect(partnerParams({ month: '2026-13' })).toEqual({ month: 'latest' });
    expect(partnerParams(null)).toEqual({ month: 'latest' });
  });
});

describe('buildPartnerReport', () => {
  it('lays out the same numbers the page shows', () => {
    const data = buildPartnerReport(insights, insights.months[1]!, new Date('2026-10-29T06:00:00Z'), {
      prospects: [
        { stage: 'won', closedAt: '2026-10-12T00:00:00.000Z' },
        { stage: 'lost', closedAt: '2026-09-12T00:00:00.000Z' },
      ],
      targetDays: 30,
    });
    expect(data.monthLabel).toBe('October 2026');
    expect(data.numbers.map((n) => n.k)).toEqual([
      'Active clients',
      'Client movement',
      'Certificates (COI) issued',
      'Average days to COI · target 30',
      'Filings on time (1 late)',
      'Registrations completed',
    ]);
    expect(data.numbers[1]).toEqual({ k: 'Client movement', v: '1 won · 0 lost' });
    expect(data.numbers[4]?.v).toBe('67%');
    expect(data.managers[0]).toEqual({ name: 'Pranay', clients: 3, onTime: '75%', overdue: 3, daysToCoi: '21 days' });
    expect(data.clientLine).toBe('0 clients in the book: 0 in incorporation and 0 incorporated.');
    expect(partnerReportFilename(data.monthLabel)).toBe('SBC-partner-report-October-2026.pdf');
  });
});

describe('isReportDue', () => {
  const now = new Date('2026-11-01T01:30:00Z'); // 07:00 on 1 Nov in India
  it('never sends an unscheduled report', () => {
    expect(isReportDue('none', null, now)).toBe(false);
  });
  it('sends a weekly report after a week', () => {
    expect(isReportDue('weekly', null, now)).toBe(true);
    expect(isReportDue('weekly', new Date('2026-10-25T01:35:00Z'), now)).toBe(true);
    expect(isReportDue('weekly', new Date('2026-10-28T01:30:00Z'), now)).toBe(false);
  });
  it('sends a monthly report once per calendar month in India time', () => {
    expect(isReportDue('monthly', new Date('2026-10-01T01:30:00Z'), now)).toBe(true);
    // 31 Oct 20:00 UTC is already 1 Nov in India, so November has had its send.
    expect(isReportDue('monthly', new Date('2026-10-31T20:00:00Z'), now)).toBe(false);
  });
});

describe('partnerParams format (P-225)', () => {
  it('keeps csv and drops anything else', () => {
    expect(partnerParams({ month: '2026-10', format: 'csv' })).toEqual({ month: '2026-10', format: 'csv' });
    expect(partnerParams({ month: 'latest', format: 'xlsx' })).toEqual({ month: 'latest' });
  });
});
