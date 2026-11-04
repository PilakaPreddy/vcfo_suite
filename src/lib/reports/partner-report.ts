/**
 * PARTNER REPORT — the one shape behind the Reports page, its PDF download and the scheduled
 * email (G-21).
 *
 * The data is the same `SuperInsights` the page reads (`getSuperFirmInsights`, through
 * `/api/super/insights` in the browser and directly in the PDF route and the job). This module
 * only picks a month and lays the numbers out, so the page and the PDF can never disagree.
 * No money (R-37).
 */
import {
  buildRisks,
  type SuperInsights,
  type SuperMonth,
  type SuperTeamManager,
} from '@/lib/super/super-insights-model';

/** How many months the page's month switch offers. */
const REPORT_MONTHS = 6;

/** The only report kind stored in `saved_reports.kind` for now. */
export const PARTNER_REPORT_KIND = 'partner';

/** `saved_reports.params` for a partner report. `latest` follows the calendar. */
export interface PartnerReportParams {
  month: 'latest' | string;
  /** File format for downloads and scheduled emails (P-225). Absent means PDF. */
  format?: ReportFormat;
}

/** PDF, or a CSV file that Excel opens (there is no XLSX package in the app). */
export const REPORT_FORMATS = ['pdf', 'csv'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
export const REPORT_FORMAT_LABEL: Record<ReportFormat, string> = { pdf: 'PDF', csv: 'Excel (CSV)' };

export const REPORT_SCHEDULES = ['none', 'weekly', 'monthly'] as const;
export type ReportSchedule = (typeof REPORT_SCHEDULES)[number];

export const REPORT_SCHEDULE_LABEL: Record<ReportSchedule, string> = {
  none: 'Not scheduled',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** A saved report as the routes return it (`saved_reports`). Dates are ISO strings. */
export interface SavedReport {
  id: string;
  name: string;
  kind: string;
  params: PartnerReportParams;
  schedule: ReportSchedule;
  recipients: string[];
  lastSentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function asReportSchedule(value: string | null | undefined): ReportSchedule {
  return (REPORT_SCHEDULES as readonly string[]).includes(value ?? '') ? (value as ReportSchedule) : 'none';
}

function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-10" as "October 2026"; "latest" as "Latest month". */
export function monthKeyLabel(key: string): string {
  if (!isMonthKey(key)) return 'Latest month';
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[(m ?? 1) - 1]} ${y}`;
}

export function partnerParams(raw: Record<string, unknown> | null | undefined): PartnerReportParams {
  const month = raw?.month;
  // PDF is the default and is not written out, so older rows and callers read the same.
  return { month: isMonthKey(month) ? month : 'latest', ...(raw?.format === 'csv' ? { format: 'csv' as const } : {}) };
}

export interface ReportNumber {
  k: string;
  v: string | number;
  tone?: 'bad' | 'warn' | 'ok';
}

export function monthNumbers(m: SuperMonth): ReportNumber[] {
  return [
    { k: 'New engagements', v: m.engagementsStarted },
    { k: 'Certificates issued', v: m.certificatesIssued, tone: m.certificatesIssued > 0 ? 'ok' : undefined },
    { k: 'Average days to COI', v: m.avgDaysToCoi === null ? '–' : m.avgDaysToCoi },
    { k: 'Filings due', v: m.filingsDue },
    { k: 'Filed on time', v: m.filedOnTime, tone: m.filedOnTime > 0 ? 'ok' : undefined },
    { k: 'Filed late', v: m.filedLate, tone: m.filedLate > 0 ? 'warn' : undefined },
    { k: 'Overdue, not filed', v: m.overdue, tone: m.overdue > 0 ? 'bad' : undefined },
    { k: 'Still to file', v: m.open },
  ];
}

export function onTimePct(m: Pick<SuperTeamManager, 'filedOnTime' | 'filedLate'>): string {
  const filed = m.filedOnTime + m.filedLate;
  return filed === 0 ? '–' : `${Math.round((m.filedOnTime / filed) * 100)}%`;
}

export function clientLine(insights: Pick<SuperInsights, 'clients'>): string {
  const total = insights.clients.length;
  const incorporating = insights.clients.filter((c) => !c.summary.incorporated).length;
  return `${total} clients in the book: ${incorporating} in incorporation and ${total - incorporating} incorporated.`;
}

/** The months the switch offers, oldest first. */
export function recentMonths(insights: Pick<SuperInsights, 'months'>): SuperMonth[] {
  return insights.months.slice(-REPORT_MONTHS);
}

/**
 * The month a report shows. A fixed key picks that month when the insights still hold it.
 * `latest` is the current month, except that a monthly email goes out for the month just
 * finished, so its reader gets a complete month.
 */
export function pickReportMonth(
  insights: Pick<SuperInsights, 'months'>,
  params: PartnerReportParams,
  opts: { schedule?: ReportSchedule } = {},
): SuperMonth | null {
  const months = insights.months;
  if (months.length === 0) return null;
  if (params.month !== 'latest') return months.find((m) => m.key === params.month) ?? null;
  if (opts.schedule === 'monthly' && months.length > 1) return months[months.length - 2]!;
  return months[months.length - 1]!;
}

export interface PartnerReportManagerRow {
  name: string;
  clients: number;
  onTime: string;
  overdue: number;
  daysToCoi: string;
}

export interface PartnerReportData {
  monthKey: string;
  monthLabel: string;
  generatedAt: string;
  numbers: ReportNumber[];
  clientLine: string;
  managers: PartnerReportManagerRow[];
  risks: Array<{ id: string; title: string; companyName: string }>;
}

/** Everything the PDF prints for one month, from the same insights the page shows. */
export function buildPartnerReport(insights: SuperInsights, month: SuperMonth, now: Date): PartnerReportData {
  return {
    monthKey: month.key,
    monthLabel: month.longLabel,
    generatedAt: insights.generatedAt,
    numbers: monthNumbers(month),
    clientLine: clientLine(insights),
    managers: insights.team.managers.map((m) => ({
      name: m.name,
      clients: m.clients,
      onTime: onTimePct(m),
      overdue: m.overdueFilings + m.overdueSteps,
      daysToCoi: m.avgDaysToCoi === null ? '–' : `${m.avgDaysToCoi} days`,
    })),
    risks: buildRisks(insights, now)
      .slice(0, 4)
      .map((r) => ({ id: r.id, title: r.title, companyName: r.companyName })),
  };
}

export function partnerReportFilename(monthLabel: string): string {
  return `SBC-partner-report-${monthLabel.replace(/\s+/g, '-')}.pdf`;
}
