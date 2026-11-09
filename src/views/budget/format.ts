import { MONTHS, SECTION_LABEL, fyCalendarMonths, type BudgetSection, type BudgetSettings, type BudgetStatus, type SectionStatus } from '@/lib/budget/model';
import type { ChipTone } from '@/components/ui/spectrum-chip';

/** Number and label formats for the budget screens. Amounts use lakh and crore grouping. */

const whole = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '–';
  const r = Math.round(n);
  if (r === 0) return '–';
  const text = whole.format(Math.abs(r));
  return r < 0 ? `(${text})` : text;
}

export function crore(n: number): string {
  if (!Number.isFinite(n)) return '–';
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return `₹${whole.format(Math.round(n))}`;
}

export const people = (n: number): string => (Number.isInteger(Math.round(n * 10) / 10) ? whole.format(Math.round(n)) : oneDecimal.format(n));

export const STATUS_WORD: Record<BudgetStatus, { label: string; tone: ChipTone }> = {
  draft: { label: 'Draft', tone: 'prog' },
  published: { label: 'Waiting for approval', tone: 'teal' },
  approved: { label: 'Approved', tone: 'ok' },
};

export const SECTION_WORD: Record<SectionStatus, { label: string; tone: ChipTone }> = {
  not_started: { label: 'Not started', tone: 'idle' },
  in_progress: { label: 'In progress', tone: 'prog' },
  done: { label: 'Done', tone: 'ok' },
  sent_back: { label: 'Sent back', tone: 'bad' },
};

export const sectionLabel = (s: BudgetSection): string => SECTION_LABEL[s];

export const monthOptions = (settings: Pick<BudgetSettings, 'fyStartMonth'>) => fyCalendarMonths(settings.fyStartMonth).map((m) => ({ value: String(m), label: MONTHS[m - 1] }));

/** The sentence a screen shows for an error code from the API. */
export function errorText(code: string, detail?: unknown): string {
  const d = detail as { issues?: string[]; names?: string[]; name?: string } | null | undefined;
  switch (code) {
    case 'conflict':
      return 'Someone else changed this just now. Their values are showing; enter your change again if it is still needed.';
    case 'budget_locked':
      return 'This budget is locked. Start a revision to change it.';
    case 'forbidden':
      return 'You do not have access to do this.';
    case 'budget_exists':
      return 'This client already has a budget for that year.';
    case 'in_use':
      return `Move the rows off ${d?.names?.join(', ') ?? 'this item'} before removing it.`;
    case 'system_line':
      return `${d?.name ?? 'This line'} is filled by the calculation and cannot be removed. You can rename it.`;
    case 'has_errors':
    case 'section_has_errors':
      return d?.issues?.slice(0, 4).join(' ') ?? 'Correct the errors first.';
    case 'owner_not_on_client':
      return 'Owners must be people on this client.';
    case 'no_rows_found':
    case 'no_sheets_found':
      return 'No budget data was found in that file. Use the template for the layout.';
    case 'file_too_large':
      return 'That file is too large.';
    case 'month_locked':
      return 'That month is submitted or approved on the Variance tab, so it cannot change here. A manager can reopen it.';
    case 'variance_incomplete':
      return (detail as { message?: string } | null)?.message || 'Some lines still need an actual or a reason.';
    case 'not_submitted':
      return 'This month is not waiting for approval.';
    case 'not_approved':
      return 'Only an approved month can be reopened.';
    case 'note_required':
      return 'Write the reason first.';
    default:
      return 'That did not save. Try again.';
  }
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(code);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init?.body && !(init.body instanceof FormData) ? { ...init, headers: { 'Content-Type': 'application/json', ...init.headers } } : init);
  const json = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
  if (!res.ok) throw new ApiError(json.error ?? 'server_error', res.status, json.detail);
  return json as T;
}
